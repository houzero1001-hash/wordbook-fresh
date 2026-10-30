import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createWorker } from "tesseract.js";
import { tokens } from "../src/core.js";
const expected = ["study", "book", "run", "right", "mean"];
test("真实Tesseract英文模型识别合成PNG，候选待确认", async () => {
  const worker = await createWorker("eng", 1, {
    langPath: fileURLToPath(new URL("../public/ocr/lang/", import.meta.url)),
    gzip: true,
    cacheMethod: "none",
  });
  try {
    const result = await worker.recognize(
      fileURLToPath(new URL("./fixtures/words.png", import.meta.url)),
    );
    assert.deepEqual(tokens(result.data.text), expected);
  } finally {
    await worker.terminate();
  }
});
test("真实PDF.js提取文字层，保留预期候选", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(
    await readFile(new URL("./fixtures/text.pdf", import.meta.url)),
  );
  const pdf = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  try {
    const page = await pdf.getPage(1),
      content = await page.getTextContent();
    assert.deepEqual(
      tokens(content.items.map((x) => x.str).join(" ")),
      expected,
    );
  } finally {
    await pdf.destroy();
  }
});
