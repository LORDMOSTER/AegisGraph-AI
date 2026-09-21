import React, { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestResult {
  filename: string;
  chunk_count: number;
  extraction_time_ms: number;
  status: string;
  message: string;
}

interface LogLine {
  id: number;
  text: string;
  type: "info" | "success" | "warn" | "error";
}

let lineCounter = 0;
function newLine(text: string, type: LogLine["type"] = "info"): LogLine {
  return { id: lineCounter++, text, type };
}

const LOG_PREFIX: Record<LogLine["type"], string> = {
  info:    "[ INFO ]",
  success: "[  OK  ]",
  warn:    "[ WARN ]",
  error:   "[ERROR ]",
};

// ─── Inline SVG Icons (zero emoji) ───────────────────────────────────────────

const IconUpload = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="34" height="34" rx="10" stroke="var(--border-violet)" strokeWidth="1.5" strokeDasharray="4 3" />
    <path d="M18 24V14M18 14L13 19M18 14L23 19" stroke="var(--violet-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 28h14" stroke="var(--violet-400)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
  </svg>
);

const IconPDF = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="3" y="2" width="14" height="16" rx="2" stroke="var(--crimson)" strokeWidth="1.5" />
    <path d="M7 7h6M7 10h6M7 13h4" stroke="var(--crimson)" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    <rect x="11" y="1" width="5" height="5" rx="1" fill="var(--void-2)" stroke="var(--crimson)" strokeWidth="1.2" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2 7.5L5.5 11L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconChunk = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="1" y="5.5" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="1" y="10" width="8" height="3" rx="1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M7 4v3.5L9.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const IconSpinner = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ing-spin" aria-hidden="true">
    <circle cx="7" cy="7" r="5.5" stroke="rgba(108,99,255,0.25)" strokeWidth="2" />
    <path d="M7 1.5C4 1.5 1.5 4 1.5 7" stroke="var(--indigo-400)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export function IngestionTerminal() {
  const [isDragOver, setIsDragOver]   = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult]           = useState<IngestResult | null>(null);
  const [logs, setLogs]               = useState<LogLine[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef    = useRef<HTMLDivElement>(null);

  const addLog = useCallback((text: string, type: LogLine["type"] = "info") => {
    setLogs(prev => {
      const next = [...prev, newLine(text, type)];
      setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
      return next;
    });
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted. Please drop a valid .pdf file.");
      return;
    }
    setError(null);
    setResult(null);
    setLogs([]);
    setSelectedFile(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setResult(null);
    setLogs([]);
    setError(null);

    addLog(`Initiating PDF ingestion pipeline for: ${selectedFile.name}`);
    addLog(`File size: ${(selectedFile.size / 1024).toFixed(1)} KB`);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const token = localStorage.getItem("aegis_token");
      const response = await fetch("http://localhost:8000/api/ingest/pdf", {
        method: "POST",
        body: formData,
        headers: token ? { "Authorization": `Bearer ${token}` } : undefined,
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
               }
               if (data.done) {
                 setResult({
                    filename: selectedFile.name,
                    chunk_count: 0,
                    extraction_time_ms: 0,
                    status: "completed",
                    message: data.message
                 });
               }
             } catch (e) {
                if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                    throw e;
                }
             }
          }
        }
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      addLog(`ERROR: ${msg}`, "error");
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setResult(null);
    setLogs([]);
    setError(null);
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <p className="eyebrow">Data Pipeline — Phase 1</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>
          PDF Ingestion Terminal
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.6 }}>
          Upload a digital machinery safety manual in PDF format. The engine extracts clean text
          chunks using pdfplumber (no OCR) and queues them for LLM question generation.
        </p>
      </div>

      {/* ── Drop Zone ── */}
      <div
        className={`drop-zone ${isDragOver ? "drag-over" : ""} ${selectedFile ? "drop-zone--loaded" : ""}`}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => !selectedFile && fileInputRef.current?.click()}
        style={{
          marginBottom: 16,
          cursor: selectedFile ? "default" : "pointer",
          borderColor: isDragOver ? "var(--violet-500)" : selectedFile ? "var(--emerald)" : undefined,
          background: isDragOver
            ? "var(--violet-tint)"
            : selectedFile
              ? "var(--emerald-dim)"
              : undefined,
          transition: "all 200ms ease",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
        <motion.div
          animate={{ scale: isDragOver ? 1.04 : 1 }}
          transition={{ duration: 0.15 }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
        >
          {selectedFile ? (
            <>
              <IconPDF />
              <p style={{ fontSize: 14, color: "var(--emerald)", fontWeight: 600 }}>
                {selectedFile.name}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {(selectedFile.size / 1024).toFixed(1)} KB · Ready to ingest
              </p>
            </>
          ) : (
            <>
              <IconUpload />
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>
                Drop a <strong style={{ color: "var(--violet-400)" }}>PDF manual</strong> here or{" "}
                <span style={{ color: "var(--cyan)", textDecoration: "underline" }}>click to browse</span>
              </p>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Accepts: Digital PDF files only · No OCR — selectable text required
              </p>
            </>
          )}
        </motion.div>
      </div>

      {/* ── Error Banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="card"
            style={{ borderColor: "var(--crimson)", marginBottom: 12, padding: "12px 16px" }}
          >
            <p style={{ color: "var(--crimson)", fontSize: 13 }}>
              <strong>Pipeline Error:</strong> {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Action Bar ── */}
      <AnimatePresence>
        {selectedFile && !result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="card"
            style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <p className="eyebrow" style={{ marginBottom: 4 }}>Ready for Extraction</p>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                pdfplumber will extract text chunks from{" "}
                <span style={{ color: "var(--violet-400)", fontWeight: 600 }}>{selectedFile.name}</span>
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost"
                onClick={reset}
                disabled={isUploading}
                style={{ fontSize: 12 }}
              >
                Clear
              </button>
              <button
                className="btn btn-emerald"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <><IconSpinner /> Extracting...</>
                ) : (
                  "Start PDF Extraction"
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Success Result Card ── */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
            style={{
              marginBottom: 16,
              borderColor: "var(--emerald)",
              background: "var(--emerald-dim)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <p className="eyebrow" style={{ color: "var(--emerald)", marginBottom: 6 }}>
                  Extraction Successful
                </p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {result.message}
                </p>
              </div>
              <span className="badge badge-emerald" style={{ flexShrink: 0, marginLeft: 12 }}>
                <IconCheck /> Queued
              </span>
            </div>

            {/* Metrics row */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconChunk />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{result.chunk_count}</strong> text chunks
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconClock />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{result.extraction_time_ms}ms</strong> extraction
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconPDF />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{result.filename}</strong>
                </span>
              </div>
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
              <button className="btn btn-ghost" onClick={reset} style={{ fontSize: 12 }}>
                Upload Another PDF
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Terminal Log ── */}
      <AnimatePresence>
        {logs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="terminal-window" style={{ marginTop: 24 }}>
              <div className="terminal-header">
                <div className="terminal-dot" style={{ background: "#ff5f56" }} />
                <div className="terminal-dot" style={{ background: "#ffbd2e" }} />
                <div className="terminal-dot" style={{ background: "#27c93f" }} />
                <span style={{ marginLeft: 8, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)", letterSpacing: "0.05em" }}>
                  bash — pdfplumber pipeline
                </span>
              </div>
              <div className="terminal-body">
                <AnimatePresence>
                  {logs.map(line => (
                    <motion.div
                      key={line.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.14 }}
                      className={`terminal-line ${
                        line.type === 'error' ? 'terminal-line-error' :
                        line.type === 'warn' ? 'terminal-line-warn' :
                        line.type === 'info' ? 'terminal-line-dim' : ''
                      }`}
                    >
                      <span>{LOG_PREFIX[line.type]} </span>
                      <span>{line.text}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={logEndRef} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
