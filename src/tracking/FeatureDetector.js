export function detectFeatures(pyramid, options = {}) {
  const {
    maxFeatures = 140,
    minDistance = 8,
    border = 4,
    thresholdRatio = 0.02,
  } = options;

  const { width: w, height: h, data } = pyramid[0];

  if (w < 24 || h < 24) {
    return [];
  }

  const n = w * h;
  const ix = new Float32Array(n);
  const iy = new Float32Array(n);

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      ix[i] = (data[i + 1] - data[i - 1]) * 0.5;
      iy[i] = (data[i + w] - data[i - w]) * 0.5;
    }
  }

  const A = new Float32Array(n);
  const B = new Float32Array(n);
  const C = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    A[i] = ix[i] * ix[i];
    B[i] = ix[i] * iy[i];
    C[i] = iy[i] * iy[i];
  }

  const blurRadius = 2;
  const Ab = boxBlur(A, w, h, blurRadius);
  const Bb = boxBlur(B, w, h, blurRadius);
  const Cb = boxBlur(C, w, h, blurRadius);

  const score = new Float32Array(n);
  const k = 0.04;
  let maxScore = 0;

  for (let i = 0; i < n; i += 1) {
    const trace = Ab[i] + Cb[i];
    const det = Ab[i] * Cb[i] - Bb[i] * Bb[i];
    const s = det - k * trace * trace;
    score[i] = s;

    if (s > maxScore) {
      maxScore = s;
    }
  }

  const threshold = Math.max(1e-6, maxScore * thresholdRatio);
  const candidates = [];

  for (let y = border; y < h - border; y += 2) {
    for (let x = border; x < w - border; x += 2) {
      const i = y * w + x;
      const s = score[i];

      if (s <= threshold) continue;
      if (!isLocalMax(score, w, h, x, y, 3)) continue;

      candidates.push({
        x,
        y,
        score: s,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const features = [];

  for (const candidate of candidates) {
    if (features.length >= maxFeatures) break;

    let tooClose = false;

    for (const feature of features) {
      const dx = feature.x - candidate.x;
      const dy = feature.y - candidate.y;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < minDistance * minDistance) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      features.push({
        x: candidate.x,
        y: candidate.y,
        score: candidate.score,
      });
    }
  }

  return features;
}

function isLocalMax(score, w, h, x, y, radius) {
  const value = score[y * w + x];

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;

      const xx = x + dx;
      const yy = y + dy;

      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;

      if (score[yy * w + xx] >= value) {
        return false;
      }
    }
  }

  return true;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const size = 2 * r + 1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;

      for (let dx = -r; dx <= r; dx += 1) {
        const xx = Math.min(w - 1, Math.max(0, x + dx));
        sum += src[y * w + xx];
      }

      tmp[y * w + x] = sum / size;
    }
  }

  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let sum = 0;

      for (let dy = -r; dy <= r; dy += 1) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        sum += tmp[yy * w + x];
      }

      dst[y * w + x] = sum / size;
    }
  }

  return dst;
}
