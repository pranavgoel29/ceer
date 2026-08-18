import { useEffect, useState } from "react";

import { CountdownOverlay } from "~/components/recorder/countdown-overlay";
import { getCountdownOverlayBridge } from "~/lib/countdown-bridge";

export function CountdownPage() {
  const [remaining, setRemaining] = useState(() => getCountdownOverlayBridge()?.getRemaining() ?? 3);

  useEffect(() => {
    const bridge = getCountdownOverlayBridge();
    if (!bridge) {
      return;
    }
    setRemaining(bridge.getRemaining());
    return bridge.onRemaining((next) => {
      setRemaining(next);
    });
  }, []);

  return (
    <CountdownOverlay remaining={remaining} onCancel={() => getCountdownOverlayBridge()?.cancel()} />
  );
}
