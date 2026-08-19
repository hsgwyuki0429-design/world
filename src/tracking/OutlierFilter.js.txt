export function filterMatches(prevPoints, currPoints, options = {}) {
  const {
    iterations = 120,
    threshold = 2.5,
  } = options;

  const n = prevPoints.length;

  if (n !== currPoints.length || n === 0) {
    return {
      inlierMask: [],
      inlierCount: 0,
      inlierRatio: 0,
      meanError: Infinity,
      affine: null,
      method: "NONE",
    };
  }

  if (n < 8) {
    return {
      inlierMask: new Array(n).fill(true),
      inlierCount: n,
      inlierRatio: 1,
      meanError: 0,
      affine: null,
      method: "TOO_FEW",
    };
  }

  let seed = 1234567;

  function randomInt(max) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  }

  let best = null;

  for (let iter = 0; iter < iterations; iter += 1) {
    const i1 = randomInt(n);
    const i2 = randomInt(n);
    const i3 = randomInt(n);

    if (i1 === i2 || i1 === i3 || i2 === i3) {
      continue;
    }

    const p1 = prevPoints[i1];
    const p2 = prevPoints[i2];
    const p3 = prevPoints[i3];

    const area = Math.abs(
      (p2.x - p1.x) * (p3.y - p1.y) -
      (p2.y - p1.y) * (p3.x - p1.x)
    );

    if (area < 16) {
      continue;
    }

    const affine = solveAffine(
      [p1, p2, p3],
      [currPoints[i1], currPoints[i2], currPoints[i3]]
    );

    if (!affine) {
      continue;
    }

    const inlierMask = new Array(n).fill(false);
    let inlierCount = 0;
    let errorSum = 0;

    for (let i = 0; i < n; i += 1) {
      const prev = prevPoints[i];
      const curr = currPoints[i];

      const projectedX = affine.a * prev.x + affine.b * prev.y + affine.c;
      const projectedY = affine.d * prev.x + affine.e * prev.y + affine.f;

      const dx = projectedX - curr.x;
      const dy = projectedY - curr.y;
      const errorSq = dx * dx + dy * dy;

      if (errorSq <= threshold * threshold) {
        inlierMask[i] = true;
        inlierCount += 1;
        errorSum += Math.sqrt(errorSq);
      }
    }

    const meanError = inlierCount > 0 ? errorSum / inlierCount : Infinity;

    if (
      !best ||
      inlierCount > best.inlierCount ||
      (inlierCount === best.inlierCount && meanError < best.meanError)
    ) {
      best = {
        inlierMask,
        inlierCount,
        meanError,
        affine,
      };
    }
  }

  if (!best) {
    return {
      inlierMask: new Array(n).fill(false),
      inlierCount: 0,
      inlierRatio: 0,
      meanError: Infinity,
      affine: null,
      method: "AFFINE_RANSAC_FAILED",
    };
  }

  return {
    inlierMask: best.inlierMask,
    inlierCount: best.inlierCount,
    inlierRatio: best.inlierCount / n,
    meanError: best.meanError,
    affine: best.affine,
    method: "AFFINE_RANSAC",
  };
}

function solveAffine(prev, curr) {
  const A = [];
  const b = [];

  for (let i = 0; i < 3; i += 1) {
    const p = prev[i];
    const q = curr[i];

    A.push([p.x, p.y, 1, 0, 0, 0]);
    b.push(q.x);

    A.push([0, 0, 0, p.x, p.y, 1]);
    b.push(q.y);
  }

  const solution = solveLinear6(A, b);

  if (!solution) {
    return null;
  }

  return {
    a: solution[0],
    b: solution[1],
    c: solution[2],
    d: solution[3],
    e: solution[4],
    f: solution[5],
  };
}

function solveLinear6(A, b) {
  const n = 6;

  for (let col = 0; col < n; col += 1) {
    let pivot = col;

    for (let row = col; row < n; row += 1) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(A[pivot][col]) < 1e-8) {
      return null;
    }

    if (pivot !== col) {
      const tmpA = A[pivot];
      A[pivot] = A[col];
      A[col] = tmpA;

      const tmpB = b[pivot];
      b[pivot] = b[col];
      b[col] = tmpB;
    }

    const pivotValue = A[col][col];

    for (let j = col; j < n; j += 1) {
      A[col][j] /= pivotValue;
    }

    b[col] /= pivotValue;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;

      const factor = A[row][col];

      if (Math.abs(factor) < 1e-12) {
        continue;
      }

      for (let j = col; j < n; j += 1) {
        A[row][j] -= factor * A[col][j];
      }

      b[row] -= factor * b[col];
    }
  }

  return b;
}
