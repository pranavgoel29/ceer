import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { CapturePlatform } from "~/lib/capture-platform";
import { isDesktop, isWeb } from "~/lib/capture-platform";

export interface RecorderPlatformContextValue {
  readonly platform: CapturePlatform;
  readonly isWeb: boolean;
  readonly isDesktop: boolean;
}

const RecorderPlatformContext = createContext<RecorderPlatformContextValue | null>(null);

export function RecorderPlatformProvider({
  platform,
  children,
}: {
  readonly platform: CapturePlatform;
  readonly children: ReactNode;
}) {
  const value = useMemo<RecorderPlatformContextValue>(
    () => ({
      platform,
      isWeb: isWeb(platform),
      isDesktop: isDesktop(platform),
    }),
    [platform],
  );

  return (
    <RecorderPlatformContext.Provider value={value}>{children}</RecorderPlatformContext.Provider>
  );
}

function usePlatformContext(): RecorderPlatformContextValue {
  const value = useContext(RecorderPlatformContext);
  if (value === null) {
    throw new Error(
      "Recorder platform hooks must be used within RecorderPlatformProvider (see recorder-app.tsx).",
    );
  }
  return value;
}

/** Full platform state — prefer this when you need more than one flag. */
export function useRecorderPlatformContext(): RecorderPlatformContextValue {
  return usePlatformContext();
}

export function useRecorderPlatform(): CapturePlatform {
  return usePlatformContext().platform;
}

export function useIsWebRecorder(): boolean {
  return usePlatformContext().isWeb;
}

export function useIsDesktopRecorder(): boolean {
  return usePlatformContext().isDesktop;
}
