// Keep a single bounded compositor frame, never an entire recording.
export function createFrameBuffer() {
  let frame = null;
  return {
    receive(data, at) {
      frame =
        typeof data === "string" && data.length <= 4 * 1024 * 1024
          ? { bytes: Buffer.from(data, "base64"), at }
          : null;
    },
    after(time) {
      return frame && frame.at >= time ? frame.bytes : null;
    },
  };
}
