import { useEffect, useState } from "react";

import type { DesktopAppInfo } from "@ceer/contracts";

import "./app.css";

export function App() {
  const [appInfo, setAppInfo] = useState<DesktopAppInfo | null>(null);
  const [ping, setPing] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge) {
      return;
    }

    setAppInfo(bridge.getAppInfo());
    void bridge.ping().then(setPing);
  }, []);

  const inElectron = appInfo !== null;

  return (
    <main className="app">
      <header>
        <p className="eyebrow">Ceer</p>
        <h1>Screen recorder</h1>
        <p className="lede">Bun, Turbo, tsdown, and Vite.</p>
      </header>

      <section className="card">
        <h2>Runtime</h2>
        {inElectron ? (
          <dl>
            <div>
              <dt>App</dt>
              <dd>
                {appInfo.name} v{appInfo.version}
              </dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{appInfo.platform}</dd>
            </div>
            <div>
              <dt>IPC</dt>
              <dd>{ping ?? "…"}</dd>
            </div>
          </dl>
        ) : (
          <p>
            Open with <code>bun run dev</code> to load the Electron shell.
          </p>
        )}
      </section>
    </main>
  );
}
