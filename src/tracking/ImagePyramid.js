export function imageDataToGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0, j = 0; i < gray.length; i += 1, j += 4) {
    const r = data[j];
    const g = data[j + 1];
    const b = data[j + 2];

    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return gray;
}

export function buildPyramid(gray, width, height, levels = 3) {
  const pyramid = [
    {
      width,
      height,
      data: gray,
    },
  ];

  let currentData = gray;
  let currentWidth = width;
  let currentHeight = height;

  for (let level = 1; level < levels; level += 1) {
    const nextWidth = Math.max(1, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(1, Math.floor(currentHeight / 2));
    const nextData = new Float32Array(nextWidth * nextHeight);

    for (let y = 0; y < nextHeight; y += 1) {
      for (let x = 0; x < nextWidth; x += 1) {
        const sx = x * 2;
        const sy = y * 2;

        let sum = 0;
        let count = 0;

        for (let dy = 0; dy < 2; dy += 1) {
          const yy = sy + dy;
          if (yy >= currentHeight) continue;

          for (let dx = 0; dx < 2; dx += 1) {
            const xx = sx + dx;
            if (xx >= currentWidth) continue;

            sum += currentData[yy * currentWidth + xx];
            count += 1;
          }
        }

        nextData[y * nextWidth + x] = count > 0 ? sum / count : 0;
      }
    }

    pyramid.push({
      width: nextWidth,
      height: nextHeight,
      data: nextData,
    });

    currentData = nextData;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  return pyramid;
}
