import { TrackManager } from "./TrackManager.js";
import { triangulateTrack } from "./Triangulator.js";
import { extractPlanes } from "./PlaneRansac.js";
import { buildSpatialWorld } from "./SpatialWorldBuilder.js";
import { quatFromUnitVectors } from "../geometry/Math3D.js";

export class MappingEngine {
  constructor(options = {}) {
    this.trackManager = new TrackManager();

    this.points = [];
    this.planes = [];

    this.triangulatedTrackIds = new Set();
    this.trackAttemptCounts = new Map();

    this.minObservations = options.minObservations ?? 2;
    this.minPointsForPlanes = options.minPointsForPlanes ?? 40;
    this.maxPlanes = options.maxPlanes ?? 3;

    this.trackingState = "UNKNOWN";
    this.mappingState = "IDLE";

    this.metadata = {
      engine: "SafariSpatialMappingPrototype",
      phase: 4,
      webgpuAvailable: Boolean(navigator.gpu),
    };
  }

  setTrackingState(trackingState) {
    this.trackingState = trackingState ?? "UNKNOWN";
  }

  addKeyframe(keyframe, pose) {
    if (!keyframe || !pose) {
      return;
    }

    this.trackManager.addKeyframe(keyframe, pose);
    this.update();
  }

  update() {
    this.triangulateNewTracks();
    this.updatePlanes();
    this.updateMappingState();
  }

  triangulateNewTracks() {
    const trackIds = this.trackManager.getTriangulatableTrackIds(
      this.minObservations
    );

    for (const trackId of trackIds) {
      if (this.triangulatedTrackIds.has(trackId)) {
        continue;
      }

      const track = this.trackManager.getTrack(trackId);

      if (!track) {
        continue;
      }

      const previousAttemptCount =
        this.trackAttemptCounts.get(trackId) ?? 0;

      if (previousAttemptCount >= track.observations.length) {
        continue;
      }

      this.trackAttemptCounts.set(trackId, track.observations.length);

      const result = triangulateTrack(
        track,
        this.trackManager.keyframes,
        {
          minObservations: this.minObservations,
          minBaseline: 0.005,
          minParallaxRad: 0.03,
          maxReprojectionError: 4.0,
          maxPointDistance: 20,
        }
      );

      if (!result) {
        continue;
      }

      const point = {
        id: `point_${trackId}`,
        type: "feature_point",
        trackId,
        position: result.position,
        rotation: null,
        geometry: null,
        confidence: result.confidence,
        timestamp: performance.now(),
        observationCount: result.observationCount,
        parallaxRad: result.parallaxRad,
        reprojectionError: result.reprojectionError,
      };

      this.points.push(point);
      this.triangulatedTrackIds.add(trackId);
    }
  }

  updatePlanes() {
    if (this.points.length < this.minPointsForPlanes) {
      this.planes = [];
      return;
    }

    const rawPlanes = extractPlanes(this.points, {
      maxPlanes: this.maxPlanes,
      minInliers: 12,
      iterations: 80,
      thresholdRatio: 0.03,
      minThreshold: 0.005,
    });

    this.planes = rawPlanes.map((plane, index) => {
      const confidence =
        plane.inlierCount >= 30 ? "MEDIUM" : "LOW";

      return {
        id: `plane_${index}_${performance.now().toFixed(0)}`,
        type: "plane_candidate",
        surfaceType: "UNKNOWN_SURFACE",
        position: plane.centroid,
        rotation: quatFromUnitVectors([0, 0, 1], plane.normal),
        geometry: {
          normal: plane.normal,
          basisU: plane.basisU,
          basisV: plane.basisV,
          extentU: plane.extentU,
          extentV: plane.extentV,
          inlierCount: plane.inlierCount,
          threshold: plane.threshold,
          method: plane.method,
        },
        confidence,
        timestamp: performance.now(),
        observationCount: plane.inlierCount,
      };
    });
  }

  updateMappingState() {
    const keyframeCount = this.trackManager.getKeyframeCount();

    if (keyframeCount === 0) {
      this.mappingState = "IDLE";
      return;
    }

    if (this.points.length === 0) {
      this.mappingState = "MAPPING_INCOMPLETE";
      return;
    }

    if (this.points.length < 30) {
      this.mappingState = "MAPPING_LOW_CONFIDENCE";
      return;
    }

    this.mappingState = "MAPPING_ACTIVE";
  }

  getMetrics() {
    return {
      state: this.mappingState,
      keyframeCount: this.trackManager.getKeyframeCount(),
      trackCount: this.trackManager.getTrackCount(),
      pointCount: this.points.length,
      planeCount: this.planes.length,
      confidence: {
        overall:
          this.points.length === 0
            ? "UNKNOWN"
            : this.points.length >= 80 && this.planes.length >= 1
              ? "MEDIUM"
              : "LOW",
      },
      coverage: this.getCoverage(),
    };
  }

  getCoverage() {
    return {
      keyframeCount: this.trackManager.getKeyframeCount(),
      trackCount: this.trackManager.getTrackCount(),
      triangulatedPointCount: this.points.length,
      planeCandidateCount: this.planes.length,
      note: "INTERNAL_METRIC_NOT_ROOM_PERCENTAGE",
    };
  }

  getSpatialWorld() {
    const cameraPoses = [];

    for (const entry of this.trackManager.keyframes.values()) {
      cameraPoses.push({
        id: entry.pose.id,
        type: "camera_pose",
        frameId: entry.keyframe.frameId,
        timestamp: entry.pose.timestamp,
        position: entry.pose.position,
        rotation: entry.pose.rotation,
        confidence: entry.pose.confidence ?? "LOW",
        source: entry.pose.source ?? "UNKNOWN",
      });
    }

    cameraPoses.sort((a, b) => a.frameId - b.frameId);

    return buildSpatialWorld({
      cameraPoses,
      points: this.points,
      planes: this.planes,
      trackingState: this.trackingState,
      mappingState: this.mappingState,
      coverage: this.getCoverage(),
      metadata: this.metadata,
    });
  }
}
