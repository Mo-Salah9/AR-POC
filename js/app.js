import {
  TARGETS,
  SCAN_INTERVAL_MS,
  LINK_COOLDOWN_MS,
  MATCHES_REQUIRED,
} from "./config.js";
import {
  prepareOcrFrame,
  extractArabic,
  collectOcrText,
} from "./ocr-frame.js";

const video = document.getElementById("video");
const ocrCanvas = document.getElementById("ocr-canvas");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const detectedEl = document.getElementById("detected");
const openLinkBtn = document.getElementById("open-link");
const loaderEl = document.getElementById("loader");

let worker = null;
let scanTimer = null;
let isRunning = false;
let isScanning = false;
let mirrorPreview = false;
let lastLinkOpenedAt = 0;
let consecutiveMatches = 0;
let lastMatchedTarget = null;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` ${type}` : ""}`;
}

function showLoader(visible) {
  if (loaderEl) loaderEl.classList.toggle("hidden", !visible);
}

function normalizeArabic(text) {
  return text
    .replace(/\s+/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

function getNeedlesForTarget(target) {
  const needles = new Set();
  const main = normalizeArabic(target.text);
  if (main) needles.add(main);
  if (main.startsWith("ال") && main.length > 3) {
    needles.add(main.slice(2));
  }
  for (const alias of target.aliases || []) {
    const a = normalizeArabic(alias);
    if (a) needles.add(a);
  }
  return needles;
}

function findMatchedTarget(text) {
  const normalized = normalizeArabic(text);
  if (!normalized) return null;

  for (const target of TARGETS) {
    for (const needle of getNeedlesForTarget(target)) {
      if (normalized.includes(needle)) return target;
    }
  }
  return null;
}

function openTargetLink(target) {
  const now = Date.now();
  if (now - lastLinkOpenedAt < LINK_COOLDOWN_MS) return;

  lastLinkOpenedAt = now;
  openLinkBtn.href = target.url;
  openLinkBtn.textContent = target.buttonLabel || "فتح الرابط";
  openLinkBtn.classList.remove("hidden");

  const popup = window.open(target.url, "_blank", "noopener,noreferrer");
  if (popup) {
    setStatus(`تم العثور على «${target.text}» — تم فتح الرابط`, "success");
  } else {
    setStatus(
      `تم العثور على «${target.text}» — اضغط الزر أدناه إذا لم يُفتح الرابط`,
      "success"
    );
  }
}

function updateDetectedDisplay(rawText) {
  const arabic = extractArabic(rawText);
  if (arabic) {
    detectedEl.textContent = `النص المكتشف: ${arabic.slice(0, 100)}${arabic.length > 100 ? "…" : ""}`;
  } else {
    detectedEl.textContent = "ثبّت الكاميرا داخل الإطار وقرّبها من الكلمة…";
  }
}

function isFrontCamera(track) {
  const settings = track.getSettings?.() || {};
  if (settings.facingMode === "user") return true;
  if (settings.facingMode === "environment") return false;
  const label = (track.label || "").toLowerCase();
  return /front|user|selfie|facetime|integrated|webcam/i.test(label);
}

async function initCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "المتصفح لا يدعم الكاميرا. افتح الموقع عبر https أو localhost."
    );
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  }

  video.srcObject = stream;
  await video.play();

  const track = stream.getVideoTracks()[0];
  mirrorPreview = isFrontCamera(track);
  video.classList.toggle("mirror", mirrorPreview);

  return track.label || "الكاميرا";
}

async function initOcr() {
  setStatus("تحميل محرك التعرف على النص (العربية)…");
  showLoader(true);

  worker = await Tesseract.createWorker("ara", 1, {
    logger: (m) => {
      if (m.status === "loading language traineddata") {
        setStatus("تحميل بيانات اللغة العربية…");
      }
      if (m.status === "initializing api") {
        setStatus("تهيئة OCR…");
      }
    },
  });

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
  });

  showLoader(false);
}

async function scanOnce() {
  if (!isRunning || isScanning || video.readyState < 2) return;
  isScanning = true;

  try {
    const { canvas, skipped } = prepareOcrFrame(video, ocrCanvas, mirrorPreview);

    if (skipped) {
      setStatus("الصورة غير واضحة — ثبّت الكاميرا داخل الإطار");
      detectedEl.textContent = "حركة أو ضبابية — انتظر ثانية…";
      return;
    }

    setStatus("جاري المسح…");

    const { data } = await worker.recognize(canvas, { rotateAuto: true });
    const combined = collectOcrText(data);
    const match = findMatchedTarget(combined);

    updateDetectedDisplay(combined);

    if (match) {
      if (lastMatchedTarget?.text === match.text) {
        consecutiveMatches += 1;
      } else {
        consecutiveMatches = 1;
        lastMatchedTarget = match;
      }

      overlay.classList.add("match");
      setStatus(`تم رصد «${match.text}» — جاري الفتح…`, "success");

      if (consecutiveMatches >= MATCHES_REQUIRED) {
        openTargetLink(match);
      }
    } else {
      consecutiveMatches = 0;
      lastMatchedTarget = null;
      overlay.classList.remove("match");
      openLinkBtn.classList.add("hidden");
      setStatus("المسح جارٍ — ضع «رياضيات» داخل الإطار");
    }
  } catch (err) {
    console.error(err);
    setStatus("خطأ أثناء المسح. جاري المحاولة…", "error");
  } finally {
    isScanning = false;
    if (isRunning) {
      scanTimer = setTimeout(scanOnce, SCAN_INTERVAL_MS);
    }
  }
}

function startScanLoop() {
  isRunning = true;
  scanOnce();
}

async function main() {
  try {
    setStatus("طلب إذن الكاميرا…");
    const label = await initCamera();
    setStatus(`الكاميرا نشطة (${label}) — تحميل OCR…`);

    await initOcr();
    setStatus("المسح جارٍ — ضع «رياضيات» داخل الإطار الأخضر");
    startScanLoop();
  } catch (err) {
    console.error(err);
    showLoader(false);
    setStatus(err.message || "تعذر تشغيل التطبيق.", "error");
  }
}

window.addEventListener("beforeunload", () => {
  isRunning = false;
  clearTimeout(scanTimer);
  video.srcObject?.getTracks().forEach((t) => t.stop());
  worker?.terminate();
});

main();
