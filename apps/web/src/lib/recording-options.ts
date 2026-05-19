export type ExportFormat = "webm" | "mp4" | "mov";

export type ExportResolution = "source" | "720p" | "1080p" | "1440p";

export const EXPORT_FORMATS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: "webm", label: "WebM (original)", ext: "webm" },
  { value: "mp4", label: "MP4", ext: "mp4" },
  { value: "mov", label: "MOV", ext: "mov" },
];

export const EXPORT_RESOLUTIONS: { value: ExportResolution; label: string }[] = [
  { value: "source", label: "Source (native)" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "1440p", label: "1440p" },
];

export function exportFileExtension(format: ExportFormat): string {
  return EXPORT_FORMATS.find((item) => item.value === format)?.ext ?? "webm";
}

export function exportMimeType(format: ExportFormat): string {
  switch (format) {
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    default:
      return "video/webm";
  }
}
