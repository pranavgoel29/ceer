/** Keep loaders visible long enough to read — without feeling sluggish. */
export const PREVIEW_LOADING_MIN_MS = 750;
export const SOURCES_LOADING_MIN_MS = 500;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitForMinDuration(startedAt: number, minMs: number): Promise<void> {
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await delay(remaining);
  }
}
