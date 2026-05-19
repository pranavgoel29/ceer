import type { DesktopBridge } from "@ceer/contracts";
import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

const desktopBridge: DesktopBridge = {
  getAppInfo: () => ipcRenderer.sendSync(IpcChannels.GET_APP_INFO_CHANNEL),
  ping: () => ipcRenderer.invoke(IpcChannels.PING_CHANNEL),
  getDesktopSources: () => ipcRenderer.invoke(IpcChannels.GET_DESKTOP_SOURCES_CHANNEL),
  setCaptureSource: (sourceId) => {
    ipcRenderer.send(IpcChannels.SET_CAPTURE_SOURCE_CHANNEL, sourceId);
  },
  setCapturePreferences: (preferences) => {
    ipcRenderer.send(IpcChannels.SET_CAPTURE_PREFERENCES_CHANNEL, preferences);
  },
  requestMicrophoneAccess: () =>
    ipcRenderer.invoke(IpcChannels.REQUEST_MICROPHONE_ACCESS_CHANNEL),
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
