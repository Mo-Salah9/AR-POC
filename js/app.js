import {
  TARGETS,
  SCAN_INTERVAL_MS,
  LINK_COOLDOWN_MS,
  MATCHES_REQUIRED,
} from "./config.js";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const detectedEl = document.getElementById("detected");
const openLinkBtn = document.getElementById("open-link");
const loaderEl = document.getElementById("loader");

let worker = null;
let scanTimer = null;
let isScanning = false;
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

function findMatchedTarget(text) {
  const normalized = normalizeArabic(text);
  if (!normalized) return null;

  for (const target of TARGETS) {
    const needle = normalizeArabic(target.text);
    if (needle && normalized.includes(needle)) return target;
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

async function initCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "المتصفح لا يدعم الكاميرا. افتح الموقع عبر http://localhost وليس ملفًا محليًا."
    );
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  }

  video.srcObject = stream;
  await video.play();

  const track = stream.getVideoTracks()[0];
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

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
      if (m.status === "recognizing text") {
        setStatus(`جاري المسح… ${Math.round((m.progress || 0) * 100)}%`);
      }
    },
  });

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
  });

  showLoader(false);
}

/** Grayscale + contrast for clearer Arabic OCR */
function captureProcessedFrame() {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.drawImage(video, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const contrast = 1.4;
  const intercept = 128 * (1 - contrast);

  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const boosted = Math.min(255, Math.max(0, gray * contrast + intercept));
    d[i] = d[i + 1] = d[i + 2] = boosted;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function scanOnce() {
  if (isScanning || video.readyState < 2) return;
  isScanning = true;

  try {
    const frame = captureProcessedFrame();
    const { data } = await worker.recognize(frame);
    const text = (data.text || "").trim();
    const match = findMatchedTarget(text);

    if (text) {
      detectedEl.textContent = `النص المكتشف: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`;
    } else {
      detectedEl.textContent = "";
    }

    if (match) {
      if (lastMatchedTarget?.text === match.text) {
        consecutiveMatches += 1;
      } else {
        consecutiveMatches = 1;
        lastMatchedTarget = match;
      }

      overlay.classList.add("match");
      setStatus(
        `تم رصد «${match.text}» (${consecutiveMatches}/${MATCHES_REQUIRED})…`,
        "success"
      );

      if (consecutiveMatches >= MATCHES_REQUIRED) {
        openTargetLink(match);
      }
    } else {
      consecutiveMatches = 0;
      lastMatchedTarget = null;
      overlay.classList.remove("match");
      openLinkBtn.classList.add("hidden");
      setStatus("المسح جارٍ — وجّه الكاميرا نحو النص");
    }
  } catch (err) {
    console.error(err);
    setStatus("خطأ أثناء المسح. جاري المحاولة مرة أخرى…", "error");
  } finally {
    isScanning = false;
  }
}

function startScanLoop() {
  scanTimer = setInterval(scanOnce, SCAN_INTERVAL_MS);
  scanOnce();
}

async function main() {
  try {
    setStatus("طلب إذن الكاميرا…");
    const label = await initCamera();
    setStatus(`الكاميرا نشطة (${label}) — تحميل OCR…`);

    await initOcr();
    setStatus("المسح جارٍ — وجّه الكاميرا نحو «الرياضيات»");
    startScanLoop();
  } catch (err) {
    console.error(err);
    showLoader(false);
    setStatus(err.message || "تعذر تشغيل التطبيق.", "error");
  }
}

window.addEventListener("beforeunload", () => {
  clearInterval(scanTimer);
  video.srcObject?.getTracks().forEach((t) => t.stop());
  worker?.terminate();
});

main();
