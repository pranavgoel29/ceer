import type { CaptureSourceKind, DesktopCaptureSource } from "@ceer/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDesktopBridge } from "~/hooks/use-desktop-bridge";
import { SOURCES_LOADING_MIN_MS, waitForMinDuration } from "~/lib/min-duration";

export function useDesktopSources() {
  const bridge = useDesktopBridge();
  const [sources, setSources] = useState<DesktopCaptureSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!bridge) {
      setSources([]);
      return;
    }

    const generation = ++refreshGenerationRef.current;
    const loadingStartedAt = Date.now();
    setLoading(true);
    setError(null);

    try {
      const next = await bridge.getDesktopSources();
      if (refreshGenerationRef.current === generation) {
        setSources(next);
      }
    } catch (cause) {
      if (refreshGenerationRef.current === generation) {
        setError(cause instanceof Error ? cause.message : "Could not list windows");
        setSources([]);
      }
    } finally {
      await waitForMinDuration(loadingStartedAt, SOURCES_LOADING_MIN_MS);
      if (refreshGenerationRef.current === generation) {
        setLoading(false);
      }
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
