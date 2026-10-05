import { supabase } from "@/lib/supabase";

import { getConnectivity } from "./Connectivity";
import { all, one, run } from "./db";
import {
  claimNextOperation,
  markConflict,
  markFailed,
  markRejected,
  markSynced,
  recoverStaleOperations,
  type QueueOperation,
  type QueueStatus,
} from "./queue";

export type SyncBlockReason = "offline" | "no_session";

export type SyncOutcome = "synced" | "conflict" | "rejected" | "retry";

export type SyncStep = {
  operationId: string;
  outcome: SyncOutcome;
  code: string | null;
  duplicate: boolean;
  error: string | null;
};

export type SyncStopReason = "empty" | SyncBlockReason | "retry_scheduled" | "rejected";

export type SyncReport = {
  attempted: number;
  synced: number;
  conflicts: number;
  rejected: number;
  retries: number;
  stopped: SyncStopReason;
};

export type SyncSummary = {
  pending: number;
  syncing: number;
  synced: number;
  conflict: number;
  failed: number;
  total: number;
  lastSyncedAt: number | null;
};

type EntryPayload = {
  eventId: string;
  ticketId: string | null;
  qrHash: string;
  resultado: string;
  localScannedAt: number;
  deviceId: string | null;
};

type SyncEntryResponse = {
  ok?: boolean;
  code?: string | null;
  conflict?: boolean;
  duplicate?: boolean;
  error?: string;
  retryable?: boolean;
};

function emptyReport(stopped: SyncStopReason): SyncReport {
  return { attempted: 0, synced: 0, conflicts: 0, rejected: 0, retries: 0, stopped };
}

function transportMessage(e: unknown): string {
  const message = (e as { message?: string } | null)?.message ?? "";
  if (/network|fetch|failed|could not|timeout/i.test(message)) {
    return "Sin conexión. Se reintentará automáticamente.";
  }
  return message || "No se pudo enviar la operación.";
}

/** Sin red o sin sesión no se reclama ninguna operación (queda en pending). */
export async function checkSyncReady(): Promise<SyncBlockReason | null> {
  if (!getConnectivity().online) return "offline";
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) return "no_session";
  return null;
}

async function mirrorEntry(
  operationId: string,
  status: QueueStatus,
  lastError: string | null,
): Promise<void> {
  await run(
    "update offline_entries set sync_status = ?, last_error = ?, synced_at = ? where operation_id = ?",
    [status, lastError, status === "done" ? Date.now() : null, operationId],
  );
}

async function execute(op: QueueOperation): Promise<SyncStep> {
  const payload = JSON.parse(op.payload) as EntryPayload;
  await mirrorEntry(op.id, "in_flight", null);

  try {
    const { data, error } = await supabase.rpc("sync_offline_entry", {
      p_operation_id: op.id,
      p_event_id: payload.eventId,
      p_ticket_id: payload.ticketId ?? null,
      p_qr_hash: payload.qrHash,
      p_local_resultado: payload.resultado,
      p_device_id: payload.deviceId ?? null,
      p_local_scanned_at: new Date(payload.localScannedAt).toISOString(),
    });

    if (error) {
      const msg = transportMessage(error);
      const next = await markFailed(op.id, msg);
      await mirrorEntry(op.id, next?.status ?? "pending", msg);
      return { operationId: op.id, outcome: "retry", code: null, duplicate: false, error: msg };
    }

    const res = (data ?? {}) as SyncEntryResponse;
    const code = res.code ?? null;

    if (res.error) {
      await markRejected(op.id, res.error);
      await mirrorEntry(op.id, "failed", res.error);
      return { operationId: op.id, outcome: "rejected", code, duplicate: false, error: res.error };
    }
    if (code === "NO_AUTORIZADO") {
      await markRejected(op.id, code);
      await mirrorEntry(op.id, "failed", code);
      return { operationId: op.id, outcome: "rejected", code, duplicate: false, error: code };
    }
    if (res.conflict) {
      await markConflict(op.id, code ?? "CONFLICTO");
      await mirrorEntry(op.id, "conflict", code ?? "CONFLICTO");
      return {
        operationId: op.id,
        outcome: "conflict",
        code,
        duplicate: !!res.duplicate,
        error: null,
      };
    }

    await markSynced(op.id);
    await mirrorEntry(op.id, "done", null);
    return {
      operationId: op.id,
      outcome: "synced",
      code,
      duplicate: !!res.duplicate,
      error: null,
    };
  } catch (e) {
    const msg = transportMessage(e);
    const next = await markFailed(op.id, msg);
    await mirrorEntry(op.id, next?.status ?? "pending", msg);
    return { operationId: op.id, outcome: "retry", code: null, duplicate: false, error: msg };
  }
}

/** Reclama y sincroniza UNA operación en estricto orden FIFO. */
export async function syncNextOperation(now = Date.now()): Promise<SyncStep | null> {
  if ((await checkSyncReady()) !== null) return null;
  const op = await claimNextOperation(now);
  if (!op) return null;
  return execute(op);
}

/**
 * Drena la cola en FIFO. Se detiene ante: sin red, sin sesión, error de
 * transporte (para respetar el orden) o rechazo definitivo del servidor.
 */
export async function syncPendingOperations(): Promise<SyncReport> {
  await recoverStaleOperations();

  const block = await checkSyncReady();
  if (block) return emptyReport(block);

  const report = emptyReport("empty");

  for (;;) {
    const op = await claimNextOperation();
    if (!op) {
      report.stopped = "empty";
      break;
    }
    report.attempted += 1;

    const step = await execute(op);
    if (step.outcome === "synced") report.synced += 1;
    else if (step.outcome === "conflict") report.conflicts += 1;
    else if (step.outcome === "rejected") {
      report.rejected += 1;
      report.stopped = "rejected";
      break;
    } else {
      report.retries += 1;
      report.stopped = "retry_scheduled";
      break;
    }

    const nextBlock = await checkSyncReady();
    if (nextBlock) {
      report.stopped = nextBlock;
      break;
    }
  }

  return report;
}

let activeSync: Promise<SyncReport> | null = null;

/** Evita dos carreras simultáneas (botón manual + auto-sincronización). */
export function runSync(): Promise<SyncReport> {
  if (activeSync) return activeSync;
  activeSync = syncPendingOperations().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export async function readSyncSummary(): Promise<SyncSummary> {
  const rows = await all<{ sync_status: string; n: number }>(
    "select sync_status, count(*) as n from offline_entries group by sync_status",
  );
  const last = await one<{ t: number | null }>(
    "select max(synced_at) as t from offline_entries where synced_at is not null",
  );
  const by = new Map(rows.map((r) => [r.sync_status, Number(r.n)]));
  const pending = (by.get("pending") ?? 0) + (by.get("failed") ?? 0);
  const total = rows.reduce((acc, r) => acc + Number(r.n), 0);
  return {
    pending,
    syncing: by.get("in_flight") ?? 0,
    synced: by.get("done") ?? 0,
    conflict: by.get("conflict") ?? 0,
    failed: by.get("failed") ?? 0,
    total,
    lastSyncedAt: last?.t ?? null,
  };
}
