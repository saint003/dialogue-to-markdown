/**
 * Конфигурация Dialogue to Markdown (chat.qwen.ai).
 * Загружается до exporter.js.
 */
(() => {
  "use strict";

  globalThis.__QWEN_MD__ = globalThis.__QWEN_MD__ || {};

  globalThis.__QWEN_MD__.VERSION = "0.2.1";

  /** Домены, на которых разрешён инжект */
  globalThis.__QWEN_MD__.ALLOWED_URL =
    /^https?:\/\/(?:chat\.qwen\.ai|(?:www\.)?qianwen\.com|tongyi\.aliyun\.com|qwen\.aliyun\.com)(?:\/|$)/i;

  globalThis.__QWEN_MD__.CONFIG = {
    containerSelectors: [
      '[class*="chat-message-list"]',
      '[class*="message-list"]',
      '[role="log"]',
      '[role="feed"]',
      'main [class*="chat"]',
      'main [class*="conversation"]',
      '[class*="chat-container"]',
      '[class*="conversation-container"]',
      "main",
    ],

    messageSelectors: [
      "[data-chat-answers-wrap]",
      "[data-chat-question-wrap]",
      ".qwen-chat-message-assistant",
      ".qwen-chat-message-user",
      ".qwen-chat-message",
      ".chat-response-message",
      "[data-message-id]",
      "[data-message-role]",
      "[data-role]",
      '[role="article"]',
      '[class*="message-item"]',
      '[class*="chat-message"]',
      '[class*="conversation-turn"]',
      '[class*="message-bubble"]',
      "article",
      '[data-testid*="message"]',
      '[data-testid*="turn"]',
    ],

    contentSelectors: [
      "#qk-markdown-react",
      ".qwen-markdown",
      ".custom-qwen-markdown",
      ".response-message-content",
      "[data-message-content]",
      '[class*="message-content"]',
      '[class*="markdown"]',
      '[class*="prose"]',
      '[class*="text-content"]',
    ],

    qwenPhaseBlockSelectors: [
      ".response-message-content",
    ],

    roleAttributeSelectors: [
      "[data-role]",
      "[data-message-role]",
      "[data-author]",
      "[data-message-author-role]",
      "[data-author-role]",
      "[aria-label]",
    ],

    userPatterns: /\b(?:user|human|me|query|prompt)\b/i,
    assistantPatterns: /\b(?:assistant|bot|ai|model|qwen|answer|response)\b/i,
    systemPatterns: /\b(?:system|instruction)\b/i,

    excludeSelectors: [
      "button",
      "input",
      "textarea",
      "select",
      '[role="button"]',
      '[role="textbox"]',
      '[aria-hidden="true"]',
      "nav",
      "aside",
      "footer",
      '[class*="sidebar"]',
      '[class*="composer"]',
      '[class*="toolbar"]',
      '[class*="chat-header"]',
      '[class*="page-header"]',
      ".qwen-chat-thinking-status-card",
      '[class*="thinking-status-card"]',
      '[class*="thinking-card"]',
      '[class*="copy-button"]',
      '[class*="line-number"]',
      '[class*="linenumber"]',
      '[class*="line-numbers"]',
      '[class*="code-lang"]',
      '[class*="gutter"]',
      '[class*="action-btn"]',
      '[class*="icon-btn"]',
      '[class*="message-action"]',
      '[class*="avatar"]',
      "svg",
      "canvas",
      "iframe",
    ],

    autoScroll: true,
    maxScrollRounds: 50,
    scrollDelayMs: 500,
    settleAfterScrollMs: 800,
    maxTotalMs: 30000,
    maxMessages: 5000,
    includeMetadata: true,
    includeTimestamps: true,
    includeImages: false,
    includeFullUrl: false,
    fileNamePrefix: "qwen-dialogue",
    fileNamePrefixMsg: "qwen-msg",
    separateDownloadDelayMs: 350,
    debugLog: false,

    roleLabels: {
      user: "Пользователь",
      assistant: "Qwen",
      unknown: "Сообщение",
    },
  };
})();
