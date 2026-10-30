import { assetURL } from "./paths.js";
import "./style.css";
import {
  tokens,
  addWords,
  grade,
  restart,
  dueWords,
  mergeBackup,
  senses,
  statistics,
} from "./core.js";
import { read, write } from "./storage.js";
import { lookup } from "./dictionary.js";
import { extract } from "./extract.js";
import { supplements } from "./supplement.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let actionPending = false;
let words = [],
  page = "today",
  candidates = [],
  queue = [],
  session = null,
  revealed = false,
  filter = "all",
  search = "",
  candidateLimit = 80,
  busy = false,
  cancelled = false,
  fileStatus = "",
  importError = "";
function toast(s) {
  $("#message")?.remove();
  const d = document.createElement("div");
  d.id = "message";
  d.textContent = s;
  document.body.append(d);
  setTimeout(() => d.remove(), 4500);
}
let persistence = Promise.resolve();
function mutate(fn) {
  const next = persistence.then(async () => {
    const value = fn(words);
    await write(value);
    words = value;
  });
  persistence = next.catch(() => {});
  return next;
}
async function commit(next) {
  await mutate(() => next);
}
async function update(word, fn) {
  await mutate((current) => current.map((w) => (w.word === word ? fn(w) : w)));
}
const btn = (text, id, cls = "") =>
  `<button class="${cls}" data-act="${id}">${text}</button>`;
function shell(content) {
  $("#app").innerHTML =
    `<header><strong>我的英语单词本</strong><span class="muted">每天一点，慢慢记住</span></header><main>${content}</main><nav>${[
      ["today", "今日复习"],
      ["collect", "收藏单词"],
      ["library", "单词本"],
    ]
      .map(([id, label]) =>
        btn(label, "nav:" + id, page === id ? "active" : ""),
      )
      .join("")}</nav>`;
}
function card(w) {
  const c = w.card;
  if (!c)
    return `<div class="card"><div class="word">${esc(w.original || w.word)}</div><p class="notice">${esc(w.error || "词典卡片尚未加载")}</p>${btn("重新查询", "retry:" + w.word)}</div>`;
  const s = supplements[c.isForm ? c.word : w.word];
  const raw = senses(c.translation),
    common = s ? s.senses : raw.filter((x) => !x.text.startsWith("["));
  const more = s ? raw : raw.filter((x) => x.text.startsWith("["));
  return `<article class="card"><div class="row spread"><div class="word">${esc(w.word)}</div>${btn("▶ 发音", "speak:" + w.word)}</div><p class="muted">/${esc(s?.ipa || c.ipa || "音标缺失")}/ · ${s ? "标准 IPA" : "词库旧式音标，待校对"} · 系统英语语音</p>${common.map((x) => `<section><h3>${esc(Array.isArray(x) ? x[0] : x.pos)}</h3><p>${esc(Array.isArray(x) ? x[1] : x.text)}</p></section>`).join("")}${more.length ? `<details><summary>更多释义 · ECDICT 原始条目</summary>${more.map((x) => `<p>${esc(x.pos)} ${esc(x.text)}</p>`).join("")}</details>` : ""}<h3>英文辅助解释</h3>${
    (
      s?.en ||
      senses(c.definition)
        .slice(0, 2)
        .map((x) => x.text)
    )
      .map((x) => `<p>${esc(x)}</p>`)
      .join("") || '<p class="muted">暂无英文解释</p>'
  }${
    !s && senses(c.definition).length > 2
      ? `<details><summary>更多英文解释</summary>${senses(c.definition)
          .slice(2)
          .map((x) => `<p>${esc(x.text)}</p>`)
          .join("")}</details>`
      : ""
  }<h3>例句与搭配</h3>${s ? s.examples.map(([en, zh]) => `<p>${esc(en)}<br><span class="muted">${esc(zh)}</span></p>`).join("") + s.phrases.map(([en, zh]) => `<p>${esc(en)} — ${esc(zh)}</p>`).join("") : '<p class="muted">该词暂无经过核对的双语例句与搭配。</p>'}${c.lemma ? `<p class="notice">词库关联原形：<b>${esc(c.lemma)}</b>。${btn("查看原形释义", "lemma:" + c.lemma)}原收藏词形 ${esc(w.word)} 保留为独立记录；不会自动合并。${c.isForm ? "本卡展示原形释义。" : ""}</p>` : ""}<p><a href="https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${encodeURIComponent(w.word)}" target="_blank" rel="noopener noreferrer">在剑桥英汉词典核对释义与例句 ↗</a></p><h3>词形变化</h3><p>${esc(
    (c.exchange || "")
      .split("/")
      .filter(Boolean)
      .map((x) => {
        const [k, v] = x.split(":");
        return (
          ({
            s: "复数",
            3: "第三人称",
            d: "过去分词",
            p: "过去式",
            i: "现在分词",
            0: "原形",
            r: "比较级",
            t: "最高级",
          }[k] || k) +
          "：" +
          v
        );
      })
      .join(" · ") || "暂无词形资料",
  )}</p><small>中文、音标、词形及原始英文释义：ECDICT（MIT，社区词库）。${s ? "本卡常用释义、标准 IPA、英文辅助解释、例句和搭配为原创学习整理；完整原始释义见上方展开项。" : "未使用机器翻译。"} 词形仅展示，不自动合并不同单词。</small></article>`;
}
function render() {
  if (page === "today") {
    if (session && queue.length) {
      const w = words.find((x) => x.word === queue[0]);
      shell(
        `<p class="muted">今日复习 · 已完成 ${session.total} / ${session.size}</p>${revealed ? card(w) : `<div class="card"><p class="muted">先想一想，它是什么意思？</p><div class="word">${esc(w.word)}</div><p>回忆之后，再查看答案。</p>${btn("查看答案", "reveal", "primary full")}</div>`}${revealed ? `<div class="answers">${btn("还没记住", "grade:no")}${btn("已经记住", "grade:yes", "primary")}</div>` : ""}${btn("暂时退出", "leave")}`,
      );
    } else if (session) {
      shell(
        `<h1>这次复习完成了</h1><div class="hero"><p>本次复习 <b>${session.total}</b> 个单词</p><p>已经记住 ${session.known} 个</p><p>还需继续学习 ${session.total - session.known} 个</p><small>未记住的词已安排下次复习。</small></div>${btn("返回今日", "leave", "primary")}`,
      );
    } else {
      const stats = statistics(words);
      shell(
        `<section class="dashboard"><h1>每天记住一点</h1><div class="stats" aria-label="单词统计"><div><strong data-stat="due">${stats.due}</strong><span>待复习</span></div><div><strong data-stat="total">${stats.total}</strong><span>总单词</span></div><div><strong data-stat="known">${stats.known}</strong><span>已掌握</span></div></div><button class="primary full" data-act="start" ${stats.due ? "" : "disabled"}>开始背单词 →</button><p class="muted">${stats.due ? "先回忆，再查看答案。已掌握的单词不会自动出现。" : "今天的任务已完成。可以收藏新词，或查看以前的单词。"}</p><div class="quick-links">${btn("＋ 收藏单词", "nav:collect")}${btn("查看单词本", "nav:library")}</div></section><details><summary>备份、安装与使用帮助</summary>${help()}</details>`,
      );
    }
  } else if (page === "collect") {
    shell(
      `<h1>收藏遇见的生词</h1><p class="muted">输入、拍照或导入文件，检查后再收藏。</p><textarea id="input" placeholder="输入一个或多个英文单词，用空格或换行分隔"></textarea><div class="row">${btn("检查单词", "parse", "primary")}<label class="file">照片 / 截图<input id="image" type="file" accept="image/*" hidden></label><label class="file">拍照<input id="camera" type="file" accept="image/*" capture="environment" hidden></label><label class="file">上传文件<input id="document" type="file" accept=".pdf,.docx,.txt,.md,.rtf,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/rtf,application/msword" hidden></label></div><p class="muted file-hint">PDF、DOCX、TXT、Markdown、RTF · 最大30MB。旧DOC仅支持RTF内容；二进制DOC请另存为DOCX。</p><p id="progress" role="status">${esc(fileStatus)}</p>${importError ? `<p class="notice" role="alert">${esc(importError)}</p>` : ""}${busy ? btn("停止处理，保留已提取候选", "cancel") : ""}<div id="candidates">${candidateHTML()}</div>`,
    );
  } else {
    const list = words.filter(
      (w) =>
        (filter === "all" || w.status === filter) && w.word.includes(search),
    );
    shell(
      `<div class="row spread"><h1>我的单词本</h1>${btn("备份与帮助", "help")}</div><input id="search" class="search" value="${esc(search)}" placeholder="搜索收藏的单词"><p><select id="filter"><option value="all">全部单词</option><option value="learning" ${filter === "learning" ? "selected" : ""}>学习中</option><option value="known" ${filter === "known" ? "selected" : ""}>已经记住</option></select> 共 ${list.length} 个</p>${
        list
          .slice(0, 300)
          .map(
            (w) =>
              `<button class="listword" data-act="open:${w.word}"><span>${esc(w.word)}</span><small>${w.status === "known" ? "已记住" : w.card ? "学习中" : "待核对"} →</small></button>`,
          )
          .join("") || '<p class="muted">还没有单词，去收藏第一个吧。</p>'
      }${list.length > 300 ? "<p>仅展示前300项，请搜索缩小范围。</p>" : ""}`,
    );
  }
}
function candidateHTML() {
  return candidates.length
    ? `<h2>检查候选词 <small>${candidates.length} 个</small></h2><p class="muted">已记住的词默认不勾选；重复收藏不改变学习状态。</p>${btn("全选新词", "select-new")} ${btn("全部取消", "select-none")} ${candidates
        .slice(0, candidateLimit)
        .map(
          (c, i) =>
            `<div class="candidate"><input aria-label="选择 ${esc(c.word)}" type="checkbox" data-check="${i}" ${c.selected ? "checked" : ""}><input aria-label="修改候选单词" type="text" data-edit="${i}" value="${esc(c.word)}"><small>${words.find((w) => w.word === c.word)?.status === "known" ? "已记住" : ""}</small><button aria-label="删除候选" data-act="remove:${i}">×</button></div>`,
        )
        .join(
          "",
        )}${candidates.length > candidateLimit ? btn("显示更多候选（还有 " + (candidates.length - candidateLimit) + " 个）", "more-candidates") : ""}${btn("收藏选中的单词", "save", "primary full")}`
    : "";
}
function help() {
  return `<div class="panel"><h3>数据只保存在这台设备</h3><p>清除网站数据、更换手机、删除主屏幕应用可能造成数据丢失。请定期导出备份。不同域名的数据不互通。</p><div class="row">${btn("导出 JSON", "export")}<label class="file">恢复 JSON<input type="file" id="backup" accept="application/json,.json" hidden></label>${btn("清空数据", "clear", "danger")}</div><h3>添加到 iPhone 主屏幕</h3><p>在 Safari 打开正式 HTTPS 地址 → 分享 → 添加到主屏幕。已打开过的卡片可离线查看；OCR 首次需要联网从本站加载模型，系统发音取决于设备语音。</p><h3>简单复习安排</h3><p>「还没记住」依次安排在1、2、4、7、14天后，之后每14天复习。「已经记住」立即退出自动复习；可在单词卡手动重新学习。</p><p><a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener">ECDICT 词典来源</a> · <a href="${assetURL("dict/LICENSE.txt")}">MIT 授权</a>。免费社区词库不是付费权威词典，部分释义古旧、次序不理想、IPA为旧式记法。仅五个验收词提供核对过的原创双语例句与搭配，其他词明确显示缺失。</p><p>OCR：Tesseract.js（Apache-2.0）；PDF：Mozilla PDF.js（Apache-2.0）。文件在浏览器处理，最大30MB；DOCX/TXT/MD/RTF在后台线程解析，PDF逐页处理，可停止。二进制DOC请先另存为DOCX。OCR模型随本站部署，首次需联网加载；设备内存不足、离线缓存不全时可能失败。</p></div>`;
}
async function loadCard(word) {
  try {
    const c = await lookup(word);
    await update(word, (w) => ({ ...w, card: c, error: null }));
  } catch (e) {
    await update(word, (w) => ({ ...w, error: e.message }));
  }
}
function prepare(text) {
  candidateLimit = 80;
  candidates = tokens(text).map((word) => ({
    word,
    selected: words.find((w) => w.word === word)?.status !== "known",
  }));
}
document.addEventListener("input", (e) => {
  if (e.target.dataset.edit !== undefined)
    candidates[+e.target.dataset.edit].word = e.target.value;
  if (e.target.id === "search") {
    search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(pos, pos);
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.dataset.check !== undefined)
      candidates[+e.target.dataset.check].selected = e.target.checked;
    if (e.target.id === "filter") {
      filter = e.target.value;
      render();
    }
    if (e.target.id === "backup") {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 50 * 1024 * 1024) throw Error("备份文件过大");
      await commit(mergeBackup(words, JSON.parse(await f.text())));
      render();
      toast("恢复成功，重复词保留现有学习状态");
    }
    if (["image", "camera", "document"].includes(e.target.id)) {
      const f = e.target.files[0];
      if (!f || busy) return;
      busy = true;
      ((cancelled = false),
        (fileStatus = ""),
        (importError = ""));
      const seen = new Set(candidates.map((c) => c.word));
      render();
      try {
        await extract(
          f,
          (s) => {
            fileStatus = s;
            $("#progress") && ($("#progress").textContent = s);
          },
          () => cancelled,
          (t) => {
            for (const word of tokens(t)) {
              if (!seen.has(word)) {
                seen.add(word);
                candidates.push({
                  word,
                  selected:
                    words.find((w) => w.word === word)?.status !== "known",
                });
              }
            }
            if ($("#candidates")) $("#candidates").innerHTML = candidateHTML();
          },
        );
        fileStatus = cancelled
          ? "已停止，候选结果已保留"
          : "提取完成，请核对候选词（最多3000个）";
        toast(fileStatus);
      } catch (err) {
        importError = "处理失败：" + err.message + "。已提取候选仍保留。";
        fileStatus = "";
        toast(importError);
      } finally {
        busy = false;
        render();
      }
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("click", async (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  const [action, arg] = act.split(":");
  const guarded = ["grade", "save", "delete", "clear", "restart"].includes(
    action,
  );
  if (guarded && actionPending) return;
  if (guarded) actionPending = true;
  try {
    if (action === "nav") {
      if (actionPending) {
        toast("正在保存，请稍候");
        return;
      }
      if (arg !== "today") {
        session = null;
        queue = [];
      }
      if (busy) {
        toast("请先停止文件处理");
        return;
      }
      page = arg;
      render();
    }
    if (action === "parse") {
      const typed = $("#input").value;
      prepare(typed);
      if (!candidates.length)
        toast("没有可收藏的英文文字；网址不会作为单词导入。");
      render();
    }
    if (action === "remove") {
      candidates.splice(+arg, 1);
      render();
    }
    if (action === "select-new" || action === "select-none") {
      candidates.forEach(
        (c) =>
          (c.selected =
            action === "select-new" && !words.some((w) => w.word === c.word)),
      );
      render();
    }
    if (action === "more-candidates") {
      candidateLimit += 80;
      render();
    }
    if (action === "cancel") {
      cancelled = true;
      toast("将在当前页面处理后停止");
    }
    if (action === "save") {
      if (busy) throw Error("请等待文件处理完成或先停止处理");
      const selected = candidates
        .filter((c) => c.selected)
        .map((c) => c.word.trim().toLowerCase());
      if (selected.some((w) => !/^[a-z]+(?:['-][a-z]+)*$/.test(w)))
        throw Error("请核对拼写，每行仅填写一个英文单词");
      const before = words.length;
      await commit(addWords(words, selected));
      toast(`已收藏 ${words.length - before} 个新词；重复词保留原状态`);
      candidates = [];
      page = "library";
      render();
      for (const word of [...new Set(selected)]) {
        if (!words.find((w) => w.word === word)?.card) await loadCard(word);
      }
      if (page === "library") render();
    }
    if (action === "start") {
      queue = dueWords(words).map((w) => w.word);
      session = { size: queue.length, total: 0, known: 0 };
      revealed = false;
      render();
    }
    if (action === "leave") {
      session = null;
      queue = [];
      render();
    }
    if (action === "reveal") {
      revealed = true;
      const word = queue[0];
      if (!words.find((w) => w.word === word).card) await loadCard(word);
      render();
    }
    if (action === "grade") {
      const word = queue[0];
      await update(word, (w) => grade(w, arg === "yes"));
      session.total++;
      if (arg === "yes") session.known++;
      queue.shift();
      revealed = false;
      render();
    }
    if (action === "open") {
      if (!words.find((w) => w.word === arg).card) await loadCard(arg);
      const w = words.find((w) => w.word === arg);
      shell(
        `${btn("← 返回单词本", "nav:library")}${card(w)}<div class="row">${w.status === "known" ? btn("重新学习", "restart:" + arg) : '<span class="muted">学习中</span>'}${btn("删除单词", "delete:" + arg, "danger")}</div>`,
      );
    }
    if (action === "retry") {
      await loadCard(arg);
      toast(words.find((w) => w.word === arg)?.error || "查询成功");
      if (session) render();
      if (!session) {
        const w = words.find((w) => w.word === arg);
        shell(
          `${btn("← 返回", "nav:library")}${card(w)}${w.status === "known" ? btn("重新学习", "restart:" + arg) : ""}${btn("删除单词", "delete:" + arg, "danger")}`,
        );
      }
    }
    if (action === "lemma") {
      const c = await lookup(arg);
      shell(
        `${btn("← 返回单词本", "nav:library")}${card({ word: arg, original: arg, card: c })}<p class="muted">仅查看原形，不改变收藏记录。</p>`,
      );
    }
    if (action === "speak") {
      if (!("speechSynthesis" in window)) throw Error("此浏览器不支持系统发音");
      const voices = speechSynthesis
        .getVoices()
        .filter((v) => v.lang.startsWith("en"));
      if (!voices.length)
        throw Error("未检测到英语语音，请在iPhone设置中下载英语朗读语音后重试");
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(arg);
      u.lang = "en-US";
      u.voice = voices[0];
      u.rate = 0.85;
      u.onerror = () => toast("发音失败，请检查设备语音设置");
      speechSynthesis.speak(u);
    }
    if (action === "restart") {
      await update(arg, (w) => restart(w));
      page = "library";
      render();
      toast("已重新加入学习");
    }
    if (action === "delete" && confirm(`删除 ${arg}？此操作无法撤销。`)) {
      await commit(words.filter((w) => w.word !== arg));
      page = "library";
      render();
    }
    if (
      action === "clear" &&
      confirm("确定清空所有单词和学习状态？请先导出备份。")
    ) {
      await commit([]);
      render();
      toast("数据已清空");
    }
    if (action === "help") shell(`${btn("← 返回", "nav:library")}${help()}`);
    if (action === "export") {
      const blob = new Blob(
        [
          JSON.stringify(
            { format: "wordbook-1", exported: new Date().toISOString(), words },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `wordbook-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (err) {
    toast("操作未完成：" + err.message);
  } finally {
    if (guarded) actionPending = false;
  }
});

async function init() {
  try {
    words = await read();
    render();
    navigator.storage?.persist?.().catch(() => {});
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker.register(assetURL("sw.js"), { scope: assetURL() }).catch(() => {});
    window.speechSynthesis?.getVoices();
  } catch (e) {
    shell(
      "<h1>无法打开本地存储</h1><p>请退出无痕浏览并检查Safari存储设置。现有数据未清空。</p>",
    );
  }
}
init();
