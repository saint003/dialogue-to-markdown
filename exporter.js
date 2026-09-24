/**
 * Dialogue to Markdown — экспортёр диалогов chat.qwen.ai
 * Точка входа: режим выбора + экспорт.
 */
(() => {
  "use strict";

  const root = globalThis.__QWEN_MD__;
  const mdApi = root?.md;
  if (!root?.CONFIG || !mdApi) {
    console.error(
      "[Dialogue to Markdown] Загрузите config.js и markdown.js перед exporter.js"
    );
    return;
  }

  const CONFIG = root.CONFIG;
  const VERSION = root.VERSION;
  const { isExcluded, extractMessageMarkdown, normalizeMarkdown } = mdApi;

  // ---------------------------------------------------------------------------
  // UI: toast (объявлен до guard-ов — повторный инжект)
  // ---------------------------------------------------------------------------

  function showToast(text, isError) {
    const existing = document.getElementById("qwen-md-export-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "qwen-md-export-toast";
    toast.textContent = text;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      padding: "12px 16px",
      borderRadius: "8px",
      background: isError ? "#b91c1c" : "#0f766e",
      color: "#fff",
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      boxShadow: "0 4px 16px rgba(0,0,0,.25)",
      maxWidth: "360px",
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  }

  if (window.__qwenMdSelectionActive) {
    showToast("Режим выбора уже активен");
    return;
  }

  if (window.__qwenDialogueExporterRunning) {
    console.warn("[Dialogue to Markdown] Экспорт уже выполняется");
    return;
  }

  const selectionState = {
    container: null,
    panel: null,
    observer: null,
    checkboxes: new WeakMap(),
    selectedKeys: new Set(),
  };

  function log(...args) {
    if (CONFIG.debugLog) console.log("[Dialogue to Markdown]", ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findReqId(el) {
    let node = el;
    while (node && node !== document.body) {
      const direct = node.getAttribute?.("data-req-id");
      if (direct) return direct;
      const nested = node.querySelector?.("[data-req-id]");
      if (nested?.getAttribute("data-req-id")) {
        return nested.getAttribute("data-req-id");
      }
      node = node.parentElement;
    }
    return "";
  }

  function documentPositionIndex(el) {
    const all = document.querySelectorAll(
      CONFIG.messageSelectors.join(", ")
    );
    for (let i = 0; i < all.length; i++) {
      if (all[i] === el) return i;
    }
    return 0;
  }

  function messageKey(el, index) {
    const id =
      el.getAttribute("data-message-id") ||
      el.getAttribute("data-id") ||
      findReqId(el) ||
      el.id ||
      "";
    if (id) return id;
    const pos = documentPositionIndex(el);
    const text = (el.innerText || "").trim().slice(0, 120);
    return text ? `pos-${pos}:${text}` : `anon-${pos}-${index}`;
  }

  function findDialogueContainer() {
    let best = null;
    let bestScore = 0;

    for (const sel of CONFIG.containerSelectors) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }

      for (const node of nodes) {
        if (isExcluded(node)) continue;
        let score = 0;
        for (const msgSel of CONFIG.messageSelectors) {
          try {
            score += node.querySelectorAll(msgSel).length;
          } catch {
            /* skip */
          }
        }
        if (node.scrollHeight > node.clientHeight + 40) score += 5;

        if (score > bestScore) {
          bestScore = score;
          best = node;
        }
      }
    }

    if (!best || bestScore === 0) {
      log("Контейнер не найден по селекторам, используем document.body");
      best = document.body;
    } else {
      log("Контейнер:", best, "score:", bestScore);
    }
    return best;
  }

  function findMessageNodes(container) {
    const candidates = new Set();

    for (const sel of CONFIG.messageSelectors) {
      try {
        container.querySelectorAll(sel).forEach((el) => {
          if (!isExcluded(el)) candidates.add(el);
        });
      } catch {
        /* skip */
      }
    }

    const sorted = Array.from(candidates).sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const result = [];
    for (const el of sorted) {
      if (result.some((parent) => parent.contains(el) && parent !== el)) {
        continue;
      }
      for (let i = result.length - 1; i >= 0; i--) {
        if (el.contains(result[i]) && el !== result[i]) {
          result.splice(i, 1);
        }
      }
      result.push(el);
    }

    return result;
  }

  function detectRole(el) {
    if (
      el.hasAttribute("data-chat-answers-wrap") ||
      el.classList?.contains("qwen-chat-message-assistant") ||
      el.classList?.contains("chat-response-message")
    ) {
      return "assistant";
    }
    if (
      el.hasAttribute("data-chat-question-wrap") ||
      el.classList?.contains("qwen-chat-message-user")
    ) {
      return "user";
    }
    if (
      el.closest?.(
        "[data-chat-answers-wrap], .qwen-chat-message-assistant, .chat-response-message"
      )
    ) {
      return "assistant";
    }
    if (
      el.closest?.("[data-chat-question-wrap], .qwen-chat-message-user")
    ) {
      return "user";
    }

    const attrNames = [
      "data-role",
      "data-message-role",
      "data-author",
      "data-message-author-role",
      "data-author-role",
    ];
    for (const name of attrNames) {
      const val = el.getAttribute(name);
      if (!val) continue;
      if (CONFIG.userPatterns.test(val)) return "user";
      if (CONFIG.assistantPatterns.test(val)) return "assistant";
      if (CONFIG.systemPatterns.test(val)) return "unknown";
    }

    for (const sel of CONFIG.roleAttributeSelectors) {
      try {
        if (!el.matches(sel) && !el.querySelector(sel)) continue;
        const target = el.matches(sel) ? el : el.querySelector(sel);
        const attrMatch = sel.match(/\[([^\]=]+)/);
        const attrName = attrMatch ? attrMatch[1] : "aria-label";
        const val = target.getAttribute(attrName) || "";
        if (!val) continue;
        if (CONFIG.userPatterns.test(val)) return "user";
        if (CONFIG.assistantPatterns.test(val)) return "assistant";
        if (CONFIG.systemPatterns.test(val)) return "unknown";
      } catch {
        /* skip */
      }
    }

    const aria = el.getAttribute("aria-label") || "";
    if (aria) {
      if (CONFIG.userPatterns.test(aria)) return "user";
      if (CONFIG.assistantPatterns.test(aria)) return "assistant";
    }

    const classBlob = [
      mdApi.classNameOf(el),
      mdApi.classNameOf(el.parentElement),
      ...Array.from(el.querySelectorAll("[class]"))
        .slice(0, 5)
        .map((n) => mdApi.classNameOf(n)),
    ]
      .filter(Boolean)
      .join(" ");

    if (CONFIG.userPatterns.test(classBlob)) return "user";
    if (CONFIG.assistantPatterns.test(classBlob)) return "assistant";

    const labelEls = el.querySelectorAll(
      '[class*="author"], [class*="name"], [class*="role"], [class*="sender"]'
    );
    for (const label of labelEls) {
      const t = (label.textContent || "").trim();
      if (!t || t.length > 40) continue;
      if (CONFIG.userPatterns.test(t) || /^you$/i.test(t)) return "user";
      if (CONFIG.assistantPatterns.test(t)) return "assistant";
    }

    return "unknown";
  }

  function fillUnknownRoles(messages) {
    let last = null;
    for (const msg of messages) {
      if (msg.role !== "unknown") {
        last = msg.role;
        continue;
      }
      if (last === "user") msg.role = "assistant";
      else if (last === "assistant") msg.role = "user";
      else msg.role = "user";
      last = msg.role;
    }
  }

  function snapshotMessage(el, index, seq) {
    return {
      key: messageKey(el, index),
      role: detectRole(el),
      markdown: extractMessageMarkdown(el),
      timestamp: extractTimestamp(el),
      order: el.isConnected ? el.getBoundingClientRect().top : index,
      connected: el.isConnected,
      seq,
    };
  }

  function extractTimestamp(el) {
    if (!CONFIG.includeTimestamps) return null;
    const timeEl =
      el.querySelector("time[datetime]") ||
      el.querySelector("[datetime]") ||
      el.querySelector('[class*="time"]');
    if (!timeEl) return null;
    return (
      timeEl.getAttribute("datetime") ||
      (timeEl.textContent || "").trim() ||
      null
    );
  }

  async function autoScrollAndCollect(container) {
    const collected = new Map();
    const startTop = container.scrollTop;
    const startedAt = Date.now();
    let prevHeight = -1;
    let stableRounds = 0;
    let seq = 0;

    const harvest = () => {
      const nodes = findMessageNodes(container);
      nodes.forEach((el, i) => {
        const snap = snapshotMessage(el, i, seq);
        if (!snap.markdown) return;
        if (!collected.has(snap.key)) {
          collected.set(snap.key, snap);
          seq += 1;
        } else {
          const prev = collected.get(snap.key);
          if (snap.connected) {
            prev.order = snap.order;
            prev.connected = true;
            prev.markdown = snap.markdown;
            prev.role = snap.role !== "unknown" ? snap.role : prev.role;
          }
        }
      });
    };

    harvest();

    if (!CONFIG.autoScroll) {
      return collected;
    }

    log("Автоскролл: старт, сообщений:", collected.size);

    for (let round = 0; round < CONFIG.maxScrollRounds; round++) {
      if (Date.now() - startedAt > CONFIG.maxTotalMs) break;
      if (collected.size >= CONFIG.maxMessages) break;

      container.scrollTop = 0;
      window.scrollTo(0, 0);

      await sleep(CONFIG.scrollDelayMs);
      harvest();

      const h = container.scrollHeight;
      if (h === prevHeight) {
        stableRounds += 1;
        if (stableRounds >= 3) break;
      } else {
        stableRounds = 0;
        prevHeight = h;
      }

      log(`Автоскролл round ${round + 1}: messages=${collected.size}, h=${h}`);
    }

    await sleep(CONFIG.settleAfterScrollMs);
    harvest();

    container.scrollTop = startTop;
    log("Автоскролл: готово, всего сообщений:", collected.size);
    return collected;
  }

  function sortSnapshots(snapshots) {
    return snapshots.sort((a, b) => {
      const seqA = a.seq ?? 0;
      const seqB = b.seq ?? 0;
      if (seqA !== seqB) return seqA - seqB;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }

  async function collectAllMessages() {
    const container = findDialogueContainer();
    const collected = await autoScrollAndCollect(container);

    const liveNodes = findMessageNodes(container);
    liveNodes.forEach((el, i) => {
      const snap = snapshotMessage(el, i, collected.get(messageKey(el, i))?.seq);
      if (!snap.markdown) return;
      const prev = collected.get(snap.key);
      collected.set(snap.key, {
        ...snap,
        seq: prev?.seq ?? snap.seq,
        timestamp: snap.timestamp || prev?.timestamp || null,
        role:
          snap.role !== "unknown" ? snap.role : prev?.role || snap.role,
      });
    });

    const messages = sortSnapshots(Array.from(collected.values()))
      .filter((m) => m.markdown)
      .map((m) => ({
        role: m.role,
        markdown: m.markdown,
        timestamp: m.timestamp,
      }))
      .slice(0, CONFIG.maxMessages);

    fillUnknownRoles(messages);
    return messages;
  }

  function collectSelectedMessages() {
    const els = getSelectedMessageElements();
    const messages = els
      .map((el, i) => {
        const snap = snapshotMessage(el, i, i);
        return {
          role: snap.role,
          markdown: snap.markdown,
          timestamp: snap.timestamp,
        };
      })
      .filter((m) => m.markdown);
    fillUnknownRoles(messages);
    return messages;
  }

  function getDialogueTitle() {
    const h1 = document.querySelector("h1");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    const title = (document.title || "").replace(/\s*[-|].*$/, "").trim();
    if (title) return title;
    return location.hostname || "Диалог Qwen";
  }

  function buildSourceUrl() {
    if (CONFIG.includeFullUrl) return location.href;
    return `${location.origin}${location.pathname}`;
  }

  function buildMarkdown(messages, title) {
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const lines = [];

    if (CONFIG.includeMetadata) {
      lines.push("---");
      lines.push(`title: ${JSON.stringify(title)}`);
      lines.push(`source: ${JSON.stringify(buildSourceUrl())}`);
      lines.push(`exported_at: ${JSON.stringify(now)}`);
      lines.push(
        `exporter: ${JSON.stringify(`Dialogue to Markdown/${VERSION}`)}`
      );
      lines.push(`messages: ${messages.length}`);
      lines.push("---");
      lines.push("");
    }

    lines.push(`# ${title}`);
    lines.push("");

    for (const msg of messages) {
      const label = CONFIG.roleLabels[msg.role] || CONFIG.roleLabels.unknown;
      lines.push(`## ${label}`);
      lines.push("");
      if (msg.timestamp) {
        lines.push(`*${msg.timestamp}*`);
        lines.push("");
      }
      lines.push(msg.markdown || "");
      lines.push("");
    }

    return normalizeMarkdown(lines.join("\n")) + "\n";
  }

  function slugify(text) {
    return (
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "dialogue"
    );
  }

  function buildFileName(title, prefix) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
    const p = `${prefix || CONFIG.fileNamePrefix}-`;
    const suffix = `-${stamp}.md`;
    const budget = Math.max(8, 120 - p.length - suffix.length);
    return `${p}${slugify(title).slice(0, budget)}${suffix}`;
  }

  function buildMessageFileName(msg, index) {
    const pad = String(index + 1).padStart(3, "0");
    const roleSlug =
      msg.role === "user"
        ? "user"
        : msg.role === "assistant"
          ? "qwen"
          : "msg";
    const preview = (msg.markdown || "")
      .replace(/^#+\s*/gm, "")
      .trim()
      .slice(0, 40);
    return buildFileName(
      `${pad}-${roleSlug}-${preview || "message"}`,
      CONFIG.fileNamePrefixMsg
    );
  }

  function downloadMarkdown(content, fileName) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  function injectSelectionStyles() {
    if (document.getElementById("qwen-md-export-styles")) return;
    const style = document.createElement("style");
    style.id = "qwen-md-export-styles";
    style.textContent = `
      .qwen-md-msg-wrap { position: relative !important; outline: 2px solid transparent; outline-offset: 2px; transition: outline-color .15s ease, background-color .15s ease; }
      .qwen-md-msg-wrap.qwen-md-selected { outline-color: #0d9488 !important; background-color: rgba(13, 148, 136, 0.08) !important; }
      .qwen-md-select-cb { position: absolute !important; top: 8px !important; left: 8px !important; z-index: 2147483646 !important; width: 18px !important; height: 18px !important; margin: 0 !important; cursor: pointer !important; accent-color: #0d9488 !important; }
      #qwen-md-select-panel { position: fixed !important; bottom: 24px !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 2147483647 !important; display: flex !important; flex-wrap: wrap !important; gap: 8px !important; align-items: center !important; padding: 12px 14px !important; border-radius: 12px !important; background: #134e4a !important; color: #fff !important; font-family: system-ui, sans-serif !important; font-size: 13px !important; box-shadow: 0 8px 28px rgba(0,0,0,.35) !important; max-width: min(920px, calc(100vw - 24px)) !important; }
      #qwen-md-select-panel .qwen-md-count { font-weight: 600; margin-right: 4px; white-space: nowrap; }
      #qwen-md-select-panel button { border: 0 !important; border-radius: 8px !important; padding: 8px 12px !important; cursor: pointer !important; font: inherit !important; background: #0f766e !important; color: #fff !important; }
      #qwen-md-select-panel button:hover { background: #0d9488 !important; }
      #qwen-md-select-panel button:disabled { opacity: 0.45 !important; cursor: not-allowed !important; }
      #qwen-md-select-panel button.qwen-md-secondary { background: #334155 !important; }
      #qwen-md-select-panel button.qwen-md-danger { background: #7f1d1d !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function updatePanelCount() {
    const countEl = document.getElementById("qwen-md-select-count");
    const n = getSelectedMessageElements().length;
    if (countEl) countEl.textContent = `Выбрано: ${n}`;
    const needSel = n > 0;
    const btnSep = document.getElementById("qwen-md-btn-separate");
    const btnOne = document.getElementById("qwen-md-btn-combined");
    if (btnSep) btnSep.disabled = !needSel;
    if (btnOne) btnOne.disabled = !needSel;
  }

  let selectIdSeq = 0;
  function selectionKey(el) {
    if (el.dataset.qwenSelectId) return el.dataset.qwenSelectId;
    const stable =
      el.getAttribute("data-message-id") ||
      el.getAttribute("data-id") ||
      findReqId(el) ||
      el.id ||
      `qsel-${++selectIdSeq}`;
    el.dataset.qwenSelectId = stable;
    return stable;
  }

  function attachCheckbox(msgEl) {
    if (!msgEl) return;
    const prev = selectionState.checkboxes.get(msgEl);
    if (prev?.isConnected) return;

    if (prev) selectionState.checkboxes.delete(msgEl);
    msgEl
      .querySelectorAll(":scope > .qwen-md-select-cb")
      .forEach((n) => n.remove());

    const key = selectionKey(msgEl);
    const shouldCheck = selectionState.selectedKeys.has(key);

    msgEl.classList.add("qwen-md-msg-wrap");
    msgEl.classList.toggle("qwen-md-selected", shouldCheck);

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "qwen-md-select-cb";
    cb.title = "Отметить для экспорта";
    cb.checked = shouldCheck;
    cb.dataset.qwenKey = key;
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      const k = selectionKey(msgEl);
      if (cb.checked) selectionState.selectedKeys.add(k);
      else selectionState.selectedKeys.delete(k);
      msgEl.classList.toggle("qwen-md-selected", cb.checked);
      updatePanelCount();
    });
    msgEl.insertBefore(cb, msgEl.firstChild);
    selectionState.checkboxes.set(msgEl, cb);
  }

  let refreshTimer = null;
  function refreshCheckboxes() {
    if (!selectionState.container) return;
    findMessageNodes(selectionState.container).forEach((el) =>
      attachCheckbox(el)
    );
    updatePanelCount();
  }

  function scheduleRefreshCheckboxes() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshCheckboxes();
    }, 200);
  }

  function getSelectedMessageElements() {
    if (!selectionState.container) return [];
    const nodes = findMessageNodes(selectionState.container);
    return nodes.filter((el) => {
      const key = selectionKey(el);
      const cb =
        selectionState.checkboxes.get(el) ||
        el.querySelector(":scope > .qwen-md-select-cb");
      if (selectionState.selectedKeys.has(key)) {
        if (cb && !cb.checked) cb.checked = true;
        el.classList.add("qwen-md-selected");
        return true;
      }
      return !!(cb && cb.checked);
    });
  }

  function createPanel() {
    document.getElementById("qwen-md-select-panel")?.remove();

    const panel = document.createElement("div");
    panel.id = "qwen-md-select-panel";
    panel.innerHTML = `
      <span class="qwen-md-count" id="qwen-md-select-count">Выбрано: 0</span>
      <button type="button" id="qwen-md-btn-separate" disabled>Скачать по отдельности</button>
      <button type="button" id="qwen-md-btn-combined" disabled>Скачать одним файлом</button>
      <button type="button" id="qwen-md-btn-all" class="qwen-md-secondary">Весь диалог</button>
      <button type="button" id="qwen-md-btn-cancel" class="qwen-md-danger">Отмена</button>
    `;
    document.body.appendChild(panel);
    selectionState.panel = panel;

    panel
      .querySelector("#qwen-md-btn-separate")
      .addEventListener("click", () => exportSelectedSeparate());
    panel
      .querySelector("#qwen-md-btn-combined")
      .addEventListener("click", () => exportSelectedCombined());
    panel
      .querySelector("#qwen-md-btn-all")
      .addEventListener("click", () => exportEntireDialogue());
    panel
      .querySelector("#qwen-md-btn-cancel")
      .addEventListener("click", () => exitSelectionMode());
  }

  function exitSelectionMode() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    selectionState.observer?.disconnect();
    selectionState.observer = null;
    document.querySelectorAll(".qwen-md-select-cb").forEach((cb) => cb.remove());
    document.querySelectorAll(".qwen-md-msg-wrap").forEach((el) => {
      el.classList.remove("qwen-md-msg-wrap", "qwen-md-selected");
      delete el.dataset.qwenSelectId;
    });
    selectionState.panel?.remove();
    selectionState.panel = null;
    selectionState.container = null;
    selectionState.selectedKeys.clear();
    selectIdSeq = 0;
    document.getElementById("qwen-md-export-styles")?.remove();
    window.__qwenMdSelectionActive = false;
    log("Режим выбора закрыт");
  }

  function enterSelectionMode() {
    injectSelectionStyles();
    const container = findDialogueContainer();
    selectionState.container = container;
    window.__qwenMdSelectionActive = true;

    createPanel();
    refreshCheckboxes();

    selectionState.observer = new MutationObserver(() => {
      scheduleRefreshCheckboxes();
    });
    selectionState.observer.observe(container, {
      childList: true,
      subtree: true,
    });

    const n = findMessageNodes(container).length;
    if (n === 0) {
      showToast("Сообщения не найдены. Откройте docs/TROUBLESHOOTING.md", true);
    } else {
      showToast(`Режим выбора: отметьте сообщения (${n} на экране)`);
    }
    log("Режим выбора активен, сообщений:", n);
  }

  async function exportSelectedSeparate() {
    if (window.__qwenDialogueExporterRunning) return;
    const messages = collectSelectedMessages();
    if (!messages.length) {
      showToast("Ничего не выбрано", true);
      return;
    }

    window.__qwenDialogueExporterRunning = true;
    try {
      showToast(`Скачивание ${messages.length} файл(ов)…`);
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const title = `${getDialogueTitle()} — ${CONFIG.roleLabels[msg.role] || "Сообщение"} #${i + 1}`;
        downloadMarkdown(buildMarkdown([msg], title), buildMessageFileName(msg, i));
        if (i < messages.length - 1) {
          await sleep(CONFIG.separateDownloadDelayMs);
        }
      }
      showToast(`Готово: ${messages.length} файл(ов)`);
    } catch (err) {
      console.error("[Dialogue to Markdown]", err);
      showToast("Ошибка: " + (err?.message || String(err)), true);
    } finally {
      window.__qwenDialogueExporterRunning = false;
    }
  }

  function exportSelectedCombined() {
    if (window.__qwenDialogueExporterRunning) return;
    const messages = collectSelectedMessages();
    if (!messages.length) {
      showToast("Ничего не выбрано", true);
      return;
    }

    window.__qwenDialogueExporterRunning = true;
    try {
      const title = `${getDialogueTitle()} (выбранные)`;
      const fileName = buildFileName(title);
      downloadMarkdown(buildMarkdown(messages, title), fileName);
      showToast(`Готово: ${messages.length} сообщ. → ${fileName}`);
    } catch (err) {
      console.error("[Dialogue to Markdown]", err);
      showToast("Ошибка: " + (err?.message || String(err)), true);
    } finally {
      window.__qwenDialogueExporterRunning = false;
    }
  }

  async function exportEntireDialogue() {
    if (window.__qwenDialogueExporterRunning) return;
    window.__qwenDialogueExporterRunning = true;
    try {
      showToast("Экспорт всего диалога…");
      const messages = await collectAllMessages();
      if (!messages.length) {
        showToast(
          "Сообщения не найдены. Откройте docs/TROUBLESHOOTING.md",
          true
        );
        return;
      }
      const title = getDialogueTitle();
      const fileName = buildFileName(title);
      downloadMarkdown(buildMarkdown(messages, title), fileName);
      showToast(`Готово: ${messages.length} сообщ. → ${fileName}`);
    } catch (err) {
      console.error("[Dialogue to Markdown]", err);
      showToast("Ошибка экспорта: " + (err?.message || String(err)), true);
    } finally {
      window.__qwenDialogueExporterRunning = false;
    }
  }

  enterSelectionMode();
})();
