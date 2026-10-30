import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
const MAX_EXPANDED = 12 * 1024 * 1024;
export function decodeText(bytes) {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe)
      return new TextDecoder("utf-16le", { fatal: true }).decode(
        bytes.subarray(2),
      );
    if (bytes[0] === 0xfe && bytes[1] === 0xff)
      return new TextDecoder("utf-16be", { fatal: true }).decode(
        bytes.subarray(2),
      );
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw Error("binary");
    return text;
  } catch {
    throw Error(
      "文本编码无法可靠识别，请另存为UTF-8或带BOM的UTF-16文本后重试。",
    );
  }
}
export function docxText(bytes, progress = () => {}) {
  let expanded = 0;
  let files;
  try {
    files = unzipSync(bytes, {
      filter(entry) {
        const keep =
          /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(
            entry.name,
          );
        if (keep) {
          expanded += entry.originalSize;
          if (expanded > MAX_EXPANDED)
            throw Error("DOCX解压后的文字超过12MB，请拆分文档。");
        }
        return keep;
      },
    });
  } catch (e) {
    throw Error(
      "DOCX解析失败：" + e.message + "（文件可能损坏、加密或并非DOCX）",
    );
  }
  if (!files["word/document.xml"])
    throw Error("DOCX缺少word/document.xml；请用Word重新另存为.docx。");
  const result = [];
  for (const name of Object.keys(files).sort((a, b) =>
    a === "word/document.xml"
      ? -1
      : b === "word/document.xml"
        ? 1
        : a.localeCompare(b),
  )) {
    progress("读取Word正文、表格与附注…");
    const xml = decodeText(files[name]);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error("DOCX含不支持的XML实体声明，请重新另存为DOCX。");
    const parser = new SaxesParser({ xmlns: true });
    let inText = false,
      deleted = 0;
    let chunks = [];
    parser.on("opentag", (tag) => {
      if (
        tag.uri !==
          "http://schemas.openxmlformats.org/wordprocessingml/2006/main" &&
        tag.uri !== "http://purl.oclc.org/ooxml/wordprocessingml/main"
      )
        return;
      if (tag.local === "del") deleted++;
      if (tag.local === "t" && !deleted) {
        inText = true;
      }
      if (["tab", "br", "cr"].includes(tag.local)) chunks.push(" ");
    });
    parser.on("text", (t) => {
      if (inText) chunks.push(t);
    });
    parser.on("closetag", (tag) => {
      if (tag.local === "t") {
        inText = false;
      }
      if (tag.local === "del") deleted = Math.max(0, deleted - 1);
      if (["p", "tc", "tr"].includes(tag.local)) chunks.push("\n");
    });
    parser.write(xml).close();
    result.push(chunks.join(""));
  }
  return result.join("\n");
}
// Text extraction only: skip destinations/objects, decode escaped bytes and Unicode.
export function rtfText(bytes) {
  const pieces = [];
  for (let p = 0; p < bytes.length; p += 32768)
    pieces.push(String.fromCharCode(...bytes.subarray(p, p + 32768)));
  const s = pieces.join("");
  if (!/^\s*\{\\rtf\d/.test(s))
    throw Error("文件不是有效RTF；请另存为.docx或.txt。");
  let i = 0,
    stack = [],
    state = { skip: false, uc: 1 },
    fallback = 0,
    codepage = 1252,
    out = [],
    hex = [];
  const destinations = new Set([
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "object",
    "objdata",
    "filetbl",
    "generator",
    "listtable",
    "listoverridetable",
    "fldinst",
    "datastore",
    "xmlnstbl",
    "themedata",
    "colorschememapping",
  ]);
  const flush = () => {
    if (hex.length) {
      try {
        const text = new TextDecoder(
          codepage === 65001
            ? "utf-8"
            : codepage === 936
              ? "gbk"
              : codepage === 950
                ? "big5"
                : codepage === 932
                  ? "shift_jis"
                  : codepage === 1252
                    ? "windows-1252"
                    : `windows-${codepage}`,
          { fatal: true },
        ).decode(new Uint8Array(hex));
        if (!state.skip) out.push(text);
      } catch {
        throw Error("RTF字符编码不支持或损坏，请另存为UTF-8 TXT或DOCX。");
      }
      hex = [];
    }
  };
  const emit = (text) => {
    if (state.skip) return;
    if (fallback > 0) {
      fallback--;
      return;
    }
    out.push(text);
  };
  while (i < s.length) {
    const c = s[i++];
    if (c === "{") {
      flush();
      stack.push({ ...state });
      continue;
    }
    if (c === "}") {
      flush();
      if (!stack.length) throw Error("RTF括号不匹配，文件可能损坏");
      state = stack.pop();
      continue;
    }
    if (c !== "\\") {
      if (c !== "\r" && c !== "\n") {
        if (c.charCodeAt(0) > 127) {
          if (fallback) fallback--;
          else hex.push(c.charCodeAt(0));
        } else {
          flush();
          emit(c);
        }
      }
      continue;
    }
    const next = s[i++];
    if (next === "'") {
      const h = s.slice(i, i + 2);
      if (!/^[0-9a-f]{2}$/i.test(h)) throw Error("RTF转义编码损坏");
      i += 2;
      if (fallback) fallback--;
      else hex.push(parseInt(h, 16));
      continue;
    }
    flush();
    if (next === "*") {
      state.skip = true;
      continue;
    }
    if (["\\", "{", "}"].includes(next)) {
      emit(next);
      continue;
    }
    if (next === "~") {
      emit(" ");
      continue;
    }
    if (next === "_" || next === "-") {
      emit("-");
      continue;
    }
    if (!/[a-z]/i.test(next || "")) continue;
    let word = next;
    while (/[a-z]/i.test(s[i] || "") && i < s.length) word += s[i++];
    let num = "";
    if (s[i] === "-" || /\d/.test(s[i] || "")) {
      if (s[i] === "-") num += s[i++];
      while (/\d/.test(s[i] || "") && i < s.length) num += s[i++];
    }
    if (s[i] === " ") i++;
    const n = Number(num);
    if (destinations.has(word)) {
      state.skip = true;
      continue;
    }
    if (word === "bin") {
      if (!num || n < 0 || i + n > s.length) throw Error("RTF二进制片段损坏");
      i += n;
      continue;
    }
    if (word === "ansicpg") {
      codepage = n;
      continue;
    }
    if (word === "uc") {
      state.uc = Math.max(0, Math.min(n, 16));
      continue;
    }
    if (word === "u") {
      if (!state.skip) out.push(String.fromCharCode((n + 65536) % 65536));
      fallback = state.uc;
      continue;
    }
    if (["par", "line", "row", "cell"].includes(word)) {
      emit("\n");
      continue;
    }
    if (word === "tab") {
      emit(" ");
      continue;
    }
    const symbols = {
      emdash: "—",
      endash: "–",
      lquote: "‘",
      rquote: "’",
      ldblquote: "“",
      rdblquote: "”",
      bullet: "•",
    };
    if (symbols[word]) emit(symbols[word]);
  }
  flush();
  if (stack.length) throw Error("RTF文件被截断，缺少结束括号");
  return out.join("");
}
export function parseDocument(bytes, extension, progress = () => {}) {
  if (extension === "docx") return docxText(bytes, progress);
  if (extension === "rtf") return rtfText(bytes);
  if (extension === "doc") {
    const head = new TextDecoder("ascii").decode(bytes.subarray(0, 32));
    if (/^\s*\{\\rtf\d/.test(head)) return rtfText(bytes);
    throw Error(
      "暂不支持旧版二进制.doc（Word 97–2003）。请在Word或Pages中另存为.docx、.rtf或.txt；不会把二进制乱码当成单词。",
    );
  }
  if (["txt", "md"].includes(extension)) return decodeText(bytes);
  throw Error("不支持此文件格式。请选择PDF、DOCX、TXT、MD或RTF。");
}
