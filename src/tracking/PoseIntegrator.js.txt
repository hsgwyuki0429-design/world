import {
  add,
  quatFromDeviceOrientation,
  quatIdentity,
  quatRotate,
} from "../geometry/Math3D.js";

export class PoseIntegrator {
  constructor(options = {}) {
    this.position = [0, 0, 0];
    this.orientation = quatIdentity();

    this.focalScale = options.focalScale ?? 0.85;
    this.translationScale = options.translationScale ?? 0.01;
  }

  update(trackingResult, sensorStatus) {
    if (!trackingResult) {
      return this.createPose(0, trackingResult);
    }

    const orientation = sensorStatus?.lastOrientation;

    if (
      orientation &&
      orientation.alpha != null &&
      orientation.beta != null &&
      orientation.gamma != null
    ) {
      this.orientation = quatFromDeviceOrientation(
        orientation.alpha,
        orientation.beta,
        orientation.gamma
      );
    }

    const dx = trackingResult.relativeMotion?.dx ?? 0;
    const dy = trackingResult.relativeMotion?.dy ?? 0;

    const shouldIntegrate =
      (trackingResult.state === "GOOD" || trackingResult.state === "TRACKING") &&
      trackingResult.metrics.inlierCount >= 24;

    if (shouldIntegrate) {
      const width = trackingResult.width;
      const focal = Math.max(1, width * this.focalScale);

      const localDelta = [
        (-dx / focal) * this.translationScale,
        (dy / focal) * this.translationScale,
        0,
      ];

      const worldDelta = quatRotate(this.orientation, localDelta);
      this.position = add(this.position, worldDelta);
    }

    return this.createPose(trackingResult.frameId, trackingResult);
  }

  createPose(frameId, trackingResult) {
    const width = trackingResult?.width ?? 256;
    const height = trackingResult?.height ?? 192;

    const focal = Math.max(1, width * this.focalScale);

    return {
      id: `pose_${frameId}`,
      type: "camera_pose",
      frameId,
      timestamp: performance.now(),
      position: [...this.position],
      rotation: [...this.orientation],
      confidence: "LOW",
      source: "PHASE2_APPROX_MOTION",
      intrinsics: {
        width,
        height,
        focal,
        cx: width / 2,
        cy: height / 2,
      },
    };
  }
}
