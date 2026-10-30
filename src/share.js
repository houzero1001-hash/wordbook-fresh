import { tokens } from "./core.js";
export const PUBLIC_SITE = "https://houzero1001-hash.github.io/wordbook-fresh/";
export function shareURL(text) {
  if (text.length > 8000) throw Error("文字过长，请直接粘贴到添加页");
  return PUBLIC_SITE + "#collect?text=" + encodeURIComponent(text);
}
export function receiveShare(href) {
  const u = new URL(href);
  const q = u.hash.startsWith("#collect?")
    ? new URLSearchParams(u.hash.slice(9))
    : u.searchParams;
  if (!q.has("text")) return null;
  const text = q.get("text") || "";
  if (text.length > 8000)
    return { text: "", words: [], error: "分享文字过长，请直接粘贴" };
  const words = tokens(text);
  return {
    text,
    words,
    error: words.length ? "" : "只有网址或没有英文，请复制文字或使用截图OCR",
  };
}
