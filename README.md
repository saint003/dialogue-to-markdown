# Dialogue to Markdown

A Chrome extension (Manifest V3) that exports conversations from [chat.qwen.ai](https://chat.qwen.ai/) to Markdown files.

Everything runs **locally in your browser**. No servers, no analytics, no external libraries.

## Features

- **Selective export** — checkboxes on each message; export one, several, or all
- **Three export modes**
  - **Separate files** — one `.md` per selected message
  - **Single file** — all selected messages in one `.md`
  - **Full dialogue** — entire chat in one file (auto-scrolls to load history)
- **Role detection** — labels messages as User / Qwen
- **Rich Markdown** — text, headings, links, lists, tables, and code blocks
- **Qwen Studio support** — captures all assistant phase blocks (tool calls, search, final answer)
- **Thinking blocks excluded** — reasoning/thinking UI is not exported
- **Minimal permissions** — only `activeTab` and `scripting`

## Supported sites

The extension injects only on:

- `chat.qwen.ai`
- `qianwen.com`
- `tongyi.aliyun.com`
- `qwen.aliyun.com`

## Install in Google Chrome

### 1. Get the extension files

Clone or download this repository. You need the folder that contains `manifest.json` at its root.

### 2. Open the Extensions page

In Chrome, go to:

```
chrome://extensions
```

Or: **Menu (⋮) → Extensions → Manage Extensions**

### 3. Enable Developer mode

Turn on **Developer mode** (toggle in the top-right corner).

### 4. Load the extension

1. Click **Load unpacked**
2. Select the project folder (the one with `manifest.json`, `background.js`, `config.js`, `markdown.js`, `exporter.js`)
3. The extension **Dialogue to Markdown** should appear in the list

### 5. Pin the icon (optional)

Click the puzzle-piece icon in the Chrome toolbar → pin **Dialogue to Markdown** for quick access.

### After updating the code

1. On `chrome://extensions`, click **Reload** on the extension card
2. Refresh the Qwen chat tab (`F5`)

## How to use

1. Open [chat.qwen.ai](https://chat.qwen.ai/) and the conversation you want to export
2. Click the **Dialogue to Markdown** toolbar icon
3. Checkboxes appear on messages; a panel shows at the bottom:
   - **Download separately** — `qwen-msg-001-user-….md`, `qwen-msg-002-qwen-….md`, …
   - **Download as one file** — one `.md` with selected messages only
   - **Full dialogue** — entire chat in a single file
   - **Cancel** — exit selection mode
4. Select the messages you need, then click an export button

Exported files include YAML front matter (title, source URL, export time, extension version). Open them in any text editor, notes app, or Markdown viewer.

## Customizing selectors

If messages are not detected or roles are wrong after a Qwen UI update:

1. Open **DevTools** on the chat page (`F12`)
2. Inspect message nodes in the DOM
3. Update selectors in `config.js` (the `CONFIG` object)

## Limitations

- **Selection mode** only shows messages currently in the DOM — scroll up to load older messages before selecting
- **Full dialogue** mode auto-scrolls to load history (may take a moment on long chats)
- Chrome may ask to allow **multiple downloads** when exporting separately
- Code block formatting uses DOM heuristics; unusual layouts may need selector tweaks

## Privacy

- Chat content is **never sent** to any server
- No cookies API, sync storage, or network requests from the extension
- Files are created locally via `Blob` and the browser download API

## Project structure

```
manifest.json   — Manifest V3 entry point
background.js   — Service worker; injects scripts on allowed domains
config.js       — Selectors, version, export settings
markdown.js     — DOM → Markdown conversion
exporter.js     — Selection UI and file download
README.md       — This file
```

## License

Use and modify as you need for personal or internal workflows.
