export type TrackKind = "video" | "audio";

export interface TimelineClip {
  readonly id: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly muted: boolean;
}

export interface ExportSlice {
  readonly startSec: number;
  readonly endSec: number;
  readonly includeAudio: boolean;
}

export const MIN_CLIP_SEC = 0.25;

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sortClips(clips: readonly TimelineClip[]): TimelineClip[] {
  return [...clips].sort((left, right) => left.startSec - right.startSec);
}

export function createInitialClips(durationSec: number, makeId: () => string): TimelineClip[] {
  const duration = Math.max(0, durationSec);
  return [{ id: makeId(), startSec: 0, endSec: duration, muted: false }];
}

export function clipCovering(clips: readonly TimelineClip[], time: number): TimelineClip | null {
  for (const clip of clips) {
    if (time >= clip.startSec && time < clip.endSec) {
      return clip;
    }
  }
  return null;
}

export function splitClips(
  clips: readonly TimelineClip[],
  time: number,
  makeId: () => string,
): TimelineClip[] {
  const target = clipCovering(clips, time);
  if (!target) {
    return [...clips];
  }
  if (time - target.startSec < MIN_CLIP_SEC || target.endSec - time < MIN_CLIP_SEC) {
    return [...clips];
  }

  return sortClips([
    ...clips.filter((clip) => clip.id !== target.id),
    { ...target, endSec: time },
    { id: makeId(), startSec: time, endSec: target.endSec, muted: target.muted },
  ]);
}

export function deleteClip(clips: readonly TimelineClip[], id: string): TimelineClip[] {
  return clips.filter((clip) => clip.id !== id);
}

export function toggleClipMute(clips: readonly TimelineClip[], id: string): TimelineClip[] {
  return clips.map((clip) => (clip.id === id ? { ...clip, muted: !clip.muted } : clip));
}

export function nextPlayableTime(clips: readonly TimelineClip[], time: number): number | null {
  if (clipCovering(clips, time)) {
    return time;
  }
  const next = sortClips(clips).find((clip) => clip.startSec >= time);
  return next?.startSec ?? null;
}

export function firstPlayableTime(clips: readonly TimelineClip[]): number {
  return sortClips(clips)[0]?.startSec ?? 0;
}

export function isAudioAudible(clips: readonly TimelineClip[], time: number): boolean {
  const clip = clipCovering(clips, time);
  return Boolean(clip && !clip.muted);
}

export function keptDuration(clips: readonly TimelineClip[]): number {
  return clips.reduce((sum, clip) => sum + Math.max(0, clip.endSec - clip.startSec), 0);
}

export function isPristineEdit(
  video: readonly TimelineClip[],
  audio: readonly TimelineClip[],
  durationSec: number,
): boolean {
  if (video.length !== 1 || audio.length !== 1) {
    return false;
  }
  const picture = video[0];
  const sound = audio[0];
  if (!picture || !sound || sound.muted) {
    return false;
  }
  return (
    picture.startSec <= 0.05 &&
    picture.endSec >= durationSec - 0.05 &&
    sound.startSec <= 0.05 &&
    sound.endSec >= durationSec - 0.05
  );
}

export function buildExportSlices(
  video: readonly TimelineClip[],
  audio: readonly TimelineClip[],
): ExportSlice[] {
  const slices: ExportSlice[] = [];

  for (const picture of sortClips(video)) {
    const cuts = new Set<number>([picture.startSec, picture.endSec]);
    for (const sound of audio) {
      if (sound.endSec <= picture.startSec || sound.startSec >= picture.endSec) {
        continue;
      }
      cuts.add(Math.max(picture.startSec, sound.startSec));
      cuts.add(Math.min(picture.endSec, sound.endSec));
    }
    const points = [...cuts].sort((left, right) => left - right);
    for (let index = 0; index < points.length - 1; index += 1) {
      const startSec = points[index];
      const endSec = points[index + 1];
      if (startSec === undefined || endSec === undefined || endSec - startSec < 0.04) {
        continue;
      }
      slices.push({
        startSec,
        endSec,
        includeAudio: isAudioAudible(audio, (startSec + endSec) / 2),
      });
    }
  }

  return mergeAdjacentSlices(slices);
}

function mergeAdjacentSlices(slices: readonly ExportSlice[]): ExportSlice[] {
  const merged: ExportSlice[] = [];
  for (const slice of slices) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.includeAudio === slice.includeAudio &&
      Math.abs(previous.endSec - slice.startSec) < 0.02
    ) {
      merged[merged.length - 1] = { ...previous, endSec: slice.endSec };
      continue;
    }
    merged.push(slice);
  }
  return merged;
}

export function resizeClip(
  clips: readonly TimelineClip[],
  id: string,
  edge: "start" | "end",
  time: number,
  durationSec: number,
): TimelineClip[] {
  const target = clips.find((clip) => clip.id === id);
  if (!target) {
    return [...clips];
  }

  const others = clips.filter((clip) => clip.id !== id);
  const leftBound = others
    .filter((clip) => clip.endSec <= target.startSec + 0.001)
    .reduce((max, clip) => Math.max(max, clip.endSec), 0);
  const rightBound = others
    .filter((clip) => clip.startSec >= target.endSec - 0.001)
    .reduce((min, clip) => Math.min(min, clip.startSec), durationSec);

  if (edge === "start") {
    const startSec = clampNumber(time, leftBound, target.endSec - MIN_CLIP_SEC);
    return sortClips(others.concat({ ...target, startSec }));
  }

  const endSec = clampNumber(time, target.startSec + MIN_CLIP_SEC, rightBound);
  return sortClips(others.concat({ ...target, endSec }));
}
