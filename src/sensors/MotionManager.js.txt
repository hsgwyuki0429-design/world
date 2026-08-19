export class MotionManager {
  constructor() {
    this.orientationPermission = "unknown";
    this.motionPermission = "unknown";

    this.lastOrientation = null;
    this.lastMotion = null;

    this.lastOrientationAt = 0;
    this.lastMotionAt = 0;

    this.handleOrientation = null;
    this.handleMotion = null;
  }

  async requestPermissions() {
    this.orientationPermission = await this.requestPermission(
      typeof DeviceOrientationEvent !== "undefined"
        ? DeviceOrientationEvent
        : undefined
    );

    this.motionPermission = await this.requestPermission(
      typeof DeviceMotionEvent !== "undefined"
        ? DeviceMotionEvent
        : undefined
    );
  }

  async requestPermission(eventInterface) {
    if (!eventInterface) {
      return "unsupported";
    }

    if (typeof eventInterface.requestPermission !== "function") {
      return "not_required";
    }

    try {
      const result = await eventInterface.requestPermission();
      return result === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }

  start() {
    this.handleOrientation = (event) => {
      this.lastOrientation = {
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
        absolute: event.absolute,
        webkitCompassHeading: event.webkitCompassHeading ?? null,
        timestamp: Date.now(),
      };

      this.lastOrientationAt = performance.now();
    };

    this.handleMotion = (event) => {
      const rotationRate = event.rotationRate || {};
      const acceleration = event.acceleration || {};
      const accelerationIncludingGravity =
        event.accelerationIncludingGravity || {};

      this.lastMotion = {
        interval: event.interval ?? null,
        rotationRate: {
          alpha: rotationRate.alpha ?? null,
          beta: rotationRate.beta ?? null,
          gamma: rotationRate.gamma ?? null,
        },
        acceleration: {
          x: acceleration.x ?? null,
          y: acceleration.y ?? null,
          z: acceleration.z ?? null,
        },
        accelerationIncludingGravity: {
          x: accelerationIncludingGravity.x ?? null,
          y: accelerationIncludingGravity.y ?? null,
          z: accelerationIncludingGravity.z ?? null,
        },
        timestamp: Date.now(),
      };

      this.lastMotionAt = performance.now();
    };

    window.addEventListener("deviceorientation", this.handleOrientation);
    window.addEventListener("devicemotion", this.handleMotion);
  }

  stop() {
    if (this.handleOrientation) {
      window.removeEventListener("deviceorientation", this.handleOrientation);
    }

    if (this.handleMotion) {
      window.removeEventListener("devicemotion", this.handleMotion);
    }
  }

  getStatus() {
    const now = performance.now();
    const freshMs = 2000;

    const orientationData =
      this.orientationPermission === "denied"
        ? "DENIED"
        : this.orientationPermission === "unsupported"
          ? "UNSUPPORTED"
          : this.lastOrientationAt && now - this.lastOrientationAt < freshMs
            ? "OK"
            : this.lastOrientationAt
              ? "STALE"
              : "NO_DATA";

    const motionData =
      this.motionPermission === "denied"
        ? "DENIED"
        : this.motionPermission === "unsupported"
          ? "UNSUPPORTED"
          : this.lastMotionAt && now - this.lastMotionAt < freshMs
            ? "OK"
            : this.lastMotionAt
              ? "STALE"
              : "NO_DATA";

    return {
      orientationPermission: this.orientationPermission,
      motionPermission: this.motionPermission,
      orientationData,
      motionData,
      lastOrientation: this.lastOrientation,
      lastMotion: this.lastMotion,
    };
  }
}
