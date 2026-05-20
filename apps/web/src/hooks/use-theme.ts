import { useCallback, useSyncExternalStore } from "react";

import {
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  toggleTheme,
  type Theme,
} from "~/lib/theme";

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "dark" as Theme);

  return {
    theme,
    setTheme: useCallback((next: Theme) => setTheme(next), []),
    toggleTheme: useCallback(() => toggleTheme(), []),
  };
}
