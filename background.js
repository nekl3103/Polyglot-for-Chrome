const DEFAULT_SETTINGS = Object.freeze({
  sourceLanguage: 'auto',
  targetLanguage: 'ru',
  instantTranslation: true,
  confirmInstantTranslation: false
});

const MAX_TEXT_LENGTH = 5000;
const ENDPOINTS = [
  { base: 'https://clients5.google.com/translate_a/t', client: 'dict-chrome-ex', format: 'dictionary' },
  { base: 'https://translate.googleapis.com/translate_a/single', client: 'gtx', format: 'single' }
];

function parseTranslation(data, format) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('The translation service returned an unexpected response.');
  }
  if (format === 'dictionary') {
    const [translation, detectedLanguage] = data[0];
    if (typeof translation !== 'string' || !translation.trim()) {
      throw new Error('The translation service returned no translation.');
    }
    return { translation, detectedLanguage: typeof detectedLanguage === 'string' ? detectedLanguage : null };
  }
  const translation = data[0]
    .filter((part) => Array.isArray(part) && typeof part[0] === 'string')
    .map((part) => part[0])
    .join('');
  if (!translation.trim()) throw new Error('The translation service returned no translation.');
  return { translation, detectedLanguage: typeof data[2] === 'string' ? data[2] : null };
}

async function requestTranslation(endpoint, text, sourceLanguage, targetLanguage) {
  const url = new URL(endpoint.base);
  url.search = new URLSearchParams({
    client: endpoint.client,
    sl: sourceLanguage,
    tl: targetLanguage,
    ...(endpoint.format === 'single' ? { dt: 't' } : {}),
    q: text
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Translation service error (${response.status}).`);
  return parseTranslation(await response.json(), endpoint.format);
}

async function translate(text, sourceLanguage, targetLanguage) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Select some text first.');
  if (text.length > MAX_TEXT_LENGTH) throw new Error('Select no more than 5,000 characters.');
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      return await requestTranslation(endpoint, text, sourceLanguage, targetLanguage);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Translation failed.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'translate') return false;
  (async () => {
    try {
      const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
      const source = stored.sourceLanguage || DEFAULT_SETTINGS.sourceLanguage;
      const target = stored.targetLanguage || DEFAULT_SETTINGS.targetLanguage;
      const result = await translate(message.text, source, target);
      sendResponse({ ok: true, ...result });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Translation failed.' });
    }
  })();
  return true;
});

async function sendTranslateCommand(tabId, frameId, text) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'translate-selection', text }, frameId == null ? {} : { frameId });
  } catch {
    // Chrome blocks content scripts on browser pages and some built-in viewers.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'polyglot-translate', title: 'Translate selection', contexts: ['selection'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'polyglot-translate' && tab?.id != null) {
    void sendTranslateCommand(tab.id, info.frameId, info.selectionText);
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) void sendTranslateCommand(tab.id);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'translate-selection') return;
  const activeTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (activeTab?.id != null) void sendTranslateCommand(activeTab.id);
});
