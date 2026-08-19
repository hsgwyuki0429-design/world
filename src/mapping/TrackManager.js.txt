export class TrackManager {
  constructor() {
    this.keyframes = new Map();
    this.tracks = new Map();
  }

  addKeyframe(keyframe, pose) {
    if (!keyframe || !pose) {
      return;
    }

    this.keyframes.set(keyframe.frameId, {
      keyframe,
      pose,
    });

    for (const point of keyframe.points) {
      let track = this.tracks.get(point.id);

      if (!track) {
        track = {
          id: point.id,
          observations: [],
          firstSeenFrame: keyframe.frameId,
          lastSeenFrame: keyframe.frameId,
        };

        this.tracks.set(point.id, track);
      }

      const alreadyExists = track.observations.some(
        (observation) => observation.keyframeId === keyframe.frameId
      );

      if (!alreadyExists) {
        track.observations.push({
          keyframeId: keyframe.frameId,
          x: point.x,
          y: point.y,
        });
      }

      track.lastSeenFrame = keyframe.frameId;
    }
  }

  getTrack(trackId) {
    return this.tracks.get(trackId) ?? null;
  }

  getKeyframeEntry(frameId) {
    return this.keyframes.get(frameId) ?? null;
  }

  getTrackCount() {
    return this.tracks.size;
  }

  getKeyframeCount() {
    return this.keyframes.size;
  }

  getTriangulatableTrackIds(minObservations = 2) {
    const ids = [];

    for (const [trackId, track] of this.tracks.entries()) {
      if (track.observations.length >= minObservations) {
        ids.push(trackId);
      }
    }

    return ids;
  }
}
