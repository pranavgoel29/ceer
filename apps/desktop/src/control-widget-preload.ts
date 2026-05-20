import type { RecorderRemoteCommand, RecorderRemoteState } from "@ceer/contracts";
import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

const controlWidgetBridge = {
  onRecorderState: (listener: (state: RecorderRemoteState) => void) => {
    const handler = (_event: unknown, state: RecorderRemoteState) => listener(state);
    ipcRenderer.on(IpcChannels.RECORDER_STATE_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.RECORDER_STATE_CHANNEL, handler);
    };
  },
  sendRecorderCommand: (command: RecorderRemoteCommand) => {
    ipcRenderer.send(IpcChannels.RECORDER_COMMAND_CHANNEL, command);
  },
};

contextBridge.exposeInMainWorld("controlWidgetBridge", controlWidgetBridge);
