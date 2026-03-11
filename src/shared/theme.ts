type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'xpather_theme';

function getSystemPreference(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemPreference() : theme;
}

export function loadTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system';
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function initTheme(): Theme {
  const theme = loadTheme();
  applyTheme(resolveTheme(theme));

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = loadTheme();
    if (current === 'system') {
      applyTheme(getSystemPreference());
    }
  });

  return theme;
}

export function cycleTheme(current: Theme): Theme {
  const order: Theme[] = ['system', 'light', 'dark'];
  const currentResolved = resolveTheme(current);
  let idx = (order.indexOf(current) + 1) % order.length;
  let next = order[idx];

  // Skip state that resolves to the same visual theme (e.g., dark → system when system is dark)
  if (resolveTheme(next) === currentResolved) {
    idx = (idx + 1) % order.length;
    next = order[idx];
  }

  saveTheme(next);
  applyTheme(resolveTheme(next));
  return next;
}
