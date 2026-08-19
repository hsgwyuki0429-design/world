import {
  add,
  sub,
  scale,
  dot,
  length,
  normalize,
  distance,
  clamp,
  quatConjugate,
  quatRotate,
} from "../geometry/Math3D.js";

export function triangulateTrack(track, keyframeMap, options = {}) {
  const {
    minObservations = 2,
    minBaseline = 0.005,
    minParallaxRad = 0.03,
    maxReprojectionError = 4.0,
    maxPointDistance = 20,
  } = options;

  if (!track || track.observations.length < minObservations) {
    return null;
  }

  const entries = [];

  for (const observation of track.observations) {
    const entry = keyframeMap.get(observation.keyframeId);

    if (!entry) continue;

    entries.push({
      observation,
      keyframe: entry.keyframe,
      pose: entry.pose,
    });
  }

  if (entries.length < minObservations) {
    return null;
  }

  const bearings = entries.map((entry) =>
    observationBearing(entry.observation, entry.pose)
  );

  const midpoints = [];

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const p1 = entries[i].pose.position;
      const p2 = entries[j].pose.position;

      const d1 = bearings[i];
      const d2 = bearings[j];

      const baseline = distance(p1, p2);

      if (baseline < minBaseline) {
        continue;
      }

      const closest = closestPointBetweenRays(p1, d1, p2, d2);

      if (!closest) {
        continue;
      }

      if (closest.s <= 0 || closest.t <= 0) {
        continue;
      }

      if (length(closest.point) > maxPointDistance) {
        continue;
      }

      midpoints.push(closest.point);
    }
  }

  if (midpoints.length === 0) {
    return null;
  }

  const position = averageVectors(midpoints);

  if (!Number.isFinite(position[0])) {
    return null;
  }

  const parallax = computeMaxParallax(position, entries);

  if (parallax < minParallaxRad) {
    return null;
  }

  let errorSum = 0;
  let validCount = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];

    const error = reprojectionError(
      position,
      entry.pose,
      entry.observation
    );

    if (Number.isFinite(error)) {
      errorSum += error;
      validCount += 1;
    }
  }

  if (validCount < minObservations) {
    return null;
  }

  const meanReprojectionError = errorSum / validCount;

  if (meanReprojectionError > maxReprojectionError) {
    return null;
  }

  const confidence = decidePointConfidence({
    observationCount: entries.length,
    parallax,
    meanReprojectionError,
  });

  return {
    position,
    observationCount: entries.length,
    parallaxRad: parallax,
    reprojectionError: meanReprojectionError,
    confidence,
  };
}

function observationBearing(observation, pose) {
  const intrinsics = pose.intrinsics;

  const x = (observation.x - intrinsics.cx) / intrinsics.focal;
  const y = (observation.y - intrinsics.cy) / intrinsics.focal;
  const z = 1;

  const cameraBearing = normalize([x, y, z]);

  return quatRotate(pose.rotation, cameraBearing);
}

function closestPointBetweenRays(p1, d1, p2, d2) {
  const r = sub(p1, p2);

  const a = dot(d1, d1);
  const b = dot(d1, d2);
  const c = dot(d2, d2);
  const d = dot(d1, r);
  const e = dot(d2, r);

  const denom = a * c - b * b;

  if (Math.abs(denom) < 1e-8) {
    return null;
  }

  const s = (b * e - c * d) / denom;
  const t = (a * e - b * d) / denom;

  if (!Number.isFinite(s) || !Number.isFinite(t)) {
    return null;
  }

  const closest1 = add(p1, scale(d1, s));
  const closest2 = add(p2, scale(d2, t));

  const point = scale(add(closest1, closest2), 0.5);
  const gap = distance(closest1, closest2);

  return {
    point,
    s,
    t,
    gap,
  };
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

function computeMaxParallax(point, entries) {
  let maxParallax = 0;

  const directions = entries.map((entry) =>
    normalize(sub(point, entry.pose.position))
  );

  for (let i = 0; i < directions.length; i += 1) {
    for (let j = i + 1; j < directions.length; j += 1) {
      const c = clamp(dot(directions[i], directions[j]), -1, 1);
      const angle = Math.acos(c);

      if (angle > maxParallax) {
        maxParallax = angle;
      }
    }
  }

  return maxParallax;
}

function reprojectionError(point, pose, observation) {
  const intrinsics = pose.intrinsics;

  const localPoint = quatRotate(
    quatConjugate(pose.rotation),
    sub(point, pose.position)
  );

  if (localPoint[2] <= 1e-6) {
    return Infinity;
  }

  const u =
    intrinsics.focal * (localPoint[0] / localPoint[2]) + intrinsics.cx;

  const v =
    intrinsics.focal * (localPoint[1] / localPoint[2]) + intrinsics.cy;

  return Math.hypot(u - observation.x, v - observation.y);
}

function decidePointConfidence({
  observationCount,
  parallax,
  meanReprojectionError,
}) {
  if (
    observationCount >= 5 &&
    parallax >= 0.10 &&
    meanReprojectionError <= 2.0
  ) {
    return "HIGH";
  }

  if (
    observationCount >= 3 &&
    parallax >= 0.05 &&
    meanReprojectionError <= 3.0
  ) {
    return "MEDIUM";
  }

  return "LOW";
}
