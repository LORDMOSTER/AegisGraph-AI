/**
 * useAnomalyClipRecorder.ts
 * Rolling 5-second in-memory webcam buffer.
 * On anomaly, saves a clip from 5s before to 5s after the event.
 * Clips are stored in IndexedDB, never sent to server or written to disk by default.
 * No video is retained outside flagged windows.
 */
import { useRef, useCallback, useEffect } from "react";

const DB_NAME = "aegis_anomaly_clips";
const STORE_NAME = "clips";
const ROLLING_BUFFER_SECONDS = 5;
const MAX_CLIP_DURATION_MS = 15000; // 15 seconds max clip

export interface AnomalyClip {
  id: string;
  examSessionId: string;
  anomalyType: string;
  sessionTimestampMs: number; // ms since exam start
  capturedAt: string; // ISO string
  blob: Blob;
  duration_s: number;
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("examSessionId", "examSessionId", { unique: false });
        store.createIndex("capturedAt", "capturedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveClip(clip: AnomalyClip): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(clip);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getClipsForSession(examSessionId: string): Promise<AnomalyClip[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).index("examSessionId").getAll(examSessionId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteClipsOlderThan(retentionDays: number): Promise<number> {
  const db = await openDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.index("capturedAt").openCursor();
    let deleted = 0;

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
      if (!cursor) {
        resolve(deleted);
        return;
      }
      if (cursor.value.capturedAt < cutoffStr) {
        cursor.delete();
        deleted++;
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteClipsForSession(examSessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).index("examSessionId").openCursor(examSessionId);
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

interface UseAnomalyClipRecorderOptions {
  examSessionId: string;
  cameraStream: MediaStream | null;
  examStartTime: number; // Date.now() when exam started
}

interface UseAnomalyClipRecorderReturn {
  triggerClipSave: (anomalyType: string) => Promise<void>;
  isRecording: boolean;
}

export function useAnomalyClipRecorder({
  examSessionId,
  cameraStream,
  examStartTime,
}: UseAnomalyClipRecorderOptions): UseAnomalyClipRecorderReturn {
  // Rolling buffer: store last N seconds of Blob chunks
  const bufferRef = useRef<{ blob: Blob; timestamp: number }[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const isSavingRef = useRef(false);
  const isActiveRef = useRef(false);

  // Start rolling buffer recording
  useEffect(() => {
    if (!cameraStream) return;

    const supported = typeof MediaRecorder !== "undefined";
    if (!supported) return;

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";

    if (!mimeType) return;

    try {
      const recorder = new MediaRecorder(cameraStream, {
        mimeType,
        videoBitsPerSecond: 500_000, // 500kbps — enough for anomaly review
      });
      recorderRef.current = recorder;
      isActiveRef.current = true;

      const CHUNK_INTERVAL_MS = 1000; // 1s chunks
      const MAX_BUFFER_CHUNKS = ROLLING_BUFFER_SECONDS + 2; // keep slightly more than needed

      recorder.ondataavailable = (e) => {
        if (!isActiveRef.current || e.data.size === 0) return;
        const now = Date.now();
        bufferRef.current.push({ blob: e.data, timestamp: now });

        // Drop chunks older than rolling window + clip post-duration
        const cutoff = now - (ROLLING_BUFFER_SECONDS + MAX_CLIP_DURATION_MS / 1000 + 5) * 1000;
        bufferRef.current = bufferRef.current.filter((c) => c.timestamp > cutoff);

        // Cap buffer size
        if (bufferRef.current.length > MAX_BUFFER_CHUNKS * 2) {
          bufferRef.current = bufferRef.current.slice(-MAX_BUFFER_CHUNKS);
        }
      };

      recorder.start(CHUNK_INTERVAL_MS);
    } catch (err) {
      console.warn("AnomalyClipRecorder: MediaRecorder start failed", err);
    }

    return () => {
      isActiveRef.current = false;
      if (recorderRef.current?.state !== "inactive") {
        try { recorderRef.current?.stop(); } catch {}
      }
      recorderRef.current = null;
      bufferRef.current = [];
    };
  }, [cameraStream]);

  const triggerClipSave = useCallback(
    async (anomalyType: string): Promise<void> => {
      if (isSavingRef.current || !isActiveRef.current) return;
      isSavingRef.current = true;

      const anomalyTime = Date.now();
      const sessionTimestampMs = anomalyTime - examStartTime;

      // Grab pre-anomaly chunks (up to 5s before)
      const preWindow = anomalyTime - ROLLING_BUFFER_SECONDS * 1000;
      const preChunks = bufferRef.current
        .filter((c) => c.timestamp >= preWindow && c.timestamp <= anomalyTime)
        .map((c) => c.blob);

      // Wait for 5s of post-anomaly footage (or MAX_CLIP_DURATION_MS)
      const postDurationMs = Math.min(5000, MAX_CLIP_DURATION_MS - ROLLING_BUFFER_SECONDS * 1000);
      await new Promise((r) => setTimeout(r, postDurationMs));

      // Grab post-anomaly chunks
      const postChunks = bufferRef.current
        .filter((c) => c.timestamp > anomalyTime && c.timestamp <= Date.now())
        .map((c) => c.blob);

      const allChunks = [...preChunks, ...postChunks];
      if (allChunks.length === 0) {
        isSavingRef.current = false;
        return;
      }

      const mimeType = recorderRef.current?.mimeType || "video/webm";
      const clipBlob = new Blob(allChunks, { type: mimeType });
      const duration_s = allChunks.length; // rough approximation since 1 chunk ≈ 1s

      const clip: AnomalyClip = {
        id: `${examSessionId}_${anomalyType}_${anomalyTime}`,
        examSessionId,
        anomalyType,
        sessionTimestampMs,
        capturedAt: new Date(anomalyTime).toISOString(),
        blob: clipBlob,
        duration_s,
      };

      try {
        await saveClip(clip);
        console.log(`[AnomalyClip] Saved ${anomalyType} clip (${clipBlob.size} bytes)`);
      } catch (err) {
        console.error("[AnomalyClip] Failed to save clip:", err);
      } finally {
        isSavingRef.current = false;
      }
    },
    [examSessionId, examStartTime]
  );

  return {
    triggerClipSave,
    isRecording: isActiveRef.current,
  };
}
