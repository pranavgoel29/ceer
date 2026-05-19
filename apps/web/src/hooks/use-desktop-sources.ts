import type { CaptureSourceKind, DesktopCaptureSource } from "@ceer/contracts";
import { useCallback, useEffect, useState } from "react";

import { useDesktopBridge } from "~/hooks/use-desktop-bridge";

export function useDesktopSources() {
  const bridge = useDesktopBridge();
  const [sources, setSources] = useState<DesktopCaptureSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bridge) {
      setSources([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await bridge.getDesktopSources();
      setSources(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not list windows");
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sources, loading, error, refresh, inElectron: bridge !== null };
}

export function filterSourcesByKind(
  sources: DesktopCaptureSource[],
  kind: CaptureSourceKind | "all",
) {
  if (kind === "all") {
    return sources;
  }
  return sources.filter((source) => source.kind === kind);
}
