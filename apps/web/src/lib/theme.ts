export const THEME_STORAGE_KEY = "ceer-theme";

export type Theme = "light" | "dark";

const THEME_CHANGE = "ceer-theme-change";

export function resolveTheme(stored: string | null): Theme {
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "dark";
}

export function readStoredTheme(): Theme {
  try {
    return resolveTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Apply stored theme to `<html>`; call once before React mounts. */
export function initTheme(): Theme {
  const theme = readStoredTheme();
  applyTheme(theme);
  return theme;
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / blocked storage */
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_CHANGE));
}

export function toggleTheme(): Theme {
  const next: Theme = readStoredTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function subscribeTheme(onStoreChange: () => void): () => void {
  const listener = () => onStoreChange();
  window.addEventListener(THEME_CHANGE, listener);
  return () => window.removeEventListener(THEME_CHANGE, listener);
}

export function getThemeSnapshot(): Theme {
  return readStoredTheme();
}
