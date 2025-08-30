// Simple theme manager using a single `.dark` class on <html>

const STORAGE_KEY = 'theme'; // 'light' | 'dark' | 'system'

export function getSavedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'system';
  } catch (_) {
    return 'system';
  }
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
  const saved = getSavedTheme();
  setTheme(saved);
}

