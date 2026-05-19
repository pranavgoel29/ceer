import { useEffect, useState } from "react";

import type { DesktopAppInfo } from "@ceer/contracts";
import { Button } from "~/components/ui/button";

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
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Ceer
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Screen recorder</h1>
        <p className="text-sm text-muted-foreground">Bun, Turbo, tsdown, Vite, and shadcn base.</p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Runtime
        </h2>
        {inElectron ? (
          <dl className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <dt className="text-muted-foreground">App</dt>
              <dd>
                {appInfo.name} v{appInfo.version}
              </dd>
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <dt className="text-muted-foreground">Platform</dt>
              <dd>{appInfo.platform}</dd>
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <dt className="text-muted-foreground">IPC</dt>
              <dd>{ping ?? "…"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open with <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">bun run dev</code>{" "}
            to load the Electron shell.
          </p>
        )}
        <Button variant="outline" size="sm" className="w-fit">
          Ready to build
        </Button>
      </section>
    </main>
  );
}
