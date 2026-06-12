const pet = document.getElementById("pet");
const statusPill = document.getElementById("statusPill");
const fabricRows = document.getElementById("fabricRows");
const workingYarn = document.getElementById("workingYarn");
const loopA = document.getElementById("loopA");
const loopB = document.getElementById("loopB");
const needleLeft = document.getElementById("needleLeft");
const needleRight = document.getElementById("needleRight");
const yarnHook = document.getElementById("yarnHook");

const SVG_NS = "http://www.w3.org/2000/svg";
const CROSS_X = 132;
const CROSS_Y = 122;
const BASE_CYCLE_MS = 1180;
const IDLE_INPUT_SECONDS = 8;
const FABRIC_COLS = 8;
const FABRIC_CELL = 8;
const FABRIC_START_X = 98;
const FABRIC_START_Y = 120;
const FABRIC_VISIBLE = 56;
const NEEDLE_ORIGIN = `${CROSS_X}px ${CROSS_Y}px`;

const LEFT_NEEDLE = [
  { rotate: -6, tx: 0, ty: 0 },
  { rotate: 11, tx: 8, ty: -7 },
  { rotate: 19, tx: 13, ty: -2 },
  { rotate: 7, tx: 5, ty: 5 },
  { rotate: -6, tx: 0, ty: 0 }
];

const RIGHT_NEEDLE = [
  { rotate: 5, tx: 0, ty: 0 },
  { rotate: -12, tx: -9, ty: 3 },
  { rotate: -21, tx: -14, ty: -4 },
  { rotate: -8, tx: -5, ty: 6 },
  { rotate: 5, tx: 0, ty: 0 }
];

const YARN_PATHS = [
  "M40 183 C72 175 85 143 105 132 C119 124 137 124 154 132 C176 145 194 169 223 168",
  "M40 183 C73 169 94 134 113 124 C123 117 140 116 151 124 C174 138 192 164 223 168",
  "M40 183 C76 166 98 132 118 125 C133 118 150 121 158 132 C178 151 194 167 223 168",
  "M40 183 C72 174 86 144 106 134 C123 128 137 130 151 139 C174 153 195 169 223 168",
  "M40 183 C72 175 85 143 105 132 C119 124 137 124 154 132 C176 145 194 169 223 168"
];

const LOOP_A_PATHS = [
  "M112 124 C118 107 136 107 143 124 C139 139 116 139 112 124",
  "M108 118 C114 98 140 98 148 118 C142 142 112 142 108 118",
  "M106 116 C112 92 146 92 154 118 C146 148 108 148 106 116",
  "M110 120 C116 102 138 102 145 120 C138 138 114 138 110 120",
  "M112 124 C118 107 136 107 143 124 C139 139 116 139 112 124"
];

const LOOP_B_PATHS = [
  "M122 125 C128 111 145 111 151 125 C147 137 126 137 122 125",
  "M118 122 C124 104 150 104 156 122 C150 140 122 140 118 122",
  "M116 120 C122 100 152 100 158 122 C150 144 118 144 116 120",
  "M120 123 C126 108 148 108 154 123 C148 136 124 136 120 123",
  "M122 125 C128 111 145 111 151 125 C147 137 126 137 122 125"
];

let currentPayload = null;
let displayStitches = [];
let cycleProgress = 0;
let lastFrameTime = 0;
let smoothedSpeed = 0.35;
let lastRenderedStitchCount = -1;

function shortAppName(appName) {
  return String(appName || "unknown").replace(/\.exe$/i, "").slice(0, 14);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpFrame(frames, progress) {
  const scaled = progress * (frames.length - 1);
  const index = Math.min(frames.length - 2, Math.floor(scaled));
  const t = scaled - index;
  const from = frames[index];
  const to = frames[index + 1];
  return {
    rotate: lerp(from.rotate, to.rotate, t),
    tx: lerp(from.tx, to.tx, t),
    ty: lerp(from.ty, to.ty, t)
  };
}

function lerpPath(frames, progress) {
  const scaled = progress * (frames.length - 1);
  const index = Math.min(frames.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return index === Math.floor(scaled) && t === 0 ? frames[index] : frames[index + 1];
}

function applyNeedleTransform(node, frame) {
  node.style.transform = `rotate(${frame.rotate}deg) translate(${frame.tx}px, ${frame.ty}px)`;
}

function getTargetSpeed(payload) {
  if (!payload || payload.mode === "sleeping") return 0;
  const activity = payload.activityLevel ?? computeFallbackActivity(payload.idleSeconds ?? 0);
  if ((payload.idleSeconds ?? 0) >= IDLE_INPUT_SECONDS || activity < 0.22) {
    return activity * 0.18;
  }
  return 0.22 + activity * 0.78;
}

function computeFallbackActivity(idleSeconds) {
  if (idleSeconds >= 60) return 0;
  return Math.max(0.06, Math.min(1, Math.exp(-idleSeconds / 6.5)));
}

function updatePetClasses(payload) {
  const sleeping = payload.mode === "sleeping";
  const idle = !sleeping && (
    (payload.idleSeconds ?? 0) >= IDLE_INPUT_SECONDS ||
    (payload.activityLevel ?? 1) < 0.22
  );

  pet.classList.toggle("sleeping", sleeping);
  pet.classList.toggle("idle", idle);
  pet.classList.toggle("knitting", !sleeping && !idle);
}

function syncDisplayStitches(serverStitches) {
  const incoming = serverStitches || [];
  if (incoming.length >= displayStitches.length) {
    displayStitches = incoming.slice(-FABRIC_VISIBLE);
  } else if (incoming.length === 0) {
    displayStitches = [];
  }
}

function fabricCellPosition(index) {
  const row = Math.floor(index / FABRIC_COLS);
  const col = index % FABRIC_COLS;
  return {
    x: FABRIC_START_X + col * FABRIC_CELL,
    y: FABRIC_START_Y + row * FABRIC_CELL
  };
}

function animateStitchTighten(rect, targetX, targetY) {
  const start = performance.now();
  const duration = 420;
  const fromX = CROSS_X - 2;
  const fromY = CROSS_Y + 2;

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const x = lerp(fromX, targetX, eased);
    const y = lerp(fromY, targetY, eased);
    const scale = lerp(1.55, 1, eased);
    rect.setAttribute(
      "transform",
      `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`
    );
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      rect.removeAttribute("transform");
    }
  }

  requestAnimationFrame(step);
}

function drawFabric(stitches, tightenIndex = -1) {
  fabricRows.innerHTML = "";
  const recent = stitches.slice(-FABRIC_VISIBLE);

  recent.forEach((stitch, index) => {
    const { x, y } = fabricCellPosition(index);
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", FABRIC_CELL + 1);
    rect.setAttribute("height", FABRIC_CELL + 1);
    rect.setAttribute("rx", 1);
    rect.setAttribute("fill", stitch.color || "#e86f83");
    fabricRows.appendChild(rect);

    const stitchLine = document.createElementNS(SVG_NS, "path");
    stitchLine.setAttribute(
      "d",
      `M${x + 2} ${y + 2} C${x + 4} ${y + 6} ${x + 6} ${y + 6} ${x + 8} ${y + 2}`
    );
    fabricRows.appendChild(stitchLine);

    if (index === tightenIndex) {
      animateStitchTighten(rect, x, y);
    }
  });
}

function commitVisualStitch() {
  if (!currentPayload || currentPayload.mode === "sleeping") return;
  const color = currentPayload.color || "#e86f83";
  displayStitches.push({
    app: currentPayload.activeApp,
    color,
    at: Date.now()
  });
  displayStitches = displayStitches.slice(-FABRIC_VISIBLE);
  drawFabric(displayStitches, displayStitches.length - 1);
  lastRenderedStitchCount = displayStitches.length;
}

function updateKnitMotion(progress, payload) {
  const left = lerpFrame(LEFT_NEEDLE, progress);
  const right = lerpFrame(RIGHT_NEEDLE, progress);
  applyNeedleTransform(needleLeft, left);
  applyNeedleTransform(needleRight, right);

  workingYarn.setAttribute("d", lerpPath(YARN_PATHS, progress));
  workingYarn.style.strokeDashoffset = String(-52 * progress);
  loopA.setAttribute("d", lerpPath(LOOP_A_PATHS, progress));
  loopB.setAttribute("d", lerpPath(LOOP_B_PATHS, progress));

  const hookScale = 0.72 + Math.sin(progress * Math.PI * 2) * 0.18;
  const hookLift = Math.sin(progress * Math.PI) * -4;
  yarnHook.style.transform = `translate(0, ${hookLift}px) scale(${hookScale})`;

  const loopOpacity = 0.35 + Math.sin(progress * Math.PI) * 0.55;
  loopA.style.opacity = String(loopOpacity);
  loopB.style.opacity = String(Math.max(0.2, loopOpacity - 0.12));

  if (payload) {
    document.documentElement.style.setProperty("--loop-fill", payload.color || "#e86f83");
  }
}

function setPayload(payload) {
  currentPayload = payload;
  document.documentElement.style.setProperty("--app-color", payload.color || "#e86f83");
  updatePetClasses(payload);

  if (payload.mode === "sleeping") {
    statusPill.textContent = "sleeping";
  } else {
    statusPill.textContent = shortAppName(payload.activeApp);
  }

  syncDisplayStitches(payload.day?.stitches || []);
  if (displayStitches.length !== lastRenderedStitchCount) {
    drawFabric(displayStitches);
    lastRenderedStitchCount = displayStitches.length;
  }
}

function animationFrame(now) {
  if (!lastFrameTime) lastFrameTime = now;
  const delta = Math.min(48, now - lastFrameTime);
  lastFrameTime = now;

  const targetSpeed = getTargetSpeed(currentPayload);
  smoothedSpeed = lerp(smoothedSpeed, targetSpeed, 0.12);

  if (currentPayload?.mode === "sleeping") {
    cycleProgress = 0;
    updateKnitMotion(0, currentPayload);
    needleLeft.style.opacity = "0.55";
    needleRight.style.opacity = "0.55";
    loopA.style.opacity = "0.15";
    loopB.style.opacity = "0.1";
    yarnHook.style.opacity = "0.2";
  } else {
    needleLeft.style.opacity = "1";
    needleRight.style.opacity = "1";
    yarnHook.style.opacity = String(smoothedSpeed > 0.22 ? 0.96 : 0.68);

    if (smoothedSpeed > 0.02) {
      const previous = cycleProgress;
      cycleProgress += (delta / BASE_CYCLE_MS) * smoothedSpeed;
      if (cycleProgress >= 1) {
        cycleProgress -= 1;
        if (previous < 1 && smoothedSpeed > 0.08) {
          commitVisualStitch();
        }
      }
    }

    updateKnitMotion(cycleProgress, currentPayload);
  }

  requestAnimationFrame(animationFrame);
}

statusPill.addEventListener("click", (event) => {
  event.stopPropagation();
  window.knitHamster.openDashboard();
});

needleLeft.style.transformOrigin = NEEDLE_ORIGIN;
needleRight.style.transformOrigin = NEEDLE_ORIGIN;
yarnHook.style.transformOrigin = `${CROSS_X}px ${CROSS_Y - 1}px`;

window.knitHamster.onUpdate(setPayload);
window.knitHamster.getData().then(setPayload);
requestAnimationFrame(animationFrame);
