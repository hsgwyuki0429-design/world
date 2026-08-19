export class FeatureOverlayRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  render(trackingResult, videoElement) {
    const canvas = this.canvas;
    const ctx = this.ctx;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const width = Math.floor(rect.width * dpr);
    const height = Math.floor(rect.height * dpr);

    if (canvas.width !== width) {
      canvas.width = width;
    }

    if (canvas.height !== height) {
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    if (!trackingResult || !videoElement || !videoElement.videoWidth) {
      return;
    }

    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;

    const containerWidth = rect.width;
    const containerHeight = rect.height;

    const scale = Math.max(
      containerWidth / videoWidth,
      containerHeight / videoHeight
    );

    const offsetX = (containerWidth - videoWidth * scale) / 2;
    const offsetY = (containerHeight - videoHeight * scale) / 2;

    const xScale = videoWidth / trackingResult.width;
    const yScale = videoHeight / trackingResult.height;

    const toScreen = (point) => {
      const x = offsetX + point.x * xScale * scale;
      const y = offsetY + point.y * yScale * scale;

      return {
        x: x * dpr,
        y: y * dpr,
      };
    };

    if (trackingResult.matches && trackingResult.matches.length > 0) {
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeStyle = "rgba(0, 255, 180, 0.35)";

      for (const match of trackingResult.matches) {
        const a = toScreen(match.prev);
        const b = toScreen(match.curr);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    if (trackingResult.points && trackingResult.points.length > 0) {
      for (const point of trackingResult.points) {
        const p = toScreen(point);

        ctx.beginPath();

        if (point.isNew) {
          ctx.fillStyle = "rgba(80, 200, 255, 0.95)";
        } else {
          ctx.fillStyle = "rgba(0, 255, 140, 0.95)";
        }

        ctx.arc(p.x, p.y, 2.1 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
