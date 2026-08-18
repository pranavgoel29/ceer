import { useCallback, useSyncExternalStore } from "react";

import {
  DESKTOP_SETTING_DEFAULTS,
  WEB_SETTING_DEFAULTS,
  patchAppSettings,
  readAppSettings,
  subscribeAppSettings,
  type AppSettings,
} from "~/lib/app-settings";

export function useAppSettings(isDesktop: boolean) {
  const defaults = isDesktop ? DESKTOP_SETTING_DEFAULTS : WEB_SETTING_DEFAULTS;

  const getSnapshot = useCallback(() => readAppSettings(defaults), [defaults]);

  const settings = useSyncExternalStore(subscribeAppSettings, getSnapshot, () => defaults);

  const patch = useCallback(
    (next: Partial<AppSettings>) => {
      patchAppSettings(defaults, next);
    },
    [defaults],
  );

  return { settings, patch, defaults };
}
