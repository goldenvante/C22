import { type ReactNode } from "react";

const EMPTY_SUMMARY = {
  pending: 0,
  syncing: 0,
  synced: 0,
  conflict: 0,
  failed: 0,
  total: 0,
  lastSyncedAt: null,
};

export function SyncProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useSync() {
  return {
    summary: EMPTY_SUMMARY,
    syncing: false,
    report: null,
    error: null,
    refresh: async () => EMPTY_SUMMARY,
    syncNow: async () => null,
  };
}
