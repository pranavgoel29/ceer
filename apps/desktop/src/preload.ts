import type { CaptureSourceRef, DesktopBridge } from "@ceer/contracts";
import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

const desktopBridge: DesktopBridge = {
  getAppInfo: () => ipcRenderer.sendSync(IpcChannels.GET_APP_INFO_CHANNEL),
  ping: () => ipcRenderer.invoke(IpcChannels.PING_CHANNEL),
  getDesktopSources: () => ipcRenderer.invoke(IpcChannels.GET_DESKTOP_SOURCES_CHANNEL),
  setCaptureSource: (source: CaptureSourceRef | null) => {
    ipcRenderer.send(IpcChannels.SET_CAPTURE_SOURCE_CHANNEL, source);
  },
  setCapturePreferences: (preferences) => {
    ipcRenderer.send(IpcChannels.SET_CAPTURE_PREFERENCES_CHANNEL, preferences);
  },
  requestMicrophoneAccess: () =>
    ipcRenderer.invoke(IpcChannels.REQUEST_MICROPHONE_ACCESS_CHANNEL),
  pickCaptureRegion: (sourceId) =>
    ipcRenderer.invoke(IpcChannels.PICK_CAPTURE_REGION_CHANNEL, sourceId),
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
