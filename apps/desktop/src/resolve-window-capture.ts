import { desktopCapturer, screen } from "electron";

import type { CaptureSourceRef, WindowCapturePlan } from "@ceer/contracts";
import { parseCapturerWindowId, toCaptureSourceRef } from "@ceer/contracts";

import { classifySourceKind } from "./resolve-capture-source.ts";
import { findMacWindowFrameByName, readMacWindowFrame } from "./mac-window-frame.ts";

function clampRegion(
  x: number,
  y: number,
  width: number,
  height: number,
  displayWidth: number,
  displayHeight: number,
) {
  const nextX = Math.min(Math.max(0, x), Math.max(0, displayWidth - 2));
  const nextY = Math.min(Math.max(0, y), Math.max(0, displayHeight - 2));
  return {
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: Math.max(2, Math.round(Math.min(width, displayWidth - nextX))),
    height: Math.max(2, Math.round(Math.min(height, displayHeight - nextY))),
  };
}

export async function resolveWindowCapture(ref: CaptureSourceRef): Promise<WindowCapturePlan | null> {
  if (process.platform !== "darwin" || ref.kind !== "window") {
    return null;
  }

  const windowId = parseCapturerWindowId(ref.id);
  const frame =
    (windowId !== null ? await readMacWindowFrame(windowId) : null) ??
    (await findMacWindowFrameByName(ref.name));

  if (!frame) {
    return null;
  }

  const display = screen.getDisplayMatching({
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    width: Math.round(frame.width),
    height: Math.round(frame.height),
  });

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 },
  });
  const screenSource =
    sources.find((source) => source.display_id === String(display.id)) ?? sources[0];
  if (!screenSource) {
    return null;
  }

  const region = clampRegion(
    frame.x - display.bounds.x,
    frame.y - display.bounds.y,
    frame.width,
    frame.height,
    display.bounds.width,
    display.bounds.height,
  );

  return {
    screen: toCaptureSourceRef({
      id: screenSource.id,
      name: screenSource.name,
      kind: classifySourceKind(screenSource.id),
      thumbnailDataUrl: "",
      displayId: screenSource.display_id,
    }),
    pick: {
      region,
      display: { width: display.bounds.width, height: display.bounds.height },
      coordinateSpace: "display",
      sourceId: screenSource.id,
      sourceName: ref.name,
      sourceKind: "window",
    },
  };
}
