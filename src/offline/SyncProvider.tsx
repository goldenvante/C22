import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { subscribeConnectivity } from "./Connectivity";
import { readSyncSummary, runSync, type SyncReport, type SyncSummary } from "./sync";

const EMPTY_SUMMARY: SyncSummary = {
  pending: 0,
  syncing: 0,
  synced: 0,
  conflict: 0,
  failed: 0,
  total: 0,
  lastSyncedAt: null,
};

export type SyncState = {
  summary: SyncSummary;
  syncing: boolean;
  report: SyncReport | null;
  error: string | null;
  refresh: () => Promise<SyncSummary>;
  syncNow: () => Promise<SyncReport | null>;
};

const SyncContext = createContext<SyncState>({
  summary: EMPTY_SUMMARY,
  syncing: false,
  report: null,
  error: null,
  refresh: async () => EMPTY_SUMMARY,
  syncNow: async () => null,
});

/**
 * Sincroniza automáticamente al montar y cada vez que vuelve la conexión; el
 * drenaje respeta FIFO y se serializa con runSync() para no duplicar carreras.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<SyncSummary>(EMPTY_SUMMARY);
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await readSyncSummary();
    setSummary(next);
    return next;
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const next = await runSync();
      setReport(next);
      return next;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSyncing(false);
      await readSyncSummary().then(setSummary);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh().then((s) => {
      if (!cancelled && s.pending > 0) void syncNow();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, syncNow]);

  useEffect(
    () =>
      subscribeConnectivity((state) => {
        if (!state.online) return;
        void refresh().then((s) => {
          if (s.pending > 0) void syncNow();
        });
      }),
    [refresh, syncNow],
  );

  const value = useMemo<SyncState>(
    () => ({ summary, syncing, report, error, refresh, syncNow }),
    [summary, syncing, report, error, refresh, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  return useContext(SyncContext);
}
