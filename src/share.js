import { tokens } from "./core.js";
export const PUBLIC_SITE = "https://houzero1001-hash.github.io/wordbook-fresh/";
export const SHARE_LIMIT = 8000;
// A fragment is never sent in the HTTP request. Keep legacy ?text= links readable.
export function shareURL(origin, text) {
  if (text.length > SHARE_LIMIT)
    throw Error("分享文字过长，请只选择单词或短句（最多8000字符）");
  const root = new URL(origin);
  root.search = "";
  root.hash = "";
  if (!root.pathname.endsWith("/")) root.pathname += "/";
  return `${root.href}#collect?text=${encodeURIComponent(text)}`;
}
export function receiveShare(href) {
  const u = new URL(href);
  const fragment = u.hash.startsWith("#collect?")
    ? new URLSearchParams(u.hash.slice(9))
    : null;
  const q = fragment || u.searchParams;
  const present = !!fragment || ["text", "title", "url"].some((k) => q.has(k));
  if (!present) return null;
  // A title or webpage URL is context, never selected text.
  const text = q.get("text") || "";
  if (text.length > SHARE_LIMIT)
    return {
      text: "",
      words: [],
      error: "分享文字超过8000字符，请重新选取较短的文字。",
    };
  const words = tokens(text);
  return {
    text,
    words,
    error: words.length
      ? ""
      : "没有收到可收藏的英文文字。请长按选中单词后分享；只有网页链接时，可改用复制粘贴或截图识别。",
  };
}
