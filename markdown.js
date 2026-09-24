/**
 * DOM → Markdown конвертер для Dialogue to Markdown.
 */
(() => {
  "use strict";

  const root = globalThis.__QWEN_MD__;
  if (!root?.CONFIG) {
    console.error("[Dialogue to Markdown] config.js не загружен");
    return;
  }

  const CONFIG = root.CONFIG;

  function classNameOf(el) {
    if (!el) return "";
    const c = el.className;
    if (!c) return "";
    if (typeof c === "string") return c;
    if (typeof c.baseVal === "string") return c.baseVal;
    return String(c);
  }

  function isExcluded(el) {
    if (!el || el.nodeType !== 1) return true;
    return CONFIG.excludeSelectors.some((sel) => {
      try {
        return el.matches(sel);
      } catch {
        return false;
      }
    });
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findContentRoot(messageEl) {
    for (const sel of CONFIG.contentSelectors) {
      try {
        const found = messageEl.querySelector(sel);
        if (found && (found.innerText || "").trim()) return found;
      } catch {
        /* skip */
      }
    }
    return messageEl;
  }

  function collectQwenPhaseBlocks(messageEl) {
    const blocks = [];
    const seen = new Set();

    for (const sel of CONFIG.qwenPhaseBlockSelectors) {
      try {
        messageEl.querySelectorAll(sel).forEach((el) => {
          if (seen.has(el)) return;
          if (isExcluded(el)) return;
          if (blocks.some((b) => b.contains(el) && b !== el)) return;
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (el.contains(blocks[i]) && el !== blocks[i]) {
              seen.delete(blocks[i]);
              blocks.splice(i, 1);
            }
          }
          const text = (el.innerText || "").trim();
          if (!text) return;
          seen.add(el);
          blocks.push(el);
        });
      } catch {
        /* skip */
      }
    }

    blocks.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return blocks;
  }

  function extractLanguage(codeEl) {
    const cls = classNameOf(codeEl);
    const m =
      cls.match(/language-([a-z0-9_+-]+)/i) ||
      cls.match(/lang-([a-z0-9_+-]+)/i) ||
      cls.match(/hljs-([a-z0-9_+-]+)/i);
    if (m) return m[1].toLowerCase();
    const parent = codeEl.parentElement;
    if (parent) {
      const pc = classNameOf(parent);
      const pm =
        pc.match(/language-([a-z0-9_+-]+)/i) ||
        pc.match(/lang-([a-z0-9_+-]+)/i);
      if (pm) return pm[1].toLowerCase();
    }
    return "";
  }

  function chooseFence(codeText) {
    let n = 3;
    while (codeText.includes("`".repeat(n))) n += 1;
    return "`".repeat(n);
  }

  function extractCodeLanguage(container, codeEl) {
    let lang = extractLanguage(codeEl);
    if (lang) return lang;

    const header = container.querySelector(
      '[class*="code-lang"], [class*="language-label"], [class*="code-header"] [class*="lang"]'
    );
    if (header) {
      const t = (header.textContent || "").trim().toLowerCase();
      if (/^[a-z0-9_+-]+$/.test(t)) return t;
    }

    for (const child of container.children || []) {
      if (child.matches?.("button, [class*='copy']")) continue;
      const t = (child.textContent || "").trim().toLowerCase();
      if (/^[a-z][a-z0-9_+-]{0,19}$/.test(t)) return t;
    }
    return "";
  }

  function stripLineNumberPrefix(line) {
    return line.replace(/^\s*\d+\s*/, "");
  }

  function normalizeCodeText(text, lang) {
    if (!text) return "";
    let out = text.replace(/\u00a0/g, " ").replace(/\n$/, "");

    if (lang) {
      out = out.replace(new RegExp(`^${escapeRegExp(lang)}\\s*`, "i"), "");
    }

    out = out
      .replace(/(#[^\n\[]+?)(\[)/g, "$1\n$2")
      .replace(/(\[[\w.-]+\])([^\s\n])/g, "$1\n$2")
      .replace(/(\])(\[)/g, "$1\n$2")
      .replace(/;(?=\s*(?:let|use|fn|const|import)\b)/g, ";\n")
      .replace(/(\?)(?=\s*\.)/g, "$1\n");

    return out.trim();
  }

  function collectShikiLines(codeEl) {
    const direct = codeEl.querySelectorAll("span.line, [class~='line']");
    const lines = Array.from(direct).filter((el) => {
      const c = classNameOf(el);
      return (
        !/line-number|linenumber|line-numbers|gutter|underline|headline/i.test(
          c
        ) && el.closest("code, pre") === codeEl
      );
    });
    if (lines.length > 0) return lines;

    return Array.from(codeEl.querySelectorAll(".shiki span.line")).filter(
      (el) => el.closest("code, pre") === codeEl
    );
  }

  function extractCleanCodeText(codeEl, lang = "") {
    if (!codeEl) return "";

    const lineEls = collectShikiLines(codeEl);
    if (lineEls.length > 0) {
      const text = lineEls
        .map((el) => stripLineNumberPrefix((el.textContent || "").trim()))
        .filter(Boolean)
        .join("\n");
      return normalizeCodeText(text, lang);
    }

    const rows = codeEl.querySelectorAll("tr");
    if (rows.length > 0) {
      const text = Array.from(rows)
        .map((tr) => {
          const cells = tr.querySelectorAll("td, th");
          const codeCell = cells[cells.length - 1] || tr;
          return stripLineNumberPrefix((codeCell.textContent || "").trim());
        })
        .filter(Boolean)
        .join("\n");
      return normalizeCodeText(text, lang);
    }

    const clone = codeEl.cloneNode(true);
    clone
      .querySelectorAll(
        '[class*="line-number"], [class*="linenumber"], [class*="line-numbers"], [class*="gutter"], [class*="code-lang"], [class*="copy"], button'
      )
      .forEach((n) => n.remove());
    return normalizeCodeText(
      (clone.textContent || "").replace(/\n$/, ""),
      lang
    );
  }

  function codeBlockToMarkdown(container) {
    const pre = container.matches?.("pre")
      ? container
      : container.querySelector("pre");
    const codeEl =
      (pre && pre.querySelector("code")) ||
      container.querySelector("code") ||
      pre ||
      container;
    const lang = extractCodeLanguage(container, codeEl);
    const codeText = extractCleanCodeText(codeEl, lang);
    if (!codeText.trim()) return "";
    const fence = chooseFence(codeText);
    return `\n\n${fence}${lang}\n${codeText}\n${fence}\n\n`;
  }

  function isQwenCodeBlockContainer(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "pre") return true;
    const cls = classNameOf(el);
    if (
      /code-block|code_block|markdown-code|highlight-source/i.test(cls) &&
      el.querySelector("pre, code")
    ) {
      return true;
    }
    if (
      (tag === "div" || tag === "section") &&
      /shiki|hljs/i.test(cls) &&
      el.querySelector("code")
    ) {
      return true;
    }
    return false;
  }

  function extractMath(el) {
    const candidates = [
      el.getAttribute("data-latex"),
      el.getAttribute("data-tex"),
      el.getAttribute("data-math"),
      el.getAttribute("aria-label"),
      el.querySelector("annotation")?.textContent,
      el.querySelector('[type="math/tex"]')?.textContent,
      el.querySelector("script[type*='math']")?.textContent,
    ];
    for (const c of candidates) {
      if (c && c.trim()) return c.trim();
    }
    return (el.textContent || "").trim();
  }

  function tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) return "";

    const cellText = (cell) =>
      (cell.textContent || "").trim().replace(/\|/g, "\\|").replace(/\n+/g, " ");

    const matrix = rows.map((tr) =>
      Array.from(tr.querySelectorAll("th, td")).map(cellText)
    );
    const colCount = Math.max(...matrix.map((r) => r.length), 1);
    const norm = matrix.map((r) => {
      const copy = r.slice();
      while (copy.length < colCount) copy.push("");
      return copy;
    });

    const hasTh = rows.some((tr) => tr.querySelector("th"));
    const line = (cols) => `| ${cols.join(" | ")} |`;

    if (!hasTh && norm.length === 1) {
      return line(norm[0]);
    }

    const header = norm[0];
    const sep = header.map(() => "---");
    const body = norm.slice(1);
    return [line(header), line(sep), ...body.map(line)].join("\n");
  }

  function normalizeMarkdown(md) {
    return md
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function nodeToMarkdown(node, ctx = {}) {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || "";
      if (ctx.inCode) return t;
      return t.replace(/[ \t]+/g, " ");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = /** @type {Element} */ (node);
    const tag = el.tagName.toLowerCase();

    if (
      ["script", "style", "svg", "canvas", "iframe", "noscript"].includes(tag)
    ) {
      return "";
    }
    if (
      ["button", "input", "textarea", "select"].includes(tag) ||
      el.getAttribute("role") === "button" ||
      el.getAttribute("aria-hidden") === "true"
    ) {
      return "";
    }

    const cls = classNameOf(el);
    if (
      /copy|toolbar|action-btn|icon-btn|line-number|linenumber|line-numbers|gutter|code-lang|language-label/i.test(
        cls
      ) &&
      tag !== "pre" &&
      tag !== "code"
    ) {
      return "";
    }

    if (isQwenCodeBlockContainer(el)) {
      return codeBlockToMarkdown(el);
    }

    if (
      el.classList?.contains("katex") ||
      el.classList?.contains("MathJax") ||
      el.classList?.contains("math") ||
      tag === "math"
    ) {
      const latex = extractMath(el);
      if (!latex) return "";
      const isBlock =
        el.classList?.contains("katex-display") ||
        el.closest(".katex-display") ||
        tag === "math";
      return isBlock ? `\n$$\n${latex}\n$$\n` : `$${latex}$`;
    }

    if (tag === "img") {
      if (!CONFIG.includeImages) return "";
      const alt = el.getAttribute("alt") || "image";
      const src = el.getAttribute("src") || "";
      return src ? `![${alt}](${src})` : "";
    }

    if (tag === "a") {
      const href = el.getAttribute("href") || "";
      const text = childrenToMarkdown(el, ctx).trim() || href;
      if (!href || href.startsWith("javascript:")) return text;
      return `[${text}](${href})`;
    }

    if (tag === "strong" || tag === "b") {
      const inner = childrenToMarkdown(el, ctx).trim();
      return inner ? `**${inner}**` : "";
    }
    if (tag === "em" || tag === "i") {
      const inner = childrenToMarkdown(el, ctx).trim();
      return inner ? `*${inner}*` : "";
    }
    if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") {
      const inner = (el.textContent || "").replace(/`/g, "\\`");
      return "`" + inner + "`";
    }

    if (tag === "pre") {
      return codeBlockToMarkdown(el);
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(parseInt(tag[1], 10) + 1, 6);
      const inner = childrenToMarkdown(el, ctx).trim();
      return inner ? `\n\n${"#".repeat(level)} ${inner}\n\n` : "";
    }

    if (tag === "blockquote") {
      const inner = childrenToMarkdown(el, ctx).trim();
      if (!inner) return "";
      return (
        "\n\n" +
        inner
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") +
        "\n\n"
      );
    }

    if (tag === "hr") return "\n\n---\n\n";
    if (tag === "br") return "\n";

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(el.children).filter(
        (c) => c.tagName.toLowerCase() === "li"
      );
      const depth = ctx.listDepth || 0;
      const lines = items.map((li, idx) => {
        const pad = "  ".repeat(depth);
        const bullet = tag === "ol" ? `${idx + 1}.` : "-";
        const body = childrenToMarkdown(li, {
          ...ctx,
          listDepth: depth + 1,
        }).trim();
        return `${pad}${bullet} ${body}`;
      });
      return "\n\n" + lines.join("\n") + "\n\n";
    }

    if (tag === "li") {
      return childrenToMarkdown(el, ctx);
    }

    if (tag === "table") {
      return "\n\n" + tableToMarkdown(el) + "\n\n";
    }

    if (
      ["p", "div", "section", "article", "main", "li"].includes(tag) ||
      el.getAttribute("role") === "article"
    ) {
      const inner = childrenToMarkdown(el, ctx).trim();
      if (!inner) return "";
      if (ctx.listDepth) return inner + "\n";
      return `\n\n${inner}\n\n`;
    }

    return childrenToMarkdown(el, ctx);
  }

  function childrenToMarkdown(el, ctx) {
    let out = "";
    for (const child of el.childNodes) {
      out += nodeToMarkdown(child, ctx);
    }
    return out;
  }

  function isInsideUsed(el, used) {
    for (const u of used) {
      if (u === el || u.contains(el)) return true;
    }
    return false;
  }

  function extractLegacySupplement(messageEl, used) {
    const parts = [];
    messageEl
      .querySelectorAll(
        "#qk-markdown-react, .qwen-markdown, .custom-qwen-markdown"
      )
      .forEach((root) => {
        if (isInsideUsed(root, used)) return;
        const md = normalizeMarkdown(nodeToMarkdown(root));
        if (md) parts.push(md);
      });
    return parts.join("\n\n");
  }

  function extractMessageMarkdown(messageEl) {
    const parts = [];
    const used = new Set();

    const addBlock = (el) => {
      if (!el || used.has(el)) return;
      const md = normalizeMarkdown(nodeToMarkdown(el));
      if (!md) return;
      used.add(el);
      parts.push(md);
    };

    const phaseBlocks = collectQwenPhaseBlocks(messageEl);
    if (phaseBlocks.length > 0) {
      phaseBlocks.forEach((block) => addBlock(block));
      const supplement = extractLegacySupplement(messageEl, used);
      if (supplement) parts.push(supplement);
      return parts.join("\n\n");
    }

    const answerWrap = messageEl.hasAttribute("data-chat-answers-wrap")
      ? messageEl
      : messageEl.querySelector("[data-chat-answers-wrap]");
    const questionWrap = messageEl.hasAttribute("data-chat-question-wrap")
      ? messageEl
      : messageEl.querySelector("[data-chat-question-wrap]");

    if (answerWrap) {
      const md = answerWrap.querySelector(
        "#qk-markdown-react, .qwen-markdown, .custom-qwen-markdown"
      );
      addBlock(md || answerWrap);
      return parts.join("\n\n");
    }
    if (questionWrap) {
      addBlock(questionWrap);
      return parts.join("\n\n");
    }

    addBlock(findContentRoot(messageEl));
    return parts.join("\n\n");
  }

  root.md = {
    classNameOf,
    isExcluded,
    extractMessageMarkdown,
    nodeToMarkdown,
    normalizeMarkdown,
    tableToMarkdown,
  };
})();
