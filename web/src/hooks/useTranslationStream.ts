import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationEvent } from "../../../shared/types.ts";

export interface TranslationStreamState {
  active: boolean;
  chunk: number;
  totalChunks: number;
  linesDone: number;
  totalLines: number;
  error: string | null;
  status: "idle" | "running" | "done" | "cancelled" | "error";
  log: TranslationEvent[];
}

const INITIAL: TranslationStreamState = {
  active: false,
  chunk: 0,
  totalChunks: 0,
  linesDone: 0,
  totalLines: 0,
  error: null,
  status: "idle",
  log: [],
};

export function useTranslationStream(episodeId: string | null) {
  const [state, setState] = useState<TranslationStreamState>(INITIAL);
  const esRef = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!episodeId) return;
    close();
    setState({ ...INITIAL, active: true, status: "running" });
    const es = new EventSource(`/api/episodes/${episodeId}/events`);
    esRef.current = es;

    const handle = (ev: TranslationEvent) => {
      setState((s) => {
        const next: TranslationStreamState = { ...s, log: [...s.log, ev] };
        switch (ev.type) {
          case "start":
            next.totalChunks = ev.total_chunks;
            next.totalLines = ev.total_lines;
            break;
          case "chunk_complete":
            next.chunk = ev.chunk;
            next.totalChunks = ev.of;
            next.linesDone = ev.lines_done;
            next.totalLines = ev.total_lines;
            break;
          case "done":
            next.status = "done";
            next.active = false;
            break;
          case "cancelled":
            next.status = "cancelled";
            next.active = false;
            break;
          case "chunk_error":
            next.error = `chunk ${ev.chunk}: ${ev.error}`;
            break;
          case "error":
            next.status = "error";
            next.error = ev.error;
            next.active = false;
            break;
        }
        return next;
      });
    };

    const eventNames: TranslationEvent["type"][] = [
      "start",
      "chunk_complete",
      "chunk_error",
      "done",
      "cancelled",
      "error",
    ];
    for (const name of eventNames) {
      es.addEventListener(name, (e) => {
        try {
          handle(JSON.parse((e as MessageEvent).data) as TranslationEvent);
        } catch {
          // ignore parse errors on malformed events
        }
      });
    }

    es.onerror = () => {
      setState((s) =>
        s.active
          ? { ...s, status: "error", error: "stream disconnected", active: false }
          : s,
      );
      close();
    };
  }, [episodeId, close]);

  const cancel = useCallback(async () => {
    if (!episodeId) return;
    await fetch(`/api/episodes/${episodeId}/translate/cancel`, {
      method: "POST",
    });
  }, [episodeId]);

  useEffect(() => () => close(), [close]);

  return { state, start, cancel };
}
