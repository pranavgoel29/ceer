export async function captureWaveform(
  blob: Blob,
  bucketCount: number,
  signal?: AbortSignal,
): Promise<number[]> {
  const count = Math.max(8, Math.min(240, Math.floor(bucketCount)));
  try {
    const buffer = await blob.arrayBuffer();
    if (signal?.aborted) {
      return [];
    }

    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(buffer.slice(0));
      if (signal?.aborted || decoded.length === 0) {
        return [];
      }
      const channel = decoded.getChannelData(0);
      const bucketSize = Math.max(1, Math.floor(channel.length / count));
      const peaks: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const start = index * bucketSize;
        const end = Math.min(channel.length, start + bucketSize);
        let peak = 0;
        for (let sample = start; sample < end; sample += 32) {
          const value = Math.abs(channel[sample] ?? 0);
          if (value > peak) {
            peak = value;
          }
        }
        peaks.push(peak);
      }
      const max = peaks.reduce((highest, value) => Math.max(highest, value), 0) || 1;
      return peaks.map((value) => value / max);
    } finally {
      await context.close();
    }
  } catch {
    return [];
  }
}
