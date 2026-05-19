import { useMemo } from "react";

export function useDesktopBridge() {
  return useMemo(() => window.desktopBridge ?? null, []);
}
