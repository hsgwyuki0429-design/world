import {
  add,
  sub,
  cross,
  dot,
  normalize,
  distance,
} from "../geometry/Math3D.js";

export function extractPlanes(points, options = {}) {
  const {
    maxPlanes = 3,
    minInliers = 12,
    iterations = 80,
    thresholdRatio = 0.03,
    minThreshold = 0.005,
  } = options;

  let remaining = points.map((p) => [...p.position]);
  const planes = [];

  if (remaining.length < minInliers) {
    return planes;
  }

  let seed = 987654321;

  function randomInt(max) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  }

  for (let planeIndex = 0; planeIndex < maxPlanes; planeIndex += 1) {
    if (remaining.length < minInliers) {
      break;
    }

    const scaleValue = estimateScale(remaining);
    const threshold = Math.max(minThreshold, scaleValue * thresholdRatio);

    let best = null;

    for (let iter = 0; iter < iterations; iter += 1) {
      const i1 = randomInt(remaining.length);
      const i2 = randomInt(remaining.length);
      const i3 = randomInt(remaining.length);

      if (i1 === i2 || i1 === i3 || i2 === i3) {
        continue;
      }

      const p1 = remaining[i1];
      const p2 = remaining[i2];
      const p3 = remaining[i3];

      const v1 = sub(p2, p1);
      const v2 = sub(p3, p1);

      const areaVector = cross(v1, v2);
      const area = Math.sqrt(dot(areaVector, areaVector));

      if (area < 1e-6) {
        continue;
      }

      const normal = normalize(areaVector);
      const d = -dot(normal, p1);

      const inlierMask = new Array(remaining.length).fill(false);
      let inlierCount = 0;

      for (let i = 0; i < remaining.length; i += 1) {
        const dist = Math.abs(dot(normal, remaining[i]) + d);

        if (dist <= threshold) {
          inlierMask[i] = true;
          inlierCount += 1;
        }
      }

      if (!best || inlierCount > best.inlierCount) {
        best = {
          normal,
          d,
          inlierMask,
          inlierCount,
          threshold,
        };
      }
    }

    if (!best || best.inlierCount < minInliers) {
      break;
    }

    const inlierPoints = remaining.filter((_, index) => best.inlierMask[index]);
    const centroid = averageVectors(inlierPoints);
    const geometry = buildPlaneGeometry(inlierPoints, best.normal, centroid);

    planes.push({
      normal: best.normal,
      centroid,
      inlierCount: best.inlierCount,
      threshold: best.threshold,
      method: "PLANE_RANSAC",
      basisU: geometry.basisU,
      basisV: geometry.basisV,
      extentU: geometry.extentU,
      extentV: geometry.extentV,
    });

    remaining = remaining.filter((_, index) => !best.inlierMask[index]);
  }

  return planes;
}

function estimateScale(points) {
  if (points.length === 0) {
    return 1;
  }

  const centroid = averageVectors(points);

  const distances = points.map((p) => distance(p, centroid));
  const sorted = [...distances].sort((a, b) => a - b);

  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;

  return Math.max(1, median);
}

function averageVectors(vectors) {
  if (vectors.length === 0) {
    return [0, 0, 0];
  }

  const sum = [0, 0, 0];

  for (const v of vectors) {
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
  }

  return [
    sum[0] / vectors.length,
    sum[1] / vectors.length,
    sum[2] / vectors.length,
  ];
}

function buildPlaneGeometry(inlierPoints, normal, centroid) {
  let arbitrary = [1, 0, 0];

  if (Math.abs(normal[0]) > 0.9) {
    arbitrary = [0, 1, 0];
  }

  const basisU = normalize(cross(normal, arbitrary));
  const basisV = normalize(cross(normal, basisU));

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const p of inlierPoints) {
    const d = sub(p, centroid);
    const u = dot(d, basisU);
    const v = dot(d, basisV);

    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  const extentU = Math.max(
    0.05,
    Math.abs(minU),
    Math.abs(maxU)
  );

  const extentV = Math.max(
    0.05,
    Math.abs(minV),
    Math.abs(maxV)
  );

  return {
    basisU,
    basisV,
    extentU,
    extentV,
  };
}
