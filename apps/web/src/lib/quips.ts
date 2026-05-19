export const loadingQuips = [
  "Casting spells on your desktop…",
  "Summoning pixels from the void…",
  "Negotiating with the display gods…",
  "Warming up the capture runes…",
  "Asking nicely for screen access…",
  "Herding windows into frame…",
] as const;

export function pickQuip<T extends readonly string[]>(list: T): T[number] {
  return list[Math.floor(Math.random() * list.length)]!;
}
