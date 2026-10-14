import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { BACKEND_ORIGIN } from "../api";

export interface IngestResult {
  filename: string;
  chunk_count: number;
  extraction_time_ms: number;
  status: string;
  message: string;
}

export interface LogLine {
  id: number;
  text: string;
  type: "info" | "success" | "warn" | "error";
}

interface IngestionContextType {
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  isUploading: boolean;
  result: IngestResult | null;
  logs: LogLine[];
  error: string | null;
  progress: { current: number; total: number; label?: string } | null;
  statusMessage: string;
  manuals: any[];
  fetchManuals: () => Promise<void>;
  handleDeleteManual: (id: string) => Promise<void>;
  startUpload: (file?: File) => Promise<void>;
  reset: () => void;
  addLog: (text: string, type?: LogLine["type"]) => void;
}

const IngestionContext = createContext<IngestionContextType | undefined>(undefined);

let lineCounter = 0;
function newLine(text: string, type: LogLine["type"] = "info"): LogLine {
  return { id: lineCounter++, text, type };
}

export function IngestionProvider({ children }: { children: React.ReactNode }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; label?: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [manuals, setManuals] = useState<any[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchManuals = useCallback(async () => {
    try {
      const token = localStorage.getItem("aegis_token");
      const res = await fetch(`${BACKEND_ORIGIN}/api/v1/hierarchy/manuals`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        setManuals(data);
      }
    } catch (err) {
      console.error("Failed to fetch manuals", err);
    }
  }, []);

  useEffect(() => {
    fetchManuals();
  }, [fetchManuals]);

  const addLog = useCallback((text: string, type: LogLine["type"] = "info") => {
    setLogs((prev) => [...prev, newLine(text, type)]);
  }, []);

  const reset = useCallback(() => {
    setSelectedFile(null);
    setResult(null);
    setLogs([]);
    setError(null);
    setProgress(null);
    setStatusMessage("");
  }, []);

  const handleDeleteManual = async (manualId: string) => {
    try {
      const token = localStorage.getItem("aegis_token");
      const res = await fetch(`${BACKEND_ORIGIN}/api/v1/hierarchy/manuals/${manualId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        addLog("Manual deleted successfully.", "success");
        fetchManuals();
      } else {
        const body = await res.json().catch(() => ({}));
        addLog(`Failed to delete manual: ${body.detail || "Unknown error"}`, "error");
      }
    } catch (err) {
      addLog("Failed to delete manual", "error");
      console.error(err);
    }
  };

  const startUpload = async (fileToUpload?: File) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    if (!fileToUpload && selectedFile) {
      // already set
    } else if (fileToUpload) {
      setSelectedFile(fileToUpload);
    }

    setIsUploading(true);
    setResult(null);
    setLogs([]);
    setError(null);
    setProgress(null);
    setStatusMessage("Initiating upload...");

    addLog(`Initiating PDF ingestion pipeline for: ${file.name}`);
    addLog(`File size: ${(file.size / 1024).toFixed(1)} KB`);

    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const token = localStorage.getItem("aegis_token");
      const response = await fetch(`${BACKEND_ORIGIN}/api/ingest/pdf`, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = (body as { detail?: string }).detail ?? `HTTP ${response.status}`;
        throw new Error(detail);
      }

      if (!response.body) throw new Error("ReadableStream not supported in this browser");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (part.startsWith("data: ")) {
            const jsonStr = part.substring(6);
            try {
              const data = JSON.parse(jsonStr);
              if (data.error) {
                throw new Error(data.error);
              }
              if (data.message) {
                addLog(data.message, "success");
                setStatusMessage(data.message);
                const pageMatch = data.message.match(/Parsed page (\d+)\/(\d+)/);
                if (pageMatch) {
                  setProgress({
                    current: parseInt(pageMatch[1], 10),
                    total: parseInt(pageMatch[2], 10),
                    label: "Parsing page",
                  });
                }
                const ruleOfMatch = data.message.match(/Structuring rule (\d+) of (\d+)/);
                if (ruleOfMatch) {
                  setProgress({
                    current: parseInt(ruleOfMatch[1], 10),
                    total: parseInt(ruleOfMatch[2], 10),
                    label: "Structuring rule",
                  });
                }
                const ruleSingleMatch = data.message.match(/Structuring rule (\d+)\.\.\./);
                if (ruleSingleMatch) {
                  setStatusMessage(`Structuring rule ${ruleSingleMatch[1]}...`);
                }
                const blockMatch = data.message.match(/Structuring rule block (\d+)/);
                if (blockMatch) {
                  setStatusMessage(data.message);
                }
              }
              if (data.done) {
                setStatusMessage("Completed successfully!");
                setResult({
                  filename: file.name,
                  chunk_count: data.rule_count || 0,
                  extraction_time_ms: 0,
                  status: "success",
                  message: data.message || "Manual processed and rules extracted successfully.",
                });
                setTimeout(() => {
                  fetchManuals();
                }, 800);
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                throw e;
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        addLog("Ingestion cancelled.", "warn");
      } else {
        const msg = err instanceof Error ? err.message : "Upload failed.";
        addLog(`ERROR: ${msg}`, "error");
        setError(msg);
        setStatusMessage(`Error: ${msg}`);
      }
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <IngestionContext.Provider
      value={{
        selectedFile,
        setSelectedFile,
        isUploading,
        result,
        logs,
        error,
        progress,
        statusMessage,
        manuals,
        fetchManuals,
        handleDeleteManual,
        startUpload,
        reset,
        addLog,
      }}
    >
      {children}
    </IngestionContext.Provider>
  );
}

export function useIngestion() {
  const context = useContext(IngestionContext);
  if (!context) {
    throw new Error("useIngestion must be used within an IngestionProvider");
  }
  return context;
}
