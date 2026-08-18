import type { CountdownOverlayBridge } from "@ceer/contracts";

export function getCountdownOverlayBridge(): CountdownOverlayBridge | undefined {
  return globalThis.window?.countdownOverlayBridge;
}
