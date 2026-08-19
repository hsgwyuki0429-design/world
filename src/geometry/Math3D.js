export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a) {
  return Math.sqrt(dot(a, a));
}

export function distance(a, b) {
  return length(sub(a, b));
}

export function normalize(a) {
  const len = length(a);

  if (len < 1e-9) {
    return [0, 0, 0];
  }

  return [a[0] / len, a[1] / len, a[2] / len];
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function quatIdentity() {
  return [0, 0, 0, 1];
}

export function quatNormalize(q) {
  const [x, y, z, w] = q;
  const len = Math.sqrt(x * x + y * y + z * z + w * w);

  if (len < 1e-9) {
    return quatIdentity();
  }

  return [x / len, y / len, z / len, w / len];
}

export function quatConjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatMultiply(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;

  return quatNormalize([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

export function quatRotate(q, v) {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;

  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

export function quatFromDeviceOrientation(alpha, beta, gamma) {
  if (
    alpha === null ||
    beta === null ||
    gamma === null ||
    alpha === undefined ||
    beta === undefined ||
    gamma === undefined
  ) {
    return quatIdentity();
  }

  const degToRad = Math.PI / 180;

  const a = alpha * degToRad;
  const b = beta * degToRad;
  const g = gamma * degToRad;

  const halfA = a / 2;
  const halfB = b / 2;
  const halfG = g / 2;

  const ca = Math.cos(halfA);
  const sa = Math.sin(halfA);
  const cb = Math.cos(halfB);
  const sb = Math.sin(halfB);
  const cg = Math.cos(halfG);
  const sg = Math.sin(halfG);

  const x = sb * ca * cg - cb * sa * sg;
  const y = cb * sa * cg + sb * ca * sg;
  const z = cb * ca * sg - sb * sa * cg;
  const w = cb * ca * cg + sb * sa * sg;

  return quatNormalize([x, y, z, w]);
}

export function quatFromUnitVectors(from, to) {
  const f = normalize(from);
  const t = normalize(to);

  const c = dot(f, t);

  if (c > 0.999999) {
    return quatIdentity();
  }

  if (c < -0.999999) {
    let axis = [1, 0, 0];

    if (Math.abs(f[0]) > 0.9) {
      axis = [0, 1, 0];
    }

    const ortho = normalize(cross(f, axis));

    return quatNormalize([ortho[0], ortho[1], ortho[2], 0]);
  }

  const axis = cross(f, t);

  return quatNormalize([
    axis[0],
    axis[1],
    axis[2],
    1 + c,
  ]);
}
