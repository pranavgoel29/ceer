export interface UpdateManifestFile {
  readonly url: string;
  readonly sha512: string;
  readonly size: number;
}

export type UpdateManifestScalar = string | number | boolean;

export interface UpdateManifest {
  readonly version: string;
  readonly releaseDate: string;
  readonly files: ReadonlyArray<UpdateManifestFile>;
  readonly extras: Readonly<Record<string, UpdateManifestScalar>>;
}

interface MutableUpdateManifestFile {
  url?: string;
  sha512?: string;
  size?: number;
}

const FILE_URL_PATTERN = /^ {2}- url:\s*(.+)$/;
const FILE_SHA512_PATTERN = /^ {4}sha512:\s*(.+)$/;
const FILE_SIZE_PATTERN = /^ {4}size:\s*(\d+)$/;
const TOP_LEVEL_PATTERN = /^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/;

function execCapture(pattern: RegExp, line: string): string | null {
  const match = pattern.exec(line);
  return match?.[1] ?? null;
}

function stripSingleQuotes(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function parseFileRecord(
  currentFile: MutableUpdateManifestFile | null,
  sourcePath: string,
  lineNumber: number,
  platformLabel: string,
): UpdateManifestFile | null {
  if (currentFile === null) {
    return null;
  }
  if (
    typeof currentFile.url !== "string" ||
    typeof currentFile.sha512 !== "string" ||
    typeof currentFile.size !== "number"
  ) {
    throw new TypeError(
      `Invalid ${platformLabel} update manifest at ${sourcePath}:${lineNumber}: incomplete file entry.`,
    );
  }
  return {
    url: currentFile.url,
    sha512: currentFile.sha512,
    size: currentFile.size,
  };
}

function parseScalarValue(rawValue: string): UpdateManifestScalar {
  const trimmed = rawValue.trim();
  const isQuoted = trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;
  const value = isQuoted ? trimmed.slice(1, -1).replaceAll("''", "'") : trimmed;
  if (isQuoted) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

interface ParseManifestState {
  readonly files: UpdateManifestFile[];
  readonly extras: Record<string, UpdateManifestScalar>;
  version: string | null;
  releaseDate: string | null;
  inFiles: boolean;
  currentFile: MutableUpdateManifestFile | null;
}

function finalizeCurrentFile(
  state: ParseManifestState,
  sourcePath: string,
  lineNumber: number,
  platformLabel: string,
): void {
  const finalized = parseFileRecord(state.currentFile, sourcePath, lineNumber, platformLabel);
  if (finalized) {
    state.files.push(finalized);
  }
}

function requireCurrentFile(
  state: ParseManifestState,
  sourcePath: string,
  lineNumber: number,
  platformLabel: string,
  field: string,
): asserts state is ParseManifestState & {
  currentFile: MutableUpdateManifestFile;
} {
  if (state.currentFile === null) {
    throw new Error(
      `Invalid ${platformLabel} update manifest at ${sourcePath}:${lineNumber}: ${field} without a file entry.`,
    );
  }
}

function setTopLevelField(
  state: ParseManifestState,
  key: string,
  value: UpdateManifestScalar,
  sourcePath: string,
  lineNumber: number,
  platformLabel: string,
): boolean {
  if (key === "version") {
    if (typeof value !== "string") {
      throw new TypeError(
        `Invalid ${platformLabel} update manifest at ${sourcePath}:${lineNumber}: version must be a string.`,
      );
    }
    state.version = value;
    return true;
  }

  if (key === "releaseDate") {
    if (typeof value !== "string") {
      throw new TypeError(
        `Invalid ${platformLabel} update manifest at ${sourcePath}:${lineNumber}: releaseDate must be a string.`,
      );
    }
    state.releaseDate = value;
    return true;
  }

  if (key === "path" || key === "sha512") {
    return true;
  }

  state.extras[key] = value;
  return true;
}

function processManifestLine(
  state: ParseManifestState,
  line: string,
  lineNumber: number,
  sourcePath: string,
  platformLabel: string,
): void {
  const fileUrl = execCapture(FILE_URL_PATTERN, line);
  if (fileUrl) {
    finalizeCurrentFile(state, sourcePath, lineNumber, platformLabel);
    state.currentFile = { url: stripSingleQuotes(fileUrl.trim()) };
    state.inFiles = true;
    return;
  }

  const fileSha = execCapture(FILE_SHA512_PATTERN, line);
  if (fileSha) {
    requireCurrentFile(state, sourcePath, lineNumber, platformLabel, "sha512");
    state.currentFile.sha512 = stripSingleQuotes(fileSha.trim());
    return;
  }

  const fileSize = execCapture(FILE_SIZE_PATTERN, line);
  if (fileSize) {
    requireCurrentFile(state, sourcePath, lineNumber, platformLabel, "size");
    state.currentFile.size = Number(fileSize);
    return;
  }

  if (line === "files:") {
    state.inFiles = true;
    return;
  }

  if (state.inFiles && state.currentFile !== null) {
    finalizeCurrentFile(state, sourcePath, lineNumber, platformLabel);
    state.currentFile = null;
  }
  state.inFiles = false;

  const topLevelMatch = TOP_LEVEL_PATTERN.exec(line);
  const key = topLevelMatch?.[1];
  const rawValue = topLevelMatch?.[2];
  if (!key || rawValue === undefined) {
    throw new Error(
      `Invalid ${platformLabel} update manifest at ${sourcePath}:${lineNumber}: unsupported line '${line}'.`,
    );
  }

  setTopLevelField(state, key, parseScalarValue(rawValue), sourcePath, lineNumber, platformLabel);
}

export function parseUpdateManifest(
  raw: string,
  sourcePath: string,
  platformLabel: string,
): UpdateManifest {
  const lines = raw.split(/\r?\n/);
  const state: ParseManifestState = {
    files: [],
    extras: {},
    version: null,
    releaseDate: null,
    inFiles: false,
    currentFile: null,
  };

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;
    processManifestLine(state, line, index + 1, sourcePath, platformLabel);
  }

  finalizeCurrentFile(state, sourcePath, lines.length, platformLabel);

  if (!state.version) {
    throw new Error(`Invalid ${platformLabel} update manifest at ${sourcePath}: missing version.`);
  }
  if (!state.releaseDate) {
    throw new Error(
      `Invalid ${platformLabel} update manifest at ${sourcePath}: missing releaseDate.`,
    );
  }
  if (state.files.length === 0) {
    throw new Error(`Invalid ${platformLabel} update manifest at ${sourcePath}: missing files.`);
  }

  return {
    version: state.version,
    releaseDate: state.releaseDate,
    files: state.files,
    extras: state.extras,
  };
}

function mergeExtras(
  primary: Readonly<Record<string, UpdateManifestScalar>>,
  secondary: Readonly<Record<string, UpdateManifestScalar>>,
  platformLabel: string,
): Record<string, UpdateManifestScalar> {
  const merged: Record<string, UpdateManifestScalar> = { ...primary };

  for (const [key, value] of Object.entries(secondary)) {
    const existing = merged[key];
    if (existing !== undefined && existing !== value) {
      throw new Error(
        `Cannot merge ${platformLabel} update manifests: conflicting '${key}' values ('${existing}' vs '${value}').`,
      );
    }
    merged[key] = value;
  }

  return merged;
}

/** electron-updater on macOS requires ZIP; DMG is for manual installs only. */
export function filterMacAutoUpdateFiles(manifest: UpdateManifest): UpdateManifest {
  const zipFiles = manifest.files.filter((file) => file.url.toLowerCase().endsWith(".zip"));
  if (zipFiles.length === 0) {
    const fileList = manifest.files.map((file) => file.url).join(", ") || "(none)";
    throw new Error(
      `macOS update manifest must include at least one .zip file for electron-updater. Found: ${fileList}`,
    );
  }
  return { ...manifest, files: zipFiles };
}

export function mergeUpdateManifests(
  primary: UpdateManifest,
  secondary: UpdateManifest,
  platformLabel: string,
): UpdateManifest {
  if (primary.version !== secondary.version) {
    throw new Error(
      `Cannot merge ${platformLabel} update manifests with different versions (${primary.version} vs ${secondary.version}).`,
    );
  }

  const filesByUrl = new Map<string, UpdateManifestFile>();
  for (const file of [...primary.files, ...secondary.files]) {
    const existing = filesByUrl.get(file.url);
    if (existing && (existing.sha512 !== file.sha512 || existing.size !== file.size)) {
      throw new Error(
        `Cannot merge ${platformLabel} update manifests: conflicting file entry for ${file.url}.`,
      );
    }
    filesByUrl.set(file.url, file);
  }

  return {
    version: primary.version,
    releaseDate: [primary.releaseDate, secondary.releaseDate].toSorted((a, b) =>
      a.localeCompare(b),
    ).at(-1) ?? primary.releaseDate,
    files: [...filesByUrl.values()],
    extras: mergeExtras(primary.extras, secondary.extras, platformLabel),
  };
}

function quoteYamlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function serializeScalarValue(value: UpdateManifestScalar): string {
  if (typeof value === "string") {
    return quoteYamlString(value);
  }
  return String(value);
}

export function serializeUpdateManifest(
  manifest: UpdateManifest,
  options: {
    readonly platformLabel: string;
  },
): string {
  const lines = [`version: ${quoteYamlString(manifest.version)}`, "files:"];

  for (const file of manifest.files) {
    lines.push(
      `  - url: ${file.url}`,
      `    sha512: ${file.sha512}`,
      `    size: ${file.size}`,
    );
  }

  for (const key of Object.keys(manifest.extras).toSorted((a, b) => a.localeCompare(b))) {
    const value = manifest.extras[key];
    if (value === undefined) {
      throw new Error(
        `Cannot serialize ${options.platformLabel} update manifest: missing value for '${key}'.`,
      );
    }
    lines.push(`${key}: ${serializeScalarValue(value)}`);
  }

  lines.push(`releaseDate: ${quoteYamlString(manifest.releaseDate)}`, "");
  return lines.join("\n");
}
