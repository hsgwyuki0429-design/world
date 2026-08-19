export class DebugSystem {
  constructor(el) {
    this.el = el;
    this.data = new Map();
  }

  set(key, value) {
    this.data.set(key, value);
  }

  render() {
    if (!this.el) return;

    const lines = [];

    for (const [key, value] of this.data.entries()) {
      lines.push(`${key.toUpperCase()}: ${value ?? "N/A"}`);
    }

    this.el.textContent = lines.join("\n");
  }
}
