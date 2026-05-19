/** Typed API exposed from the desktop preload script to the renderer. */
export interface DesktopBridge {
  readonly getAppInfo: () => DesktopAppInfo;
  readonly ping: () => Promise<string>;
}

export interface DesktopAppInfo {
  readonly name: string;
  readonly version: string;
  readonly platform: "aix" | "android" | "darwin" | "freebsd" | "linux" | "openbsd" | "sunos" | "win32";
  readonly isDevelopment: boolean;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};
