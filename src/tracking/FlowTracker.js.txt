export function trackPoints(prevPyramid, currPyramid, prevPoints, options = {}) {
  const {
    maxLevel = 2,
    patchRadius = 2,
    searchRadiusCoarse = 6,
    searchRadiusFine = 3,
    maxPatchError = 260,
  } = options;

  const levels = Math.min(
    maxLevel + 1,
    prevPyramid.length,
    currPyramid.length
  );

  const results = [];

  for (const prevPoint of prevPoints) {
    let flowX = 0;
    let flowY = 0;
    let ok = false;
    let finalError = Infinity;

    for (let level = levels - 1; level >= 0; level -= 1) {
      const scale = 1 / (1 << level);
      const px = prevPoint.x * scale;
      const py = prevPoint.y * scale;

      if (level < levels - 1) {
        flowX *= 2;
        flowY *= 2;
      }

      const prevLevel = prevPyramid[level];
      const currLevel = currPyramid[level];

      if (!insideImage(prevLevel, px, py, patchRadius)) {
        ok = false;
        break;
      }

      const radius =
        level === levels - 1 ? searchRadiusCoarse : searchRadiusFine;

      const best = searchPatch(
        prevLevel,
        currLevel,
        px,
        py,
        px + flowX,
        py + flowY,
        radius,
        patchRadius
      );

      if (!best.found) {
        ok = false;
        break;
      }

      flowX = best.x - px;
      flowY = best.y - py;
      finalError = best.error;
      ok = true;
    }

    const finalX = prevPoint.x + flowX;
    const finalY = prevPoint.y + flowY;

    if (
      ok &&
      finalError <= maxPatchError &&
      insideImage(currPyramid[0], finalX, finalY, 1)
    ) {
      results.push({
        id: prevPoint.id,
        x: finalX,
        y: finalY,
        error: finalError,
        tracked: true,
      });
    } else {
      results.push({
        id: prevPoint.id,
        x: prevPoint.x,
        y: prevPoint.y,
        error: finalError,
        tracked: false,
      });
    }
  }

  return results;
}

function insideImage(level, x, y, radius) {
  const xi = Math.round(x);
  const yi = Math.round(y);

  return (
    xi - radius >= 0 &&
    yi - radius >= 0 &&
    xi + radius < level.width &&
    yi + radius < level.height
  );
}

function searchPatch(
  prevLevel,
  currLevel,
  refX,
  refY,
  centerX,
  centerY,
  searchRadius,
  patchRadius
) {
  const refXi = Math.round(refX);
  const refYi = Math.round(refY);

  if (!insideImage(prevLevel, refXi, refYi, patchRadius)) {
    return {
      found: false,
      x: Math.round(centerX),
      y: Math.round(centerY),
      error: Infinity,
    };
  }

  const r = patchRadius;
  const size = (2 * r + 1) * (2 * r + 1);
  const refValues = new Float32Array(size);

  let refMean = 0;
  let index = 0;

  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const value =
        prevLevel.data[(refYi + dy) * prevLevel.width + (refXi + dx)];

      refValues[index] = value;
      refMean += value;
      index += 1;
    }
  }

  refMean /= size;

  let bestError = Infinity;
  let bestX = Math.round(centerX);
  let bestY = Math.round(centerY);
  let found = false;

  const cxi = Math.round(centerX);
  const cyi = Math.round(centerY);

  for (let dy = -searchRadius; dy <= searchRadius; dy += 1) {
    const cy = cyi + dy;

    for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
      const cx = cxi + dx;

      if (!insideImage(currLevel, cx, cy, r)) {
        continue;
      }

      let candMean = 0;

      for (let py = -r; py <= r; py += 1) {
        for (let px = -r; px <= r; px += 1) {
          candMean +=
            currLevel.data[(cy + py) * currLevel.width + (cx + px)];
        }
      }

      candMean /= size;

      let ssd = 0;
      let idx = 0;

      for (let py = -r; py <= r; py += 1) {
        for (let px = -r; px <= r; px += 1) {
          const refValue = refValues[idx] - refMean;
          const candValue =
            currLevel.data[(cy + py) * currLevel.width + (cx + px)] -
            candMean;

          const diff = refValue - candValue;
          ssd += diff * diff;
          idx += 1;
        }
      }

      const error = ssd / size;

      if (error < bestError) {
        bestError = error;
        bestX = cx;
        bestY = cy;
        found = true;
      }
    }
  }

  return {
    found,
    x: bestX,
    y: bestY,
    error: bestError,
  };
}
