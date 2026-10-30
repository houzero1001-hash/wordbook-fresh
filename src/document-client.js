export async function extractDocument(file, extension, progress, cancel) {
  progress("正在读取文件…");
  const bytes = await file.arrayBuffer();
  if (cancel()) return "";
  const worker = new Worker(new URL("./document.worker.js", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error, text) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      clearTimeout(timeout);
      worker.terminate();
      error ? reject(error) : resolve(text);
    };
    const timer = setInterval(() => {
      if (cancel()) finish(null, "");
    }, 100);
    const timeout = setTimeout(
      () => finish(Error("文件解析超过60秒，请拆分文档后重试。")),
      60000,
    );
    worker.onmessage = ({ data }) => {
      if (data.progress) progress(data.progress);
      else if (data.error) finish(Error(data.error));
      else finish(null, data.text);
    };
    worker.onerror = (e) =>
      finish(
        Error("文档后台解析失败：" + (e.message || "请重新导出该文档后重试")),
      );
    progress("后台解析文档，请稍候…");
    worker.postMessage({ bytes, extension }, [bytes]);
  });
}
