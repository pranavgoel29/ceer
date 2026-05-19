export const idleQuips = [
  "Pick a window. Any window. (We won't judge.)",
  "Your pixels are itching to leave the screen.",
  "Hot tip: screens love being recorded on Tuesdays.",
  "Ceer sees all. Ceer records some.",
  "No cap — just capture.",
] as const;

export const armedQuips = [
  "Armed and whimsical. Hit the red blob.",
  "The tape is hungry. Feed it content.",
  "Three… two… whenever you're ready.",
] as const;

export const recordingQuips = [
  "Rolling. Do something interesting.",
  "Live from your desktop — it's you!",
  "The blob is eating pixels. Delicious.",
  "Don't blink. Actually, blink. We have trim later.",
] as const;

export const doneQuips = [
  "Captured. Chef's kiss.",
  "File secured. Fame awaits.",
  "That's a wrap. Literally.",
] as const;

export function pickQuip<T extends readonly string[]>(list: T): T[number] {
  return list[Math.floor(Math.random() * list.length)]!;
}
