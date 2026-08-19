import { CaptureManager } from "./capture/CaptureManager.js";
import { FrameProcessor } from "./capture/FrameProcessor.js";
import { MotionManager } from "./sensors/MotionManager.js";
import { DebugSystem } from "./debug/DebugSystem.js";
import { TrackingEngine } from "./tracking/TrackingEngine.js";
import { PoseIntegrator } from "./tracking/PoseIntegrator.js";
import { MappingEngine } from "./mapping/MappingEngine.js";
import { FeatureOverlayRenderer } from "./render/FeatureOverlayRenderer.js";
import { WorldViewRenderer } from "./render/WorldViewRenderer.js";
import {
  downloadSpatialWorld,
  loadSpatialWorldFromFile,
} from "./storage/SpatialWorldStorage.js";

const els = {
  video: document.querySelector("#camera"),
  processingCanvas: document.querySelector("#processing"),
  featureOverlay: document.querySelector("#featureOverlay"),
  worldCanvas: document.querySelector("#worldViewCanvas"),

  startScreen: document.querySelector("#startScreen"),
  startButton: document.querySelector("#start"),
  error: document.querySelector("#error"),

  status: document.querySelector("#status"),
  debug: document.querySelector("#debug"),

  openWorld: document.querySelector("#openWorld"),

  worldScreen: document.querySelector("#worldScreen"),
  backToScan: document.querySelector("#backToScan"),
  liveWorld: document.querySelector("#liveWorld"),
  saveWorld: document.querySelector("#saveWorld"),
  loadWorld: document.querySelector("#loadWorld"),
  resetWorldView: document.querySelector("#resetWorldView"),
  worldFileInput: document.querySelector("#worldFileInput"),

  togglePoints: document.querySelector("#togglePoints"),
  togglePlanes: document.querySelector("#togglePlanes"),
  togglePoses: document.querySelector("#togglePoses"),
  toggleConfidence: document.querySelector("#toggleConfidence"),

  worldStats: document.querySelector("#worldStats"),
  worldMessage: document.querySelector("#worldMessage"),
};

const debug = new DebugSystem(els.debug);
const capture = new CaptureManager(els.video);
const motion = new MotionManager();

const overlayRenderer = new FeatureOverlayRenderer(els.featureOverlay);
const worldRenderer = new WorldViewRenderer(els.worldCanvas);

const frameProcessor = new FrameProcessor(
  els.video,
  els.processingCanvas,
  256,
  90
);

const trackingEngine = new TrackingEngine({
  maxFeatures: 120,
  minFeatures: 24,
  pyramidLevels: 3,
});

const poseIntegrator = new PoseIntegrator({
  focalScale: 0.85,
  translationScale: 0.01,
});

const mappingEngine = new MappingEngine({
  minObservations: 2,
  minPointsForPlanes: 40,
  maxPlanes: 3,
});

let running = false;
let frameCount = 0;
let fps = 0;
let lastFpsAt = performance.now();
let lastFrameProcessMs = 0;
let lastTrackingResult = null;

let loadedWorld = null;
let worldVisible = false;

let lastKeyframeCount = 0;
let lastWorldDataUpdateAt = 0;
let lastWorldStatsAt = 0;

els.startButton.addEventListener("click", onStartButton);
els.openWorld.addEventListener("click", openWorldView);
els.backToScan.addEventListener("click", closeWorldView);
els.liveWorld.addEventListener("click", useLiveWorld);
els.saveWorld.addEventListener("click", saveWorld);
els.loadWorld.addEventListener("click", () => els.worldFileInput.click());
els.resetWorldView.addEventListener("click", () => worldRenderer.reset());

els.worldFileInput.addEventListener("change", onWorldFileSelected);

els.togglePoints.addEventListener("change", () => {
  worldRenderer.showPoints = els.togglePoints.checked;
});

els.togglePlanes.addEventListener("change", () => {
  worldRenderer.showPlanes = els.togglePlanes.checked;
});

els.togglePoses.addEventListener("change", () => {
  worldRenderer.showPoses = els.togglePoses.checked;
});

els.toggleConfidence.addEventListener("change", () => {
  worldRenderer.showConfidence = els.toggleConfidence.checked;
});

function getCurrentWorld() {
  return loadedWorld || mappingEngine.getSpatialWorld();
}

function setWorldMessage(message) {
  els.worldMessage.textContent = message;
}

async function onStartButton() {
  els.startButton.disabled = true;
  els.error.textContent = "";

  try {
    if (!window.isSecureContext) {
      throw new Error("HTTPS_REQUIRED");
    }

    debug.set("phase", "4_WORLD");
    debug.set("state", "REQUESTING_PERMISSIONS");
    debug.render();

    console.log("[START] requesting permissions and camera");

    // iOS Safari対策:
    // ボタン押下の直後に、モーション許可とカメラ取得を同時に開始する。
    const motionPromise = motion.requestPermissions().catch((error) => {
      console.warn("[MOTION_PERMISSION_WARNING]", error);
    });

    const capturePromise = capture.start();

    try {
      await capturePromise;
    } catch (cameraError) {
      await motionPromise.catch(() => {});
      throw cameraError;
    }

    await motionPromise;

    motion.start();

    els.startScreen.classList.add("hidden");
    els.openWorld.disabled = false;

    running = true;

    frameCount = 0;
    lastFpsAt = performance.now();

    console.log("[START] capture ready");

    scheduleNextFrame();
  } catch (error) {
    console.error("[START_FAILED]", error);

    const message = error?.message || "UNKNOWN_ERROR";

    els.error.textContent = message;

    debug.set("phase", "4_WORLD");
    debug.set("state", "ERROR");
    debug.set("error", message);
    debug.render();

    els.startButton.disabled = false;
  }
}

function openWorldView() {
  worldVisible = true;
  els.worldScreen.classList.remove("hidden");

  worldRenderer.setWorld(getCurrentWorld(), { fit: false });
  worldRenderer.render();

  updateWorldStats(true);
}

function closeWorldView() {
  worldVisible = false;
  els.worldScreen.classList.add("hidden");
}

function useLiveWorld() {
  loadedWorld = null;
  worldRenderer.setWorld(getCurrentWorld(), { fit: true });
  setWorldMessage("LIVE_WORLD");
  updateWorldStats(true);
}

function saveWorld() {
  try {
    downloadSpatialWorld(getCurrentWorld());
    setWorldMessage("SPATIAL_WORLD_SAVED");
  } catch {
    setWorldMessage("SAVE_FAILED");
  }
}

async function onWorldFileSelected(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const world = await loadSpatialWorldFromFile(file);
    loadedWorld = world;

    worldRenderer.setWorld(world, { fit: true });
    setWorldMessage("SPATIAL_WORLD_LOADED");
  } catch {
    setWorldMessage("LOAD_FAILED");
  }

  event.target.value = "";
  updateWorldStats(true);
}

function scheduleNextFrame() {
  if (!running) return;

  const video = els.video;

  if (
    "requestVideoFrameCallback" in HTMLVideoElement.prototype &&
    video.readyState >= 2
  ) {
    video.requestVideoFrameCallback(onFrame);
  } else {
    requestAnimationFrame(onFrame);
  }
}

function onFrame() {
  if (!running) return;

  const startedAt = performance.now();

  const imageData = frameProcessor.grab(false);

  lastFrameProcessMs = performance.now() - startedAt;

  if (imageData) {
    const sensorStatus = motion.getStatus();

    lastTrackingResult = trackingEngine.process(imageData, sensorStatus);

    mappingEngine.setTrackingState(lastTrackingResult.state);

    const pose = poseIntegrator.update(lastTrackingResult, sensorStatus);

    const keyframeCount = lastTrackingResult.metrics.keyframeCount;

    if (keyframeCount > lastKeyframeCount) {
      const latestKeyframe =
        trackingEngine.keyframes.allRecentFirst()[0];

      if (latestKeyframe) {
        mappingEngine.addKeyframe(latestKeyframe, pose);
      }

      lastKeyframeCount = keyframeCount;
    }

    window.__SPATIAL_WORLD__ = getCurrentWorld();
  }

  if (!worldVisible) {
    overlayRenderer.render(lastTrackingResult, els.video);
  }

  if (worldVisible) {
    const now = performance.now();

    if (now - lastWorldDataUpdateAt > 300) {
      worldRenderer.setWorld(getCurrentWorld());
      lastWorldDataUpdateAt = now;
    }

    worldRenderer.render();

    if (now - lastWorldStatsAt > 500) {
      updateWorldStats(false);
      lastWorldStatsAt = now;
    }
  }

  frameCount += 1;

  const now = performance.now();

  if (now - lastFpsAt >= 1000) {
    fps = Math.round((frameCount * 1000) / (now - lastFpsAt));
    frameCount = 0;
    lastFpsAt = now;
  }

  updateDebug(imageData);
  scheduleNextFrame();
}

function updateWorldStats(force = false) {
  const world = getCurrentWorld();

  const pointCount = world.pointCloud?.length ?? 0;
  const planeCount = world.planes?.length ?? 0;
  const poseCount = world.cameraPoses?.length ?? 0;

  els.worldStats.textContent = [
    `SOURCE: ${loadedWorld ? "LOADED" : "LIVE"}`,
    `POINTS: ${pointCount}`,
    `PLANES: ${planeCount}`,
    `POSES: ${poseCount}`,
    `MAPPING: ${mappingEngine.mappingState}`,
    `SCALE: LOCAL_ONLY`,
    `METRIC: UNRESOLVED`,
  ].join("\n");

  if (pointCount === 0) {
    setWorldMessage("WORLD EMPTY / NO_VALID_SPATIAL_DATA");
  } else if (force) {
    setWorldMessage("");
  }
}

function updateDebug(imageData) {
  const motionStatus = motion.getStatus();
  const cameraSettings = capture.getVideoTrackSettings();
  const mappingMetrics = mappingEngine.getMetrics();

  debug.set("phase", "4_WORLD");
  debug.set("secure_context", window.isSecureContext ? "OK" : "HTTPS_REQUIRED");
  debug.set("camera_state", capture.state);

  debug.set(
    "video_size",
    els.video.videoWidth
      ? `${els.video.videoWidth}x${els.video.videoHeight}`
      : "NO_VIDEO"
  );

  debug.set(
    "camera_settings",
    cameraSettings
      ? `${cameraSettings.width ?? "?"}x${cameraSettings.height ?? "?"} fps=${cameraSettings.frameRate ?? "?"}`
      : "N/A"
  );

  debug.set("fps", fps);
  debug.set("frame_process_ms", lastFrameProcessMs.toFixed(2));

  debug.set(
    "processed_frame",
    imageData ? `${imageData.width}x${imageData.height}` : "SKIPPED_OR_NO_FRAME"
  );

  debug.set("orientation_permission", motionStatus.orientationPermission);
  debug.set("motion_permission", motionStatus.motionPermission);
  debug.set("orientation_data", motionStatus.orientationData);
  debug.set("motion_data", motionStatus.motionData);

  if (lastTrackingResult) {
    const m = lastTrackingResult.metrics;

    debug.set("tracking_state", lastTrackingResult.state);
    debug.set("feature_count", m.featureCount);
    debug.set("match_count", m.matchCount);
    debug.set("inlier_count", m.inlierCount);

    debug.set(
      "inlier_ratio",
      Number.isFinite(m.inlierRatio) ? m.inlierRatio.toFixed(3) : "N/A"
    );

    debug.set(
      "reprojection_error",
      Number.isFinite(m.reprojectionError)
        ? `${m.reprojectionError.toFixed(2)}px`
        : "N/A"
    );

    debug.set("keyframe_count", m.keyframeCount);

    debug.set(
      "relative_motion",
      `dx=${lastTrackingResult.relativeMotion.dx.toFixed(2)} dy=${lastTrackingResult.relativeMotion.dy.toFixed(2)}`
    );

    debug.set("motion_method", lastTrackingResult.relativeMotion.method);
    debug.set("scale", "LOCAL_IMAGE_ONLY");
  } else {
    debug.set("tracking_state", "NO_RESULT");
    debug.set("feature_count", 0);
    debug.set("match_count", 0);
    debug.set("inlier_count", 0);
    debug.set("inlier_ratio", "N/A");
    debug.set("reprojection_error", "N/A");
    debug.set("keyframe_count", 0);
  }

  debug.set("mapping_state", mappingMetrics.state);
  debug.set("mapping_keyframes", mappingMetrics.keyframeCount);
  debug.set("mapping_tracks", mappingMetrics.trackCount);
  debug.set("point_count", mappingMetrics.pointCount);
  debug.set("plane_count", mappingMetrics.planeCount);
  debug.set("mapping_confidence", mappingMetrics.confidence.overall);
  debug.set("coverage_note", mappingMetrics.coverage.note);

  debug.set("spatial_world", loadedWorld ? "LOADED" : "LIVE");
  debug.set("game", "NOT_IMPLEMENTED");

  els.status.textContent = buildStatusText(motionStatus, mappingMetrics);

  debug.render();
}

function buildStatusText(motionStatus, mappingMetrics) {
  const lines = [];

  lines.push("PHASE: 4_WORLD");
  lines.push(`CAMERA: ${capture.state}`);

  if (motionStatus.motionPermission === "denied") {
    lines.push("MOTION PERMISSION REQUIRED");
  } else {
    lines.push(`MOTION: ${motionStatus.motionData}`);
  }

  if (motionStatus.orientationPermission === "denied") {
    lines.push("ORIENTATION PERMISSION REQUIRED");
  } else {
    lines.push(`ORIENTATION: ${motionStatus.orientationData}`);
  }

  if (!lastTrackingResult) {
    lines.push("TRACKING: NO_RESULT");
    lines.push(`MAPPING: ${mappingMetrics.state}`);
    return lines.join("\n");
  }

  lines.push(`TRACKING: ${lastTrackingResult.state}`);

  const m = lastTrackingResult.metrics;

  lines.push(`FEATURES: ${m.featureCount}`);
  lines.push(`MATCHES: ${m.matchCount}`);
  lines.push(`INLIERS: ${m.inlierCount}`);

  if (m.featureCount < 40) {
    lines.push("LOW FEATURE COUNT");
  }

  if (lastTrackingResult.state === "LOST") {
    lines.push("TRACKING LOST");
  }

  lines.push(`MAPPING: ${mappingMetrics.state}`);
  lines.push(`POINTS: ${mappingMetrics.pointCount}`);
  lines.push(`PLANES: ${mappingMetrics.planeCount}`);

  if (mappingMetrics.state === "MAPPING_INCOMPLETE") {
    lines.push("MAPPING INCOMPLETE");
  }

  if (mappingMetrics.confidence.overall === "LOW") {
    lines.push("LOW CONFIDENCE");
  }

  return lines.join("\n");
}

console.log("[BOOT] main.js loaded");
window.__SPATIAL_MAPPING_MAIN_LOADED__ = true;
