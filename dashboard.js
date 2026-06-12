const totalTime = document.getElementById("totalTime");
const stateText = document.getElementById("stateText");
const appList = document.getElementById("appList");
const preview = document.getElementById("preview");
const resetBtn = document.getElementById("resetBtn");
const quitBtn = document.getElementById("quitBtn");
const ctx = preview.getContext("2d");

function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${value}s`;
}

function render(payload) {
  const apps = payload.day?.apps || {};
  const stitches = payload.day?.stitches || [];
  const total = Object.values(apps).reduce((sum, app) => sum + (app.seconds || 0), 0);
  totalTime.textContent = formatDuration(total);
  stateText.textContent = payload.mode === "sleeping" ? "졸기" : "뜨개질 중";
  drawPreview(stitches);
  drawAppList(apps);
}

function drawPreview(stitches) {
  ctx.clearRect(0, 0, preview.width, preview.height);
  ctx.fillStyle = "#f7efe2";
  ctx.fillRect(0, 0, preview.width, preview.height);

  stitches.slice(-84).forEach((stitch, index) => {
    const x = 8 + index * 4;
    ctx.fillStyle = stitch.color || "#e86f83";
    ctx.fillRect(x, 10, 4, 28);
  });
}

function drawAppList(apps) {
  appList.innerHTML = "";
  const sorted = Object.entries(apps)
    .sort((a, b) => (b[1].seconds || 0) - (a[1].seconds || 0))
    .slice(0, 12);

  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "app-row";
    empty.textContent = "아직 기록이 없습니다.";
    appList.appendChild(empty);
    return;
  }

  sorted.forEach(([name, info]) => {
    const row = document.createElement("div");
    row.className = "app-row";
    row.innerHTML = `
      <span class="swatch" style="background:${info.color || "#e86f83"}"></span>
      <span>${name}</span>
      <strong>${formatDuration(info.seconds)}</strong>
    `;
    appList.appendChild(row);
  });
}

resetBtn.addEventListener("click", () => {
  window.knitHamster.resetToday();
});

quitBtn.addEventListener("click", () => {
  window.knitHamster.quit();
});

window.knitHamster.onUpdate(render);
window.knitHamster.getData().then(render);
