import { useCallback, useRef, useState } from "react";

import { exportRecording } from "~/lib/export-recording";
import {
  exportFileExtension,
  type ExportFormat,
  type ExportResolution,
} from "~/lib/recording-options";

export function useRecordingExport() {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportGenerationRef = useRef(0);

  const runExport = useCallback(
    async (
      sourceBlob: Blob,
      format: ExportFormat,
      resolution: ExportResolution,
    ): Promise<Blob | null> => {
      const generation = ++exportGenerationRef.current;
      setExporting(true);
      setExportError(null);
      setExportProgress(0);

      try {
        const result = await exportRecording(sourceBlob, format, resolution, ({ ratio }) => {
          if (exportGenerationRef.current === generation) {
            setExportProgress(ratio);
          }
        });
        if (exportGenerationRef.current !== generation) {
          return null;
        }
        setExportProgress(1);
        return result;
      } catch (cause) {
        if (exportGenerationRef.current !== generation) {
          return null;
        }
        setExportError(cause instanceof Error ? cause.message : "Export failed");
        return null;
      } finally {
        if (exportGenerationRef.current === generation) {
          setExporting(false);
        }
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
    exportGenerationRef.current += 1;
    setExporting(false);
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
