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
const NUMBER_LIMITS = {
  popupWidth: [240, 600],
  popupHeight: [180, 700],
  popupFontSize: [12, 28],
  popupPaddingX: [4, 48],
  popupPaddingY: [4, 48],
  popupOffset: [0, 40]
};
const APPEARANCE_KEYS = Object.keys(DEFAULTS).filter((key) => key.startsWith('popup') || key === 'showCloseButton');
const LANGUAGES = [
  ['ar', 'Arabic'], ['bg', 'Bulgarian'], ['zh-CN', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'], ['cs', 'Czech'], ['da', 'Danish'],
  ['nl', 'Dutch'], ['en', 'English'], ['fi', 'Finnish'], ['fr', 'French'],
  ['de', 'German'], ['el', 'Greek'], ['he', 'Hebrew'], ['hi', 'Hindi'],
  ['hu', 'Hungarian'], ['id', 'Indonesian'], ['it', 'Italian'], ['ja', 'Japanese'],
  ['ko', 'Korean'], ['no', 'Norwegian'], ['fa', 'Persian'], ['pl', 'Polish'],
  ['pt', 'Portuguese'], ['ro', 'Romanian'], ['ru', 'Russian'], ['sr', 'Serbian'],
  ['es', 'Spanish'], ['sv', 'Swedish'], ['th', 'Thai'], ['tr', 'Turkish'],
  ['uk', 'Ukrainian'], ['vi', 'Vietnamese']
];
const form = document.getElementById('settings');
const source = document.getElementById('sourceLanguage');
const target = document.getElementById('targetLanguage');
const status = document.getElementById('status');

function addOption(select, code, label) {
  const option = document.createElement('option');
  option.value = code;
  option.textContent = label;
  select.append(option);
}
addOption(source, 'auto', 'Определять автоматически');
for (const [code, label] of LANGUAGES) {
  addOption(source, code, label);
  addOption(target, code, label);
}

function setFields(values) {
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements.namedItem(key);
    if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = Boolean(value);
    else if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = value;
  }
  updateColorControls();
}

function getNumber(key) {
  const field = form.elements.namedItem(key);
  const [min, max] = NUMBER_LIMITS[key];
  const number = Number(field.value);
  const value = field.value === '' || !Number.isFinite(number) ? DEFAULTS[key] : Math.min(max, Math.max(min, Math.round(number)));
  field.value = value;
  return value;
}

function readSettings() {
  const result = {};
  for (const key of Object.keys(DEFAULTS)) {
    const field = form.elements.namedItem(key);
    if (key in NUMBER_LIMITS) result[key] = getNumber(key);
    else if (field instanceof HTMLInputElement && field.type === 'checkbox') result[key] = field.checked;
    else result[key] = field.value;
  }
  return result;
}

function updateColorControls() {
  for (const [colorKey, autoKey] of [
    ['popupTextColor', 'popupTextColorAuto'],
    ['popupBackgroundColor', 'popupBackgroundAuto']
  ]) {
    const automatic = form.elements.namedItem(autoKey).checked;
    const picker = form.elements.namedItem(colorKey);
    picker.closest('.color-setting').classList.toggle('is-auto', automatic);
    picker.title = automatic ? 'Выберите цвет, чтобы отключить режим по теме браузера' : 'Выбрать цвет';
  }
}

let saveChain = Promise.resolve();
function saveSettings(keys) {
  const all = readSettings();
  const patch = Object.fromEntries(keys.map((key) => [key, all[key]]));
  saveChain = saveChain.catch(() => {}).then(() => chrome.storage.sync.set(patch));
  saveChain.then(() => { status.textContent = 'Настройки сохранены.'; })
    .catch((error) => { status.textContent = `Не удалось сохранить настройки: ${error.message}`; });
}

chrome.storage.sync.get(DEFAULTS).then((stored) => setFields({ ...DEFAULTS, ...stored }))
  .catch((error) => { status.textContent = `Не удалось загрузить настройки: ${error.message}`; });

form.addEventListener('change', (event) => {
  const key = event.target.name;
  if (!key || !(key in DEFAULTS)) return;
  const keys = [key];
  if (key === 'popupTextColor' || key === 'popupBackgroundColor') {
    const autoKey = key === 'popupTextColor' ? 'popupTextColorAuto' : 'popupBackgroundAuto';
    form.elements.namedItem(autoKey).checked = false;
    keys.push(autoKey);
  }
  updateColorControls();
  saveSettings(keys);
});

document.getElementById('resetAppearance').addEventListener('click', () => {
  setFields(Object.fromEntries(APPEARANCE_KEYS.map((key) => [key, DEFAULTS[key]])));
  saveSettings(APPEARANCE_KEYS);
});
