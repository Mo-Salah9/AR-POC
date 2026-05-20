export const OCR_MIN_WIDTH = 1400;
/** Center crop ratio — focus on the word in the middle of the frame */
export const CROP_RATIO = 0.72;
/** Skip blurry frames (Laplacian variance); lower = accept more frames */
export const MIN_SHARPNESS = 60;

export function measureSharpness(imageData) {
  const { width: w, height: h, data: d } = imageData;
  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = (y * w + x) * 4;
      const c = d[i];
      const lap = Math.abs(
        4 * c - d[i - 4] - d[i + 4] - d[i - w * 4] - d[i + w * 4]
      );
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }

  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;

    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = i;
    }
  }
  return threshold;
}

function toBinaryGrayscale(imageData) {
  const { data: d } = imageData;
  const histogram = new Array(256).fill(0);
  const gray = new Uint8Array(d.length / 4);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    gray[p] = g;
    histogram[g]++;
  }

  const threshold = otsuThreshold(histogram, gray.length);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = gray[p] > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }

  return imageData;
}

/**
 * Crop center of video, upscale, binarize — returns { canvas, sharpness, skipped }.
 * @param {boolean} mirror — match preview flip (front camera only)
 */
export function prepareOcrFrame(video, ocrCanvas, mirror = false) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cropW = Math.floor(vw * CROP_RATIO);
  const cropH = Math.floor(vh * CROP_RATIO);
  const sx = Math.floor((vw - cropW) / 2);
  const sy = Math.floor((vh - cropH) / 2);

  const scale = Math.max(1, OCR_MIN_WIDTH / cropW);
  ocrCanvas.width = Math.floor(cropW * scale);
  ocrCanvas.height = Math.floor(cropH * scale);

  const ctx = ocrCanvas.getContext("2d", { willReadFrequently: true });
  ctx.save();
  if (mirror) {
    ctx.translate(ocrCanvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.filter = "contrast(1.35) brightness(1.05)";
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, ocrCanvas.width, ocrCanvas.height);
  ctx.filter = "none";
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
  const sharpness = measureSharpness(imageData);

  if (sharpness < MIN_SHARPNESS) {
    return { canvas: ocrCanvas, sharpness, skipped: true };
  }

  ctx.putImageData(toBinaryGrayscale(imageData), 0, 0);
  return { canvas: ocrCanvas, sharpness, skipped: false };
}

export function extractArabic(text) {
  return (text.match(/[\u0600-\u06FF]+/g) || []).join(" ").trim();
}

export function collectOcrText(data) {
  const parts = [];
  if (data.text) parts.push(data.text);

  for (const word of data.words || []) {
    if (word.confidence > 20 && word.text) parts.push(word.text);
  }

  for (const line of data.lines || []) {
    if (line.confidence > 20 && line.text) parts.push(line.text);
  }

  return parts.join(" ");
}
