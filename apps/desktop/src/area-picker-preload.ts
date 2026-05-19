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
  complete: (region: CaptureRegion) => {
    ipcRenderer.send(IpcChannels.AREA_PICKER_COMPLETE_CHANNEL, region);
  },
  cancel: () => {
    ipcRenderer.send(IpcChannels.AREA_PICKER_CANCEL_CHANNEL);
  },
};

contextBridge.exposeInMainWorld("areaPickerBridge", areaPickerBridge);
