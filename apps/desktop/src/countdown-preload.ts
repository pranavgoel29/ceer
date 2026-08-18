import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

const countdownOverlayBridge = {
  getRemaining: () => ipcRenderer.sendSync(IpcChannels.COUNTDOWN_GET_REMAINING_CHANNEL) as number,
  onRemaining: (listener: (remaining: number) => void) => {
    const handler = (_event: unknown, remaining: number) => listener(remaining);
    ipcRenderer.on(IpcChannels.COUNTDOWN_REMAINING_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.COUNTDOWN_REMAINING_CHANNEL, handler);
    };
  },
  cancel: () => {
    ipcRenderer.send(IpcChannels.COUNTDOWN_CANCEL_CHANNEL);
  },
};

contextBridge.exposeInMainWorld("countdownOverlayBridge", countdownOverlayBridge);
