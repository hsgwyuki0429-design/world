export function buildSpatialWorld(input) {
  const {
    cameraPoses,
    points,
    planes,
    trackingState,
    mappingState,
    coverage,
    metadata,
  } = input;

  const overallConfidence = decideOverallConfidence(points, planes);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    coordinateSystem: {
      type: "local",
      scale: "unknown",
      metricScale: false,
      gravityAligned: false,
    },
    origin: {
      id: "origin_0",
      type: "origin",
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      geometry: null,
      confidence: "LOW",
      timestamp: 0,
    },
    cameraPoses,
    pointCloud: points,
    surfaces: [],
    planes,
    obstacles: [],
    confidence: {
      overall: overallConfidence,
      tracking: trackingStateToConfidence(trackingState),
      mapping: mappingStateToConfidence(mappingState),
    },
    coverage,
    trackingQuality: trackingState ?? "UNKNOWN",
    mappingState,
    metadata: {
      ...metadata,
      depthAvailable: false,
      arkitAvailable: false,
      roomplanAvailable: false,
      metricScaleAvailable: false,
    },
  };
}

function decideOverallConfidence(points, planes) {
  if (!points || points.length === 0) {
    return "UNKNOWN";
  }

  if (points.length >= 80 && planes.length >= 1) {
    return "MEDIUM";
  }

  return "LOW";
}

function trackingStateToConfidence(trackingState) {
  switch (trackingState) {
    case "GOOD":
      return "MEDIUM";

    case "TRACKING":
      return "LOW";

    case "DEGRADED":
      return "LOW";

    case "LOST":
      return "UNKNOWN";

    default:
      return "UNKNOWN";
  }
}

function mappingStateToConfidence(mappingState) {
  switch (mappingState) {
    case "MAPPING_ACTIVE":
      return "LOW";

    case "MAPPING_LOW_CONFIDENCE":
      return "LOW";

    case "MAPPING_INCOMPLETE":
      return "UNKNOWN";

    default:
      return "UNKNOWN";
  }
}
