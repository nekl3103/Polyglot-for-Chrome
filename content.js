(() => {
  const DEFAULTS = {
    sourceLanguage: 'auto',
    targetLanguage: 'ru',
    instantTranslation: true,
    confirmInstantTranslation: false,
    popupWidth: 360,
    popupHeight: 420,
    popupFontSize: 16,
    popupPaddingX: 19,
    popupPaddingY: 17,
    popupOffset: 8,
    popupTextColorAuto: true,
    popupTextColor: '#252631',
    popupBackgroundAuto: true,
    popupBackgroundColor: '#f5f5f9',
    showCloseButton: true
  };
  let settings = { ...DEFAULTS };
  let requestNumber = 0;
  let host;
  let shadow;
  let settingsRevision = 0;
  let settingsReadId = 0;
  let currentPanel = null;

  async function refreshSettings() {
    const revision = settingsRevision;
    const readId = ++settingsReadId;
    try {
      const stored = await chrome.storage.sync.get(DEFAULTS);
      if (revision === settingsRevision && readId === settingsReadId) settings = { ...DEFAULTS, ...stored };
    } catch {
      // Keep the last known settings if storage is temporarily unavailable.
    }
  }

  void refreshSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    settingsRevision += 1;
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) settings[key] = changes[key].newValue ?? DEFAULTS[key];
    }
    if (currentPanel) showPanel(currentPanel.rect, currentPanel.label, currentPanel.body, currentPanel.isError);
  });

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'polyglot-chrome-root';
    host.style.setProperty('all', 'initial', 'important');
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('z-index', '2147483647', 'important');
    host.style.setProperty('top', '0', 'important');
    host.style.setProperty('left', '0', 'important');
    host.style.setProperty('width', '0', 'important');
    host.style.setProperty('height', '0', 'important');
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; color-scheme: light dark; }
      *, *::before, *::after { box-sizing: border-box; }
      .panel, .confirm { position: fixed; z-index: 2147483647; font: 15px/1.48 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .panel { width: min(var(--panel-width, 360px), calc(100vw - 20px)); max-height: min(55vh, 420px); overflow: auto; padding: var(--panel-padding-y, 17px) var(--panel-padding-x, 19px); border-radius: 11px; border: 1px solid rgba(120,120,130,.16); background: var(--panel-background, rgba(245,245,249,.97)); color: var(--panel-text, #252631); box-shadow: 0 8px 32px rgba(0,0,0,.22); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); animation: appear .18s ease-out; user-select: text; }
      .heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 9px; color: #626674; font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
      .close { border: 0; background: transparent; color: inherit; border-radius: 6px; font: 20px/1 sans-serif; cursor: pointer; padding: 0 2px; }
      .close:hover { color: #272735; }
      .body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--panel-font-size, 16px); line-height: 1.55; }
      .error { color: #ad3542; }
      .spinner { width: 18px; height: 18px; border: 2px solid #bbb8ea; border-top-color: #6252e8; border-radius: 50%; animation: spin .7s linear infinite; }
      .loading-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .loading { display: flex; align-items: center; gap: 10px; color: #656878; font-size: 14px; }
      .confirm { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid rgba(120,120,130,.2); border-radius: 9px; background: rgba(245,245,249,.97); color: #6252e8; box-shadow: 0 4px 15px rgba(0,0,0,.2); font-size: 19px; cursor: pointer; }
      .confirm:hover { background: white; }
      @media (prefers-color-scheme: dark) {
        .panel, .confirm { background: var(--panel-background, rgba(35,36,43,.97)); color: var(--panel-text, #eeeef2); border-color: rgba(220,220,230,.15); }
        .heading, .loading { color: #b4b6c3; }
        .close:hover { color: white; }
        .error { color: #ff99a3; }
        .confirm { color: #b7adff; }
        .confirm:hover { background: #343540; }
      }
      .panel.custom-text .heading, .panel.custom-text .loading { color: inherit; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes appear { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
    `;
    shadow.append(style);
    document.documentElement.append(host);
  }

  function close() {
    currentPanel = null;
    requestNumber += 1;
    if (shadow) shadow.querySelector('.panel, .confirm')?.remove();
  }

  function selectionInfo(fallbackText) {
    const selection = window.getSelection();
    const text = (fallbackText || selection?.toString() || '').trim();
    if (!text) return null;
    let rect = null;
    if (selection && selection.rangeCount && selection.toString().trim() === text) {
      const range = selection.getRangeAt(0);
      const boxes = range.getClientRects();
      rect = boxes.length ? boxes[boxes.length - 1] : range.getBoundingClientRect();
    }
    if (!rect || (!rect.width && !rect.height)) {
      rect = document.activeElement?.getBoundingClientRect?.() || null;
    }
    if (!rect || (!rect.width && !rect.height)) {
      rect = { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2 };
    }
    return { text, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
  }

  function position(element, rect, width, height) {
    const margin = 10;
    const left = Math.max(margin, Math.min(rect.left, innerWidth - width - margin));
    const offset = numberSetting('popupOffset', 0, 40);
    const below = rect.bottom + offset;
    const top = below + height > innerHeight - margin && rect.top - height - offset >= margin
      ? rect.top - height - offset : Math.min(below, innerHeight - height - margin);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.max(margin, Math.round(top))}px`;
  }

  function numberSetting(key, min, max) {
    const value = Number(settings[key]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : DEFAULTS[key];
  }

  function applyAppearance(panel) {
    panel.style.setProperty('--panel-width', `${numberSetting('popupWidth', 240, 600)}px`);
    const height = numberSetting('popupHeight', 180, 700);
    if (height !== DEFAULTS.popupHeight) panel.style.maxHeight = `min(${height}px, calc(100vh - 20px))`;
    panel.style.setProperty('--panel-font-size', `${numberSetting('popupFontSize', 12, 28)}px`);
    panel.style.setProperty('--panel-padding-x', `${numberSetting('popupPaddingX', 4, 48)}px`);
    panel.style.setProperty('--panel-padding-y', `${numberSetting('popupPaddingY', 4, 48)}px`);
    if (!settings.popupTextColorAuto && /^#[0-9a-f]{6}$/i.test(settings.popupTextColor)) {
      panel.style.setProperty('--panel-text', settings.popupTextColor);
      panel.classList.add('custom-text');
    }
    if (!settings.popupBackgroundAuto && /^#[0-9a-f]{6}$/i.test(settings.popupBackgroundColor)) {
      panel.style.setProperty('--panel-background', settings.popupBackgroundColor);
    }
  }

  function makeCloseButton() {
    const dismiss = document.createElement('button');
    dismiss.className = 'close';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Close translation');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', close);
    return dismiss;
  }

  function showPanel(rect, label, body, isError = false) {
    currentPanel = { rect, label, body, isError };
    ensureHost();
    shadow.querySelector('.panel, .confirm')?.remove();
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    applyAppearance(panel);
    if (body === null) {
      const row = document.createElement('div');
      row.className = 'loading-row';
      const content = document.createElement('div');
      content.className = 'loading';
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      spinner.setAttribute('aria-hidden', 'true');
      const message = document.createElement('span');
      message.textContent = 'Translating…';
      content.append(spinner, message);
      row.append(content);
      if (settings.showCloseButton) row.append(makeCloseButton());
      panel.append(row);
    } else {
      const heading = document.createElement('div');
      heading.className = 'heading';
      const title = document.createElement('span');
      title.textContent = label;
      heading.append(title);
      if (settings.showCloseButton) heading.append(makeCloseButton());
      const content = document.createElement('div');
      content.className = isError ? 'body error' : 'body';
      content.textContent = body;
      panel.append(heading, content);
    }
    shadow.append(panel);
    position(panel, rect, panel.offsetWidth, panel.offsetHeight);
  }

  async function translateSelection(info, automatic) {
    const current = ++requestNumber;
    const rect = info.rect;
    const targetLanguage = settings.targetLanguage;
    showPanel(rect, 'Polyglot', null);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'translate', text: info.text });
      if (current !== requestNumber) return;
      if (!result?.ok) throw new Error(result?.error || 'Translation failed.');
      if (automatic && settings.sourceLanguage === 'auto' && result.detectedLanguage === targetLanguage) {
        close();
        return;
      }
      const label = result.detectedLanguage && settings.sourceLanguage === 'auto'
        ? `${result.detectedLanguage} → ${targetLanguage}` : `Polyglot → ${targetLanguage}`;
      showPanel(rect, label, result.translation);
    } catch (error) {
      if (current !== requestNumber) return;
      showPanel(rect, 'Polyglot', error instanceof Error ? error.message : 'Translation failed.', true);
    }
  }

  function showConfirm(info) {
    close();
    ensureHost();
    const button = document.createElement('button');
    button.className = 'confirm';
    button.type = 'button';
    button.setAttribute('aria-label', 'Translate selected text');
    button.title = 'Translate selected text';
    button.textContent = '文';
    button.addEventListener('click', () => { void translateSelection(info, true); });
    shadow.append(button);
    position(button, info.rect, 34, 34);
  }

  document.addEventListener('pointerdown', (event) => {
    if (host && event.composedPath().includes(host)) return;
    close();
  }, true);

  document.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    if (host && event.composedPath().includes(host)) return;
    const active = document.activeElement;
    if (active?.matches?.('input, textarea, [contenteditable="true"]') || active?.isContentEditable) return;
    const info = selectionInfo();
    if (!info) return;
    const interaction = requestNumber;
    void (async () => {
      await refreshSettings();
      if (interaction !== requestNumber || !settings.instantTranslation) return;
      if (settings.confirmInstantTranslation) showConfirm(info);
      else void translateSelection(info, true);
    })();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'translate-selection') return;
    const info = selectionInfo(message.text);
    if (!info) return;
    const interaction = requestNumber;
    void (async () => {
      await refreshSettings();
      if (interaction === requestNumber) void translateSelection(info, false);
    })();
  });
})();
