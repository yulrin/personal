const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const APP_WIDTH = 260;
const APP_HEIGHT = 235;
const DATA_PATH = path.join(__dirname, "knit_hamster_data.json");

let hamsterWindow;
let dashboardWindow;
let data = loadData();
let lastActiveApp = "unknown.exe";
let lastIdleSeconds = 0;

function computeActivityLevel(idleSeconds) {
  if (idleSeconds >= 60) return 0;
  return Math.max(0.06, Math.min(1, Math.exp(-idleSeconds / 6.5)));
}

function buildTrackerPayload(mode, activeApp, idleSeconds, day) {
  return {
    mode,
    activeApp,
    color: appColor(activeApp),
    idleSeconds,
    activityLevel: computeActivityLevel(idleSeconds),
    day
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch (_error) {
    return { window: {}, days: {} };
  }
}

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

function ensureToday() {
  const key = todayKey();
  data.days[key] ||= { apps: {}, stitches: [] };
  data.days[key].apps ||= {};
  data.days[key].stitches ||= [];
  return data.days[key];
}

function appColor(appName) {
  let hash = 0;
  for (let index = 0; index < appName.length; index += 1) {
    hash = ((hash << 5) - hash + appName.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  const sat = 62 + (Math.abs(hash >> 8) % 16);
  const light = 52 + (Math.abs(hash >> 16) % 14);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function createHamsterWindow() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const saved = data.window || {};
  const x = Number.isFinite(saved.x) ? saved.x : area.x + area.width - APP_WIDTH - 24;
  const y = Number.isFinite(saved.y) ? saved.y : area.y + area.height - APP_HEIGHT - 24;

  hamsterWindow = new BrowserWindow({
    width: APP_WIDTH,
    height: APP_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  hamsterWindow.setAlwaysOnTop(true, "screen-saver");
  hamsterWindow.loadFile(path.join(__dirname, "renderer.html"));

  hamsterWindow.on("moved", () => {
    const [winX, winY] = hamsterWindow.getPosition();
    data.window = { x: winX, y: winY };
    saveData();
  });
}

function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 390,
    height: 470,
    title: "Knit Hamster Dashboard",
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: "#fffaf1",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  dashboardWindow.loadFile(path.join(__dirname, "dashboard.html"));
}

function readForegroundApp(callback) {
  const script = `
$sig = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinApi {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
Add-Type $sig -ErrorAction SilentlyContinue
$hwnd = [WinApi]::GetForegroundWindow()
$pid = 0
[void][WinApi]::GetWindowThreadProcessId($hwnd, [ref]$pid)
if ($pid -gt 0) {
  try { (Get-Process -Id $pid).Path | Split-Path -Leaf } catch { "unknown.exe" }
} else {
  "unknown.exe"
}
`;

  execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true }, (error, stdout) => {
    const value = String(stdout || "").trim().toLowerCase();
    if (!error && value && value !== "unknown.exe" && value !== "electron.exe") {
      lastActiveApp = value;
    }
    callback(lastActiveApp);
  });
}

function readIdleSeconds(callback) {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class IdleTime {
  [StructLayout(LayoutKind.Sequential)]
  struct LASTINPUTINFO {
    public uint cbSize;
    public uint dwTime;
  }
  [DllImport("user32.dll")]
  static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint GetIdleMs() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf(typeof(LASTINPUTINFO));
    GetLastInputInfo(ref lii);
    return ((uint)Environment.TickCount - lii.dwTime);
  }
}
"@
[IdleTime]::GetIdleMs()
`;

  execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true }, (_error, stdout) => {
    const ms = Number.parseInt(String(stdout || "0").trim(), 10);
    callback(Number.isFinite(ms) ? Math.max(0, ms / 1000) : 0);
  });
}

function tick() {
  readForegroundApp((activeApp) => {
    readIdleSeconds((idleSeconds) => {
      const day = ensureToday();
      const isSleeping = idleSeconds >= 60;
      const mode = isSleeping ? "sleeping" : "knitting";
      const color = appColor(activeApp);

      if (!isSleeping) {
        day.apps[activeApp] ||= { seconds: 0, color };
        day.apps[activeApp].seconds += 2;
        day.apps[activeApp].color = color;

        const last = day.stitches[day.stitches.length - 1];
        const now = Date.now();
        if (!last || now - last.at > 5000 || last.app !== activeApp) {
          day.stitches.push({ app: activeApp, color, at: now });
          day.stitches = day.stitches.slice(-160);
        }
      }

      lastIdleSeconds = idleSeconds;
      saveData();
      const payload = buildTrackerPayload(mode, activeApp, idleSeconds, day);
      hamsterWindow?.webContents.send("tracker:update", payload);
      dashboardWindow?.webContents.send("tracker:update", payload);
    });
  });
}

ipcMain.handle("dashboard:open", () => createDashboardWindow());
ipcMain.handle("data:get", () => {
  const mode = lastIdleSeconds >= 60 ? "sleeping" : "knitting";
  return buildTrackerPayload(mode, lastActiveApp, lastIdleSeconds, ensureToday());
});
ipcMain.handle("data:resetToday", () => {
  data.days[todayKey()] = { apps: {}, stitches: [] };
  saveData();
  tick();
});
ipcMain.handle("app:quit", () => app.quit());

app.whenReady().then(() => {
  createHamsterWindow();
  tick();
  setInterval(tick, 2000);
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
