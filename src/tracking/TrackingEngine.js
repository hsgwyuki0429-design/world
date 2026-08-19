import {
  imageDataToGray,
  buildPyramid,
} from "./ImagePyramid.js";

import { detectFeatures } from "./FeatureDetector.js";
import { trackPoints } from "./FlowTracker.js";
import { filterMatches } from "./OutlierFilter.js";
import { KeyframeStore } from "./KeyframeStore.js";

export class TrackingEngine {
  constructor(options = {}) {
    this.maxFeatures = options.maxFeatures ?? 120;
    this.minFeatures = options.minFeatures ?? 24;
    this.pyramidLevels = options.pyramidLevels ?? 3;

    this.prevPyramid = null;
    this.prevPoints = [];
    this.nextId = 1;
    this.frameId = 0;

    this.state = "READY";
    this.keyframes = new KeyframeStore(8);
    this.lastKeyframeFrame = -100;

    this.lastMedianFlow = { dx: 0, dy: 0 };
    this.approxPose = { x: 0, y: 0, z: 0 };
  }

  process(imageData, sensorStatus = null) {
    this.frameId += 1;

    const gray = imageDataToGray(imageData);
    const pyramid = buildPyramid(
      gray,
      imageData.width,
      imageData.height,
      this.pyramidLevels
    );

    const result = {
      frameId: this.frameId,
      timestamp: performance.now(),
      width: imageData.width,
      height: imageData.height,
      state: "READY",
      points: [],
      matches: [],
      metrics: {
        featureCount: 0,
        matchCount: 0,
        inlierCount: 0,
        inlierRatio: 0,
        reprojectionError: Infinity,
        keyframeCount: this.keyframes.size(),
      },
      relativeMotion: {
        dx: 0,
        dy: 0,
        method: "NONE",
        scale: "LOCAL_IMAGE",
      },
      cameraPose: {
        valid: false,
        note: "PHASE2_APPROX_MOTION_ONLY",
      },
    };

    if (
      !this.prevPyramid ||
      this.prevPyramid[0].width !== pyramid[0].width ||
      this.prevPyramid[0].height !== pyramid[0].height
    ) {
      this.resetWithDetection(pyramid, result);
      return result;
    }

    if (this.prevPoints.length === 0) {
      this.resetWithDetection(pyramid, result);
      return result;
    }

    const tracked = trackPoints(
      this.prevPyramid,
      pyramid,
      this.prevPoints,
      {
        maxLevel: 2,
        patchRadius: 2,
        searchRadiusCoarse: 6,
        searchRadiusFine: 3,
        maxPatchError: 260,
      }
    );

    const prevMatched = [];
    const currMatched = [];

    for (let i = 0; i < tracked.length; i += 1) {
      const t = tracked[i];

      if (t.tracked) {
        prevMatched.push(this.prevPoints[i]);
        currMatched.push(t);
      }
    }

    const filter = filterMatches(prevMatched, currMatched, {
      iterations: 120,
      threshold: 2.5,
    });

    const inlierPrev = [];
    const inlierCurr = [];

    if (filter.inlierMask && filter.inlierMask.length === currMatched.length) {
      for (let i = 0; i < currMatched.length; i += 1) {
        if (filter.inlierMask[i]) {
          inlierPrev.push(prevMatched[i]);
          inlierCurr.push(currMatched[i]);
        }
      }
    }

    const matchCount = currMatched.length;
    const inlierCount = inlierCurr.length;
    const inlierRatio = matchCount > 0 ? inlierCount / matchCount : 0;
    const reprojectionError = filter.meanError;

    const medianFlow = computeMedianFlow(inlierPrev, inlierCurr);

    let currentState = decideTrackingState({
      featureCount: this.prevPoints.length,
      matchCount,
      inlierCount,
      inlierRatio,
      reprojectionError,
      minFeatures: this.minFeatures,
    });

    let currentPoints = [];

    if (currentState === "LOST") {
      const relocalized = this.tryRelocalize(pyramid);

      if (relocalized && relocalized.length >= this.minFeatures) {
        currentPoints = relocalized;
        currentState = "TRACKING";
      } else {
        currentPoints = this.detectNewPoints(pyramid, [], this.maxFeatures);
        currentState =
          currentPoints.length >= this.minFeatures ? "TRACKING" : "READY";
      }
    } else {
      currentPoints = inlierCurr.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
      }));

      if (currentPoints.length < this.maxFeatures * 0.75) {
        const newPoints = this.detectNewPoints(
          pyramid,
          currentPoints,
          this.maxFeatures - currentPoints.length
        );

        currentPoints.push(...newPoints);
      }
    }

    result.state = currentState;
    result.points = currentPoints;

    result.matches = inlierPrev.map((prev, index) => ({
      prev,
      curr: inlierCurr[index],
    }));

    result.metrics = {
      featureCount: currentPoints.length,
      matchCount,
      inlierCount,
      inlierRatio,
      reprojectionError,
      keyframeCount: this.keyframes.size(),
    };

    result.relativeMotion = {
      dx: medianFlow ? medianFlow.dx : 0,
      dy: medianFlow ? medianFlow.dy : 0,
      method: filter.method,
      scale: "LOCAL_IMAGE",
    };

    if (medianFlow && inlierCount >= this.minFeatures) {
      this.approxPose.x += -medianFlow.dx * 0.001;
      this.approxPose.y += medianFlow.dy * 0.001;
    }

    result.cameraPose = {
      valid: false,
      approximateLocal: { ...this.approxPose },
      note: "PHASE2_APPROX_MOTION_ONLY",
    };

    const motionMagnitude = medianFlow
      ? Math.hypot(medianFlow.dx, medianFlow.dy)
      : 0;

    const shouldAddKeyframe =
      (currentState === "GOOD" || currentState === "TRACKING") &&
      currentPoints.length >= 40 &&
      (this.keyframes.size() === 0 ||
        (this.frameId - this.lastKeyframeFrame > 70 &&
          motionMagnitude > 0.8));

    if (shouldAddKeyframe) {
      this.addKeyframe(gray, imageData.width, imageData.height, currentPoints);
      this.lastKeyframeFrame = this.frameId;
      result.metrics.keyframeCount = this.keyframes.size();
    }

    this.prevPyramid = pyramid;
    this.prevPoints = currentPoints;
    this.state = currentState;
    this.lastMedianFlow = medianFlow || { dx: 0, dy: 0 };

    return result;
  }

  resetWithDetection(pyramid, result) {
    const features = detectFeatures(pyramid, {
      maxFeatures: this.maxFeatures,
    }).map((f) => ({
      id: this.nextId++,
      x: f.x,
      y: f.y,
    }));

    this.prevPyramid = pyramid;
    this.prevPoints = features;

    this.state =
      features.length >= this.minFeatures ? "TRACKING" : "READY";

    result.state = this.state;
    result.points = features;

    result.metrics = {
      featureCount: features.length,
      matchCount: 0,
      inlierCount: 0,
      inlierRatio: 0,
      reprojectionError: Infinity,
      keyframeCount: this.keyframes.size(),
    };
  }

  detectNewPoints(pyramid, existingPoints, maxAdd) {
    if (maxAdd <= 0) return [];

    const features = detectFeatures(pyramid, {
      maxFeatures: this.maxFeatures,
    });

    const added = [];

    for (const feature of features) {
      if (added.length >= maxAdd) break;

      const candidate = {
        id: this.nextId++,
        x: feature.x,
        y: feature.y,
        isNew: true,
      };

      let tooClose = false;

      for (const p of existingPoints) {
        const dx = p.x - candidate.x;
        const dy = p.y - candidate.y;

        if (dx * dx + dy * dy < 10 * 10) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        for (const q of added) {
          const dx2 = q.x - candidate.x;
          const dy2 = q.y - candidate.y;

          if (dx2 * dx2 + dy2 * dy2 < 10 * 10) {
            tooClose = true;
            break;
          }
        }
      }

      if (!tooClose) {
        added.push(candidate);
      }
    }

    return added;
  }

  addKeyframe(gray, width, height, points) {
    this.keyframes.add({
      frameId: this.frameId,
      timestamp: performance.now(),
      width,
      height,
      gray: gray.slice(0),
      points: points.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
      })),
    });
  }

  tryRelocalize(currentPyramid) {
    const keyframes = this.keyframes.allRecentFirst();

    for (const keyframe of keyframes) {
      const keyframePyramid = buildPyramid(
        keyframe.gray,
        keyframe.width,
        keyframe.height,
        this.pyramidLevels
      );

      const tracked = trackPoints(
        keyframePyramid,
        currentPyramid,
        keyframe.points,
        {
          maxLevel: 2,
          patchRadius: 2,
          searchRadiusCoarse: 10,
          searchRadiusFine: 5,
          maxPatchError: 300,
        }
      );

      const prevMatched = [];
      const currMatched = [];

      for (let i = 0; i < tracked.length; i += 1) {
        if (tracked[i].tracked) {
          prevMatched.push(keyframe.points[i]);
          currMatched.push(tracked[i]);
        }
      }

      const filter = filterMatches(prevMatched, currMatched, {
        iterations: 80,
        threshold: 3.0,
      });

      if (
        filter.inlierCount >= 24 &&
        filter.inlierRatio >= 0.35
      ) {
        const points = [];

        for (let i = 0; i < filter.inlierMask.length; i += 1) {
          if (!filter.inlierMask[i]) continue;

          points.push({
            id: this.nextId++,
            x: currMatched[i].x,
            y: currMatched[i].y,
          });
        }

        return points;
      }
    }

    return null;
  }
}

function computeMedianFlow(prevPoints, currPoints) {
  if (prevPoints.length === 0) return null;

  const dxValues = [];
  const dyValues = [];

  for (let i = 0; i < prevPoints.length; i += 1) {
    dxValues.push(currPoints[i].x - prevPoints[i].x);
    dyValues.push(currPoints[i].y - prevPoints[i].y);
  }

  return {
    dx: median(dxValues),
    dy: median(dyValues),
  };
}

function median(values) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted[mid];
}

function decideTrackingState({
  featureCount,
  matchCount,
  inlierCount,
  inlierRatio,
  reprojectionError,
  minFeatures,
}) {
  if (featureCount < minFeatures || inlierCount < minFeatures) {
    return "LOST";
  }

  if (
    matchCount < minFeatures ||
    inlierRatio < 0.35 ||
    reprojectionError > 4.0
  ) {
    return "DEGRADED";
  }

  if (
    inlierCount >= 70 &&
    inlierRatio >= 0.60 &&
    reprojectionError <= 2.2
  ) {
    return "GOOD";
  }

  return "TRACKING";
}
