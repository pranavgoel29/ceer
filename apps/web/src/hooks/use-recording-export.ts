import { useCallback, useState } from "react";

import { exportRecording } from "~/lib/export-recording";
import {
  exportFileExtension,
  exportMimeType,
  type ExportFormat,
  type ExportResolution,
} from "~/lib/recording-options";

export function useRecordingExport() {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const runExport = useCallback(
    async (
      sourceBlob: Blob,
      format: ExportFormat,
      resolution: ExportResolution,
    ): Promise<Blob | null> => {
      setExporting(true);
      setExportError(null);
      setExportProgress(0);

      try {
        const result = await exportRecording(sourceBlob, format, resolution, ({ ratio }) => {
          setExportProgress(ratio);
        });
        setExportProgress(1);
        return result;
      } catch (cause) {
        setExportError(cause instanceof Error ? cause.message : "Export failed");
        return null;
      } finally {
        setExporting(false);
      }
    },
    [],
  );

  const downloadBlob = useCallback((blob: Blob, format: ExportFormat) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ceer-${Date.now()}.${exportFileExtension(format)}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const resetExportState = useCallback(() => {
    setExportError(null);
    setExportProgress(0);
  }, []);

  return {
    exporting,
    exportProgress,
    exportError,
    runExport,
    downloadBlob,
    resetExportState,
  };
}
