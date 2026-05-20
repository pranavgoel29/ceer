import type { CaptureRegion } from "@ceer/contracts";
import { contextBridge, ipcRenderer } from "electron";

import * as IpcChannels from "./ipc/channels.ts";

const areaPickerBridge = {
  getBackground: () => {
    const dataUrl = ipcRenderer.sendSync(IpcChannels.GET_AREA_PICKER_BACKGROUND_CHANNEL) as
      | string
      | null
      | undefined;
    return dataUrl || null;
  },
  getSources: () => ipcRenderer.sendSync(IpcChannels.GET_AREA_PICKER_SOURCES_CHANNEL),
  getActiveSource: () => ipcRenderer.sendSync(IpcChannels.GET_AREA_PICKER_ACTIVE_SOURCE_CHANNEL),
  setSource: (sourceId: string) => ipcRenderer.invoke(IpcChannels.SET_AREA_PICKER_SOURCE_CHANNEL, sourceId),
  onSourceChanged: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on(IpcChannels.AREA_PICKER_SOURCE_CHANGED_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.AREA_PICKER_SOURCE_CHANGED_CHANNEL, handler);
    };
  },
  complete: (region: CaptureRegion) => {
    ipcRenderer.send(IpcChannels.AREA_PICKER_COMPLETE_CHANNEL, region);
  },
  cancel: () => {
    ipcRenderer.send(IpcChannels.AREA_PICKER_CANCEL_CHANNEL);
  },
};

contextBridge.exposeInMainWorld("areaPickerBridge", areaPickerBridge);
