export class KeyframeStore {
  constructor(maxKeyframes = 8) {
    this.maxKeyframes = maxKeyframes;
    this.items = [];
  }

  add(keyframe) {
    this.items.push(keyframe);

    if (this.items.length > this.maxKeyframes) {
      this.items.shift();
    }
  }

  size() {
    return this.items.length;
  }

  allRecentFirst() {
    return [...this.items].reverse();
  }
}
