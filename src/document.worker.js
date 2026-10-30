import { tokens } from "./core.js";
import { parseDocument } from "./document-text.js";
self.onmessage = ({ data }) => {
  try {
    const text = parseDocument(
      new Uint8Array(data.bytes),
      data.extension,
      (message) => self.postMessage({ progress: message }),
    );
    self.postMessage({ text: tokens(text).join(" ") });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
