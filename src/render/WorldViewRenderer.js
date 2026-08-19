import {
  add,
  sub,
  scale,
  dot,
  cross,
  normalize,
  clamp,
  quatRotate,
} from "../geometry/Math3D.js";

export class WorldViewRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.world = null;

    this.yaw = 0.8;
    this.pitch = 0.45;
    this.distance = 3;
    this.target = [0, 0, 0];

    this.showPoints = true;
    this.showPlanes = true;
    this.showPoses = true;
    this.showConfidence = true;

    this.hasFitted = false;
    this.pointers = new Map();
    this.lastPinchDistance = null;

    this.bindEvents();
  }

  bindEvents() {
    this.canvas.style.touchAction = "none";

    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // noop
      }

      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.pointers.has(event.pointerId)) return;

      const prev = this.pointers.get(event.pointerId);
      const curr = {
        x: event.clientX,
        y: event.clientY,
      };

      this.pointers.set(event.pointerId, curr);

      if (this.pointers.size === 1) {
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;

        this.yaw -= dx * 0.005;
        this.pitch += dy * 0.005;

        this.pitch = clamp(this.pitch, -1.45, 1.45);
      } else if (this.pointers.size === 2) {
        const points = [...this.pointers.values()];
        const p1 = points[0];
        const p2 = points[1];

        const pinchDistance = Math.hypot(
          p1.x - p2.x,
          p1.y - p2.y
        );

        if (this.lastPinchDistance !== null) {
          const ratio = this.lastPinchDistance / pinchDistance;
          this.distance *= ratio;
          this.distance = clamp(this.distance, 0.15, 60);
        }

        this.lastPinchDistance = pinchDistance;
      }
    });

    const removePointer = (event) => {
      this.pointers.delete(event.pointerId);

      if (this.pointers.size < 2) {
        this.lastPinchDistance = null;
      }
    };

    this.canvas.addEventListener("pointerup", removePointer);
    this.canvas.addEventListener("pointercancel", removePointer);

    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();

        this.distance *= Math.exp(event.deltaY * 0.001);
        this.distance = clamp(this.distance, 0.15, 60);
      },
      { passive: false }
    );
  }

  setWorld(world, options = {}) {
    this.world = world;

    if (options.fit) {
      this.fit();
      this.hasFitted = true;
      return;
    }

    if (!this.hasFitted && this.hasData()) {
      this.fit();
      this.hasFitted = true;
    }
  }

  reset() {
    this.yaw = 0.8;
    this.pitch = 0.45;
    this.fit();
    this.hasFitted = true;
  }

  hasData() {
    return Boolean(
      this.world &&
      (
        (this.world.pointCloud && this.world.pointCloud.length > 0) ||
        (this.world.planes && this.world.planes.length > 0) ||
        (this.world.cameraPoses && this.world.cameraPoses.length > 0)
      )
    );
  }

  fit() {
    const positions = [];

    if (!this.world) {
      this.target = [0, 0, 0];
      this.distance = 3;
      return;
    }

    for (const point of this.world.pointCloud ?? []) {
      if (point.position) positions.push(point.position);
    }

    for (const plane of this.world.planes ?? []) {
      if (plane.position) positions.push(plane.position);
    }

    for (const pose of this.world.cameraPoses ?? []) {
      if (pose.position) positions.push(pose.position);
    }

    if (positions.length === 0) {
      this.target = [0, 0, 0];
      this.distance = 3;
      return;
    }

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (const p of positions) {
      min[0] = Math.min(min[0], p[0]);
      min[1] = Math.min(min[1], p[1]);
      min[2] = Math.min(min[2], p[2]);

      max[0] = Math.max(max[0], p[0]);
      max[1] = Math.max(max[1], p[1]);
      max[2] = Math.max(max[2], p[2]);
    }

    const center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];

    let radius = 0;

    for (const p of positions) {
      const dx = p[0] - center[0];
      const dy = p[1] - center[1];
      const dz = p[2] - center[2];

      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }

    this.target = center;
    this.distance = clamp(radius * 2.5 + 0.25, 0.3, 60);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const width = Math.floor(rect.width * dpr);
    const height = Math.floor(rect.height * dpr);

    if (width === 0 || height === 0) {
      return false;
    }

    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }

    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }

    return true;
  }

  render() {
    if (!this.resize()) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const eye = add(
      this.target,
      scale(
        [
          Math.cos(this.pitch) * Math.sin(this.yaw),
          Math.sin(this.pitch),
          Math.cos(this.pitch) * Math.cos(this.yaw),
        ],
        this.distance
      )
    );

    const forward = normalize(sub(this.target, eye));

    let right = normalize(cross(forward, [0, 1, 0]));

    if (right[0] === 0 && right[1] === 0 && right[2] === 0) {
      right = [1, 0, 0];
    }

    const up = normalize(cross(right, forward));

    const cameraState = {
      eye,
      right,
      up,
      forward,
      cx: width / 2,
      cy: height / 2,
      f: height * 0.9,
    };

    this.drawAxes(cameraState);

    if (this.world) {
      if (this.showPlanes) {
        this.drawPlanes(cameraState);
      }

      if (this.showPoints) {
        this.drawPoints(cameraState);
      }

      if (this.showPoses) {
        this.drawCameraPoses(cameraState);
      }
    }

    if (this.showConfidence) {
      this.drawLegend();
    }
  }

  project(point, cameraState) {
    const rel = sub(point, cameraState.eye);

    const x = dot(rel, cameraState.right);
    const y = dot(rel, cameraState.up);
    const z = dot(rel, cameraState.forward);

    if (z <= 0.02) {
      return null;
    }

    return {
      x: cameraState.cx + (x / z) * cameraState.f,
      y: cameraState.cy - (y / z) * cameraState.f,
      z,
    };
  }

  drawLine(cameraState, a, b, color, lineWidth = 1) {
    const pa = this.project(a, cameraState);
    const pb = this.project(b, cameraState);

    if (!pa || !pb) return;

    const ctx = this.ctx;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * (window.devicePixelRatio || 1);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  drawAxes(cameraState) {
    const axisLength = Math.max(0.08, this.distance * 0.08);

    this.drawLine(
      cameraState,
      [0, 0, 0],
      [axisLength, 0, 0],
      "rgba(255,90,90,0.85)",
      1.2
    );

    this.drawLine(
      cameraState,
      [0, 0, 0],
      [0, axisLength, 0],
      "rgba(120,255,120,0.85)",
      1.2
    );

    this.drawLine(
      cameraState,
      [0, 0, 0],
      [0, 0, axisLength],
      "rgba(120,180,255,0.85)",
      1.2
    );
  }

  confidenceColor(confidence, alpha) {
    switch (confidence) {
      case "HIGH":
        return `rgba(0,255,140,${alpha})`;

      case "MEDIUM":
        return `rgba(255,220,0,${alpha})`;

      case "LOW":
        return `rgba(255,120,40,${alpha})`;

      default:
        return `rgba(170,170,170,${alpha})`;
    }
  }

  drawPoints(cameraState) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    for (const point of this.world.pointCloud ?? []) {
      const p = this.project(point.position, cameraState);

      if (!p) continue;

      const radius = clamp(2.2 * dpr * (2 / p.z), 1, 5 * dpr);

      ctx.beginPath();

      if (this.showConfidence) {
        ctx.fillStyle = this.confidenceColor(point.confidence, 0.95);
      } else {
        ctx.fillStyle = "rgba(80,220,255,0.95)";
      }

      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPlanes(cameraState) {
    const ctx = this.ctx;

    for (const plane of this.world.planes ?? []) {
      const geometry = plane.geometry;

      if (!geometry || !geometry.basisU || !geometry.basisV) {
        continue;
      }

      const c = plane.position;
      const u = geometry.basisU;
      const v = geometry.basisV;
      const eu = geometry.extentU ?? 0.1;
      const ev = geometry.extentV ?? 0.1;

      const corners = [
        add(add(c, scale(u, eu)), scale(v, ev)),
        add(add(c, scale(u, eu)), scale(v, -ev)),
        add(add(c, scale(u, -eu)), scale(v, -ev)),
        add(add(c, scale(u, -eu)), scale(v, ev)),
      ];

      const projected = corners.map((corner) =>
        this.project(corner, cameraState)
      );

      if (projected.some((p) => p === null)) {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(projected[0].x, projected[0].y);

      for (let i = 1; i < projected.length; i += 1) {
        ctx.lineTo(projected[i].x, projected[i].y);
      }

      ctx.closePath();

      if (this.showConfidence) {
        ctx.fillStyle = this.confidenceColor(plane.confidence, 0.16);
        ctx.strokeStyle = this.confidenceColor(plane.confidence, 0.65);
      } else {
        ctx.fillStyle = "rgba(80,180,255,0.14)";
        ctx.strokeStyle = "rgba(80,180,255,0.55)";
      }

      ctx.fill();
      ctx.stroke();
    }
  }

  drawCameraPoses(cameraState) {
    const poses = [...(this.world.cameraPoses ?? [])].sort(
      (a, b) => (a.frameId ?? 0) - (b.frameId ?? 0)
    );

    if (poses.length === 0) return;

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    let previousProjected = null;

    for (const pose of poses) {
      const p = this.project(pose.position, cameraState);

      if (!p) {
        previousProjected = null;
        continue;
      }

      if (previousProjected) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(previousProjected.x, previousProjected.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2 * dpr, 0, Math.PI * 2);
      ctx.fill();

      const forwardLocal = [0, 0, 1];
      const forwardWorld = quatRotate(pose.rotation, forwardLocal);
      const forwardLength = Math.max(0.05, this.distance * 0.04);

      const tip = add(
        pose.position,
        scale(forwardWorld, forwardLength)
      );

      this.drawLine(
        cameraState,
        pose.position,
        tip,
        "rgba(120,255,255,0.75)",
        1
      );

      previousProjected = p;
    }
  }

  drawLegend() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    const x = 14 * dpr;
    let y = this.canvas.height - 74 * dpr;

    ctx.font = `${11 * dpr}px -apple-system, sans-serif`;
    ctx.textBaseline = "top";

    const items = [
      ["HIGH", this.confidenceColor("HIGH", 0.95)],
      ["MEDIUM", this.confidenceColor("MEDIUM", 0.95)],
      ["LOW", this.confidenceColor("LOW", 0.95)],
      ["UNKNOWN", this.confidenceColor("UNKNOWN", 0.95)],
    ];

    for (const [label, color] of items) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 10 * dpr, 10 * dpr);

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(label, x + 16 * dpr, y);

      y += 16 * dpr;
    }
  }
}
