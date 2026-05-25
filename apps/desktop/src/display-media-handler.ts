import type { CapturePreferences, CaptureSourceRef } from "@ceer/contracts";
import type { DesktopCapturerSource, Session } from "electron";

import { pickCapturerVideoSource } from "./resolve-capture-source.ts";
import {
  ensureScreenCaptureAccess,
  throwIfDesktopCapturerAccessFailure,
} from "./screen-capture-permission.ts";

export interface DisplayMediaHandlerState {
  selectedCaptureSource: CaptureSourceRef | null;
  capturePreferences: CapturePreferences;
}

export function registerDisplayMediaHandler(
  session: Session,
  getState: () => DisplayMediaHandlerState,
): void {
  session.setDisplayMediaRequestHandler((request, callback) => {
    void handleDisplayMediaRequest(request, callback, getState).catch((error) => {
      console.error("[ceer] displayMedia handler failed:", error);
      try {
        callback({});
      } catch {
        // Handler may already have responded.
      }
    });
  });
}

async function handleDisplayMediaRequest(
  request: { audioRequested: boolean },
  callback: (response: { video?: DesktopCapturerSource; audio?: "loopback" }) => void,
  getState: () => DisplayMediaHandlerState,
): Promise<void> {
  let responded = false;
  const respond = (response: { video?: DesktopCapturerSource; audio?: "loopback" }) => {
    if (responded) {
      return;
    }
    responded = true;
    callback(response);
  };

  await ensureScreenCaptureAccess();

  const { desktopCapturer } = await import("electron");
  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 1, height: 1 },
    });
  } catch (error) {
    throwIfDesktopCapturerAccessFailure(error);
  }

  const { selectedCaptureSource, capturePreferences } = getState();
  const video = pickCapturerVideoSource(sources, selectedCaptureSource);

  if (!video) {
    respond({});
    return;
  }

  const wantsSystemAudio = capturePreferences.systemAudioEnabled && request.audioRequested;

  respond({
    video,
    ...(wantsSystemAudio ? { audio: "loopback" as const } : {}),
  });
}
