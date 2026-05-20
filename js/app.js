/** Text patterns → URL to open when matched */
const TRIGGERS = [
  { pattern: /kg/i, label: "Kg", url: "https://www.google.com" },
];

const SCAN_INTERVAL_MS = 1500;
const OPEN_COOLDOWN_MS = 8000;
const PREVIEW_SCALE = 0.5;

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const ocrTextEl = document.getElementById("ocrText");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

let stream = null;
let worker = null;
let scanning = false;
let scanTimer = null;
let lastOpenedAt = 0;

const captureCanvas = document.createElement("canvas");
const captureCtx = captureCanvas.getContext("2d", { willReadFrequently: true });

function setStatus(text, kind = "idle") {
  statusEl.textContent = text;
  statusEl.className = `status status--${kind}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findTrigger(text) {
  for (const trigger of TRIGGERS) {
    if (trigger.pattern.test(text)) {
      return trigger;
    }
  }
  return null;
}

function openLink(url, label) {
  const now = Date.now();
  if (now - lastOpenedAt < OPEN_COOLDOWN_MS) {
    return;
  }
  lastOpenedAt = now;
  setStatus(`Found "${label}" — opening link…`, "found");
  window.location.assign(url);
}

async function captureFrame() {
  const w = Math.max(1, Math.floor(video.videoWidth * PREVIEW_SCALE));
  const h = Math.max(1, Math.floor(video.videoHeight * PREVIEW_SCALE));
  captureCanvas.width = w;
  captureCanvas.height = h;
  captureCtx.drawImage(video, 0, 0, w, h);

  const overlayCtx = overlay.getContext("2d");
  overlay.width = video.clientWidth;
  overlay.height = video.clientHeight;
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  return captureCanvas;
}

async function scanOnce() {
  if (!scanning || !worker || video.readyState < 2) {
    return;
  }

  try {
    const frame = await captureFrame();
    const { data } = await worker.recognize(frame);
    const text = (data.text || "").trim();

    ocrTextEl.textContent = text || "—";

    const trigger = findTrigger(text);
    if (trigger) {
      openLink(trigger.url, trigger.label);
    }
  } catch (err) {
    console.error(err);
    setStatus("Scan error — retrying…", "error");
  }
}

function scheduleScan() {
  if (!scanning) return;
  scanTimer = window.setTimeout(async () => {
    await scanOnce();
    scheduleScan();
  }, SCAN_INTERVAL_MS);
}

async function startCamera() {
  setStatus("Starting camera…", "scanning");
  startBtn.disabled = true;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();

    setStatus("Loading OCR…", "scanning");
    worker = await Tesseract.createWorker("eng");
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    });

    scanning = true;
    stopBtn.disabled = false;
    setStatus("Scanning for text (look for Kg)…", "scanning");
    scheduleScan();
  } catch (err) {
    console.error(err);
    const msg =
      err.name === "NotAllowedError"
        ? "Camera permission denied"
        : err.name === "NotFoundError"
          ? "No camera found"
          : "Could not start camera";
    setStatus(msg, "error");
    startBtn.disabled = false;
    stopCamera();
  }
}

function stopCamera() {
  scanning = false;
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  video.srcObject = null;

  if (worker) {
    worker.terminate();
    worker = null;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus("Stopped", "idle");
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);

window.addEventListener("beforeunload", () => {
  stopCamera();
});
