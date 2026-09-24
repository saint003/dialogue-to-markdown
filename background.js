/**
 * Service Worker расширения Dialogue to Markdown.
 * По клику на иконку инжектит config.js, markdown.js, exporter.js.
 */

const ALLOWED_URL =
  /^https?:\/\/(?:chat\.qwen\.ai|(?:www\.)?qianwen\.com|tongyi\.aliyun\.com|qwen\.aliyun\.com)(?:\/|$)/i;

const SCRIPT_FILES = ["config.js", "markdown.js", "exporter.js"];

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    console.warn("[Dialogue to Markdown] Нет активной вкладки");
    return;
  }

  if (!tab.url || !/^https?:/i.test(tab.url)) {
    console.warn(
      "[Dialogue to Markdown] Страница недоступна для скрипта:",
      tab.url
    );
    return;
  }

  if (!ALLOWED_URL.test(tab.url)) {
    console.warn(
      "[Dialogue to Markdown] Расширение работает только на chat.qwen.ai / qianwen.com:",
      tab.url
    );
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: SCRIPT_FILES,
    });
  } catch (err) {
    console.error("[Dialogue to Markdown] Ошибка инжекта:", err);
  }
});
