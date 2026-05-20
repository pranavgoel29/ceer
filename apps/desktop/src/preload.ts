import type {
  CaptureSourceRef,
  DesktopBridge,
  RecorderRemoteCommand,
  RecorderRemoteState,
} from "@ceer/contracts";
import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

const desktopBridge: DesktopBridge = {
  getAppInfo: () => ipcRenderer.sendSync(IpcChannels.GET_APP_INFO_CHANNEL),
  ping: () => ipcRenderer.invoke(IpcChannels.PING_CHANNEL),
  getDesktopSources: () => ipcRenderer.invoke(IpcChannels.GET_DESKTOP_SOURCES_CHANNEL),
  setCaptureSource: (source: CaptureSourceRef | null) => {
    ipcRenderer.sendSync(IpcChannels.SET_CAPTURE_SOURCE_CHANNEL, source);
  },
  setCapturePreferences: (preferences) => {
    ipcRenderer.sendSync(IpcChannels.SET_CAPTURE_PREFERENCES_CHANNEL, preferences);
  },
  requestMicrophoneAccess: () =>
    ipcRenderer.invoke(IpcChannels.REQUEST_MICROPHONE_ACCESS_CHANNEL),
  pickCaptureRegion: (sourceId) =>
    ipcRenderer.invoke(IpcChannels.PICK_CAPTURE_REGION_CHANNEL, sourceId),
  publishRecorderState: (state: RecorderRemoteState) => {
    ipcRenderer.send(IpcChannels.RECORDER_STATE_PUBLISH_CHANNEL, state);
  },
  onRecorderCommand: (listener: (command: RecorderRemoteCommand) => void) => {
    const handler = (_event: unknown, command: RecorderRemoteCommand) => listener(command);
    ipcRenderer.on(IpcChannels.RECORDER_COMMAND_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.RECORDER_COMMAND_CHANNEL, handler);
    };
  },
  onSelectCaptureSource: (listener: (source: CaptureSourceRef) => void) => {
    const handler = (_event: unknown, source: CaptureSourceRef) => listener(source);
    ipcRenderer.on(IpcChannels.RECORDER_SELECT_SOURCE_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.RECORDER_SELECT_SOURCE_CHANNEL, handler);
    };
  },
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
