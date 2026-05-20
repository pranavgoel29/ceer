import type { ControlWidgetBridge } from "@ceer/contracts";

/** Electron control-widget preload exposes the bridge on `window`. */
export function getControlWidgetBridge(): ControlWidgetBridge | undefined {
  return globalThis.window?.controlWidgetBridge;
}
