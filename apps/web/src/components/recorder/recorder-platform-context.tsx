import { createContext, useContext, type ReactNode } from "react";

import type { CapturePlatform } from "~/lib/capture-platform";
import { isDesktop, isWeb } from "~/lib/capture-platform";

const RecorderPlatformContext = createContext<CapturePlatform>("web");

export function RecorderPlatformProvider({
  platform,
  children,
}: {
  readonly platform: CapturePlatform;
  readonly children: ReactNode;
}) {
  return (
    <RecorderPlatformContext.Provider value={platform}>{children}</RecorderPlatformContext.Provider>
  );
}

export function useRecorderPlatform(): CapturePlatform {
  return useContext(RecorderPlatformContext);
}

export function useIsWebRecorder(): boolean {
  return isWeb(useRecorderPlatform());
}

export function useIsDesktopRecorder(): boolean {
  return isDesktop(useRecorderPlatform());
}
