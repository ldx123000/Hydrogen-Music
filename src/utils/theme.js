// Simple theme manager using a single `.dark` class on <html>

const STORAGE_KEY = 'theme'; // 'light' | 'dark' | 'system'

/**
 * 默认主题：深色。
 *
 * 注意一个坑：老版本的默认值是 'system'，而 initTheme() 会把 getSavedTheme()
 * 的结果**写回** localStorage —— 也就是说，即使用户从没进设置改过主题，
 * 机器上也会存着一个 'system'。只把兜底值改成 'dark' 的话，
 * 已经装过 App 的机器会一直"跟随系统"，看不到新默认值。
 * 所以这里配合一次性的迁移标记，把"仍是老默认值"的机器也切到深色。
 */
const DEFAULT_THEME = 'dark';
const DEFAULT_MIGRATION_KEY = 'theme.default.migrated';

export function getSavedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  } catch (_) {
    return DEFAULT_THEME;
  }
}

/**
 * 一次性迁移：把"沿用了老默认值"的主题改成新默认值。
 * 只处理「没存过」和「存的是老默认值 system」两种情况；
 * 用户显式选过的 light / dark 一律不动。
 */
function migrateLegacyDefaultTheme() {
  try {
    if (localStorage.getItem(DEFAULT_MIGRATION_KEY) === 'done') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved || saved === 'system') {
      localStorage.setItem(STORAGE_KEY, DEFAULT_THEME);
    }
    localStorage.setItem(DEFAULT_MIGRATION_KEY, 'done');
  } catch (_) {}
}

function isSystemDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

let mediaListener = null;

function applyClass(isDark) {
  const root = document.documentElement;
  if (isDark) root.classList.add('dark');
  else root.classList.remove('dark');
}

function bindSystemListener() {
  if (!window.matchMedia) return;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mediaListener = (e) => applyClass(e.matches);
  if (mql.addEventListener) mql.addEventListener('change', mediaListener);
  else if (mql.addListener) mql.addListener(mediaListener);
}

function unbindSystemListener() {
  if (!window.matchMedia) return;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  if (mediaListener) {
    if (mql.removeEventListener) mql.removeEventListener('change', mediaListener);
    else if (mql.removeListener) mql.removeListener(mediaListener);
  }
  mediaListener = null;
}

export function setTheme(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (_) {}

  if (mode === 'system') {
    applyClass(isSystemDark());
    unbindSystemListener();
    bindSystemListener();
  } else {
    unbindSystemListener();
    applyClass(mode === 'dark');
  }
}

export function initTheme() {
  migrateLegacyDefaultTheme();
  const saved = getSavedTheme();
  setTheme(saved);
}

