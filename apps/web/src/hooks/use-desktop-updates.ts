import { useCallback, useEffect, useState } from "react";

import type { DesktopUpdateState } from "@ceer/contracts";

import { useDesktopBridge } from "~/hooks/use-desktop-bridge";

export function useDesktopUpdates() {
  const bridge = useDesktopBridge();
  const [state, setState] = useState<DesktopUpdateState>(() =>
    bridge?.getUpdateState() ?? { status: "idle" },
  );
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (!bridge) {
      return;
    }

    setState(bridge.getUpdateState());
    return bridge.onUpdateState(setState);
  }, [bridge]);

  const checkForUpdates = useCallback(async () => {
    if (!bridge) {
      return;
    }
    setActionPending(true);
    try {
      await bridge.checkForUpdates();
    } finally {
      setActionPending(false);
    }
  }, [bridge]);

  const downloadUpdate = useCallback(async () => {
    if (!bridge) {
      return;
    }
    setActionPending(true);
    try {
      await bridge.downloadUpdate();
    } finally {
      setActionPending(false);
    }
  }, [bridge]);

  const installUpdate = useCallback(async () => {
    if (!bridge) {
      return;
    }
    setActionPending(true);
    try {
      await bridge.installUpdate();
    } finally {
      setActionPending(false);
    }
  }, [bridge]);

  return {
    state,
    actionPending,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    supported: bridge !== null,
  };
}
