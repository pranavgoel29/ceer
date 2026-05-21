export function parseCliArgs(argv: string[]): Map<string, string | boolean> {
  const parsed = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(key, true);
      continue;
    }

    parsed.set(key, next);
    index += 1;
  }

  return parsed;
}

export function requireCliString(
  parsed: Map<string, string | boolean>,
  key: string,
  message: string,
): string {
  const value = parsed.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
  return value;
}

export function getCliString(
  parsed: Map<string, string | boolean>,
  key: string,
): string | undefined {
  const value = parsed.get(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getCliBoolean(
  parsed: Map<string, string | boolean>,
  key: string,
): boolean {
  return parsed.get(key) === true;
}
