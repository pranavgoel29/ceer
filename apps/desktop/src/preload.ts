import type { DesktopBridge } from "@ceer/contracts";
import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

const desktopBridge: DesktopBridge = {
  getAppInfo: () => ipcRenderer.sendSync(IpcChannels.GET_APP_INFO_CHANNEL),
  ping: () => ipcRenderer.invoke(IpcChannels.PING_CHANNEL),
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
