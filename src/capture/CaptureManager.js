export class CaptureManager {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
    this.state = "UNAVAILABLE";
  }

  async start() {
    if (!window.isSecureContext) {
      throw new Error("HTTPS_REQUIRED");
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("CAMERA_UNAVAILABLE");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (error) {
      this.state = "ERROR";
      throw new Error(this.mapMediaError(error));
    }

    this.video.srcObject = this.stream;

    try {
      await this.video.play();
    } catch {
      throw new Error("VIDEO_PLAY_FAILED");
    }

    this.state = "READY";
  }

  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }

    this.video.srcObject = null;
    this.state = "STOPPED";
  }

  getVideoTrackSettings() {
    const track = this.stream?.getVideoTracks?.()[0];

    if (!track) return null;

    try {
      return track.getSettings();
    } catch {
      return null;
    }
  }

  mapMediaError(error) {
    switch (error?.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "CAMERA_PERMISSION_DENIED";

      case "NotFoundError":
      case "OverconstrainedError":
        return "CAMERA_UNAVAILABLE";

      case "NotReadableError":
        return "CAMERA_BUSY";

      default:
        return "CAMERA_UNAVAILABLE";
    }
  }
}
