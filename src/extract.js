import { assetURL } from "./paths.js";
import { createWorker } from "tesseract.js";
import { extractDocument } from "./document-client.js";
let worker;
export async function extract(file, progress, cancel, onText) {
  if (file.size > 30 * 1024 * 1024) throw Error("文件超过30MB，请先拆分或压缩");
  let text = "";
  const ext = file.name.split(".").pop().toLowerCase();
  if (["docx", "txt", "md", "rtf", "doc"].includes(ext)) {
    text = await extractDocument(file, ext, progress, cancel);
    if (cancel()) return "";
    if (!text.trim())
      throw Error(
        "文档中没有可提取的英文单词；图片式Word文档请导出为PDF后使用OCR。",
      );
    onText(text);
    progress("文档文字提取完成");
    return text;
  }
  if (ext !== "pdf" && !file.type.startsWith("image/"))
    throw Error("不支持此文件格式，请选择PDF、DOCX、TXT、MD或RTF。");
  const ocr = async (input) => {
    worker ||= await createWorker("eng", 1, {
      workerPath: assetURL("ocr/worker.min.js"),
      corePath: assetURL("ocr/core"),
      langPath: assetURL("ocr/lang"),
      logger: (m) =>
        progress(`${m.status} ${Math.round((m.progress || 0) * 100)}%`),
    });
    return (await worker.recognize(input)).data.text;
  };
  try {
    if (file.type === "application/pdf" || ext === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).href;
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() })
        .promise;
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancel()) break;
          progress(`第 ${i} / ${pdf.numPages} 页`);
          const page = await pdf.getPage(i);
          let t = (await page.getTextContent()).items
            .map((x) => x.str)
            .join(" ");
          if (t.replace(/\s/g, "").length < 12) {
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(2, 1800 / Math.max(base.width, base.height));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({
              canvasContext: canvas.getContext("2d"),
              viewport,
            }).promise;
            t = await ocr(canvas);
            canvas.width = canvas.height = 0;
          }
          text += "\n" + t;
          onText(text);
          page.cleanup();
          await new Promise((r) => setTimeout(r, 0));
        }
      } finally {
        await pdf.destroy();
      }
    } else {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 32000000)
          throw Error("图片像素过大，请先缩小至3200万像素以内");
        const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas
          .getContext("2d")
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        text = await ocr(canvas);
        canvas.width = canvas.height = 0;
        onText(text);
      } finally {
        bitmap.close();
      }
    }
    return text;
  } finally {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  }
}
