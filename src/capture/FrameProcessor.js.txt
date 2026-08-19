export class FrameProcessor {
  constructor(videoElement, canvasElement, targetWidth = 256, minIntervalMs = 90) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.targetWidth = targetWidth;
    this.minIntervalMs = minIntervalMs;
    this.lastGrabAt = 0;

    let ctx = null;

    try {
      ctx = canvasElement.getContext("2d", { willReadFrequently: true });
    } catch {
      ctx = null;
    }

    this.ctx = ctx || canvasElement.getContext("2d");
  }

  grab(force = false) {
    const video = this.video;

    if (!this.ctx) return null;
    if (!video || video.readyState < 2) return null;
    if (!video.videoWidth || !video.videoHeight) return null;

    const now = performance.now();

    if (!force && now - this.lastGrabAt < this.minIntervalMs) {
      return null;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;

    const targetWidth = Math.max(
      64,
      Math.min(this.targetWidth, sourceWidth)
    );

    const targetHeight = Math.max(
      48,
      Math.round(sourceHeight * (targetWidth / sourceWidth))
    );

    if (this.canvas.width !== targetWidth) {
      this.canvas.width = targetWidth;
    }

    if (this.canvas.height !== targetHeight) {
      this.canvas.height = targetHeight;
    }

    try {
      this.ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      const imageData = this.ctx.getImageData(0, 0, targetWidth, targetHeight);
      this.lastGrabAt = now;
      return imageData;
    } catch {
      return null;
    }
  }
}
