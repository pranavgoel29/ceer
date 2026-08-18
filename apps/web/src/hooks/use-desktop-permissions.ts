import type { DesktopPermissionStatus, PrivacyPane } from "@ceer/contracts";
import { useCallback, useEffect, useState } from "react";

import { useDesktopBridge } from "~/hooks/use-desktop-bridge";

export function isAccessGranted(status: DesktopPermissionStatus["screen"] | undefined): boolean {
  return status === "granted";
}

export function needsScreenPermissionSetup(
  status: DesktopPermissionStatus | null,
  hasSources: boolean,
  permissionError: boolean,
  loading: boolean,
): boolean {
  if (hasSources) {
    return false;
  }
  if (!status) {
    return false;
  }
  if (status.screen === "not-determined") {
    return true;
  }
  if (loading) {
    return false;
  }
  if (status.screen === "denied" || status.screen === "restricted") {
    return true;
  }
  return permissionError;
}

export function useDesktopPermissions() {
  const bridge = useDesktopBridge();
  const [status, setStatus] = useState<DesktopPermissionStatus | null>(null);
  const [busy, setBusy] = useState<"screen" | "microphone" | "settings" | "relaunch" | null>(
    null,
  );

  const refresh = useCallback(async () => {
    if (!bridge) {
      setStatus(null);
      return;
    }
    const next = await bridge.getPermissionStatus();
    setStatus(next);
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const requestScreen = useCallback(async () => {
    if (!bridge) {
      return false;
    }
    setBusy("screen");
    try {
      const granted = await bridge.requestScreenCaptureAccess();
      await refresh();
      return granted;
    } finally {
      setBusy(null);
    }
  }, [bridge, refresh]);

  const requestMicrophone = useCallback(async () => {
    if (!bridge) {
      return false;
    }
    setBusy("microphone");
    try {
      const granted = await bridge.requestMicrophoneAccess();
      await refresh();
      return granted;
    } finally {
      setBusy(null);
    }
  }, [bridge, refresh]);

  const openPrivacySettings = useCallback(
    async (pane: PrivacyPane) => {
      if (!bridge) {
        return false;
      }
      setBusy("settings");
      try {
        return await bridge.openPrivacySettings(pane);
      } finally {
        setBusy(null);
      }
    },
    [bridge],
  );

  const relaunch = useCallback(async () => {
    if (!bridge) {
      return;
    }
    setBusy("relaunch");
    try {
      await bridge.relaunchApp();
    } finally {
      setBusy(null);
    }
  }, [bridge]);

  return {
    supported: bridge !== null,
    status,
    busy,
    refresh,
    requestScreen,
    requestMicrophone,
    openPrivacySettings,
    relaunch,
  };
}
