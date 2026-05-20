import { useRecorderPlatform } from "~/components/recorder/recorder-platform-context";
import type { RecorderApi } from "~/hooks/recorder-api";
import { useDesktopRecorder } from "~/hooks/use-desktop-recorder";
import { useWebRecorder } from "~/hooks/use-web-recorder";

/**
 * Unified recorder facade. Both platform hooks run (React hook rules); only the
 * active platform's return value is used. Prefer useDesktopRecorder / useWebRecorder
 * inside platform-specific UI when possible.
 */
export function useRecorder(): RecorderApi {
  const platform = useRecorderPlatform();
  const desktop = useDesktopRecorder();
  const web = useWebRecorder();
  return platform === "desktop" ? desktop : web;
}
