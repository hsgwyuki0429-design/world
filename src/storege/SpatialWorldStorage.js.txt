export function downloadSpatialWorld(world, filename = null) {
  const json = JSON.stringify(world, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename || `spatial-world-${new Date().toISOString().replaceAll(":", "-")}.json`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export async function loadSpatialWorldFromFile(file) {
  const text = await file.text();
  return parseSpatialWorld(text);
}

export function parseSpatialWorld(text) {
  let obj;

  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("INVALID_SPATIAL_WORLD_JSON");
  }

  if (!obj || typeof obj !== "object") {
    throw new Error("INVALID_SPATIAL_WORLD");
  }

  return normalizeSpatialWorld(obj);
}

function normalizeSpatialWorld(world) {
  return {
    version: world.version ?? 1,
    createdAt: world.createdAt ?? new Date().toISOString(),
    coordinateSystem: {
      type: world.coordinateSystem?.type ?? "local",
      scale: world.coordinateSystem?.scale ?? "unknown",
      metricScale: Boolean(world.coordinateSystem?.metricScale),
      gravityAligned: Boolean(world.coordinateSystem?.gravityAligned),
    },
    origin: world.origin ?? {
      id: "origin_0",
      type: "origin",
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      geometry: null,
      confidence: "UNKNOWN",
      timestamp: 0,
    },
    cameraPoses: Array.isArray(world.cameraPoses) ? world.cameraPoses : [],
    pointCloud: Array.isArray(world.pointCloud) ? world.pointCloud : [],
    surfaces: Array.isArray(world.surfaces) ? world.surfaces : [],
    planes: Array.isArray(world.planes) ? world.planes : [],
    obstacles: Array.isArray(world.obstacles) ? world.obstacles : [],
    confidence: world.confidence ?? {
      overall: "UNKNOWN",
      tracking: "UNKNOWN",
      mapping: "UNKNOWN",
    },
    coverage: world.coverage ?? {
      note: "INTERNAL_METRIC_NOT_ROOM_PERCENTAGE",
    },
    trackingQuality: world.trackingQuality ?? "UNKNOWN",
    mappingState: world.mappingState ?? "UNKNOWN",
    metadata: world.metadata ?? {},
  };
}
