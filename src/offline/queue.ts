import { all, one, run, withTransaction } from "./db";
import { newId } from "./ids";

export type QueueEntityType = "entry" | "expense";
export type QueueOperationType = "create";
export type QueueStatus = "pending" | "in_flight" | "done" | "failed" | "conflict";

export type QueueOperation = {
  id: string;
  entity_type: QueueEntityType;
  operation_type: QueueOperationType;
  payload: string;
  event_id: string | null;
  created_at: number;
  status: QueueStatus;
  retry_count: number;
  next_attempt_at: number;
  last_error: string | null;
  device_id: string | null;
};

type QueueRow = {
  id: string;
  entity_type: string;
  operation_type: string;
  payload: string;
  event_id: string | null;
  created_at: number;
  status: string;
  retry_count: number;
  next_attempt_at: number;
  last_error: string | null;
  device_id: string | null;
};

const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000, 300_000, 900_000];

export const MAX_SYNC_ATTEMPTS = 10;

export function backoffDelayMs(retryCount: number): number {
  const index = Math.min(Math.max(retryCount, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}

function toOperation(row: QueueRow): QueueOperation {
  return {
    id: row.id,
    entity_type: row.entity_type as QueueEntityType,
    operation_type: row.operation_type as QueueOperationType,
    payload: row.payload,
    event_id: row.event_id,
    created_at: row.created_at,
    status: row.status as QueueStatus,
    retry_count: row.retry_count,
    next_attempt_at: row.next_attempt_at,
    last_error: row.last_error,
    device_id: row.device_id,
  };
}

export type EnqueueInput = {
  entityType: QueueEntityType;
  operationType: QueueOperationType;
  payload: unknown;
  eventId?: string | null;
  deviceId?: string | null;
};

export async function enqueueOperation(input: EnqueueInput): Promise<QueueOperation> {
  const now = Date.now();
  const id = newId();
  await run(
    `insert into sync_queue
       (id, entity_type, operation_type, payload, event_id, created_at, status, retry_count, next_attempt_at, device_id)
     values (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [
      id,
      input.entityType,
      input.operationType,
      JSON.stringify(input.payload),
      input.eventId ?? null,
      now,
      now,
      input.deviceId ?? null,
    ],
  );
  const row = await one<QueueRow>("select * from sync_queue where id = ?", [id]);
  if (!row) throw new Error("No se pudo encolar la operación.");
  return toOperation(row);
}

export async function countPending(): Promise<number> {
  const row = await one<{ n: number }>(
    "select count(*) as n from sync_queue where status in ('pending', 'in_flight', 'failed')",
  );
  return Number(row?.n ?? 0);
}

export async function dueOperations(now = Date.now()): Promise<QueueOperation[]> {
  const rows = await all<QueueRow>(
    "select * from sync_queue where status = 'pending' and next_attempt_at <= ? order by created_at asc",
    [now],
  );
  return rows.map(toOperation);
}

export async function claimNextOperation(now = Date.now()): Promise<QueueOperation | null> {
  return withTransaction(async () => {
    const row = await one<QueueRow>(
      "select * from sync_queue where status = 'pending' and next_attempt_at <= ? order by created_at asc limit 1",
      [now],
    );
    if (!row) return null;
    const res = await run(
      "update sync_queue set status = 'in_flight' where id = ? and status = 'pending'",
      [row.id],
    );
    if (res.changes === 0) return null;
    return toOperation({ ...row, status: "in_flight" });
  });
}

export async function markSynced(id: string): Promise<void> {
  await run("update sync_queue set status = 'done', last_error = null where id = ?", [id]);
}

export async function markFailed(id: string, error: string, now = Date.now()): Promise<QueueOperation | null> {
  const row = await one<QueueRow>("select * from sync_queue where id = ?", [id]);
  if (!row) return null;
  const retryCount = row.retry_count + 1;
  const exhausted = retryCount >= MAX_SYNC_ATTEMPTS;
  await run(
    "update sync_queue set status = ?, retry_count = ?, next_attempt_at = ?, last_error = ? where id = ?",
    [exhausted ? "failed" : "pending", retryCount, now + backoffDelayMs(row.retry_count), error, id],
  );
  const next = await one<QueueRow>("select * from sync_queue where id = ?", [id]);
  return next ? toOperation(next) : null;
}

export async function retryOperation(id: string, now = Date.now()): Promise<void> {
  await run(
    "update sync_queue set status = 'pending', retry_count = 0, next_attempt_at = ?, last_error = null where id = ?",
    [now, id],
  );
}

/**
 * El servidor ya resolvió y su veredicto no coincide con lo local: la operación
 * queda registrada con el conflicto visible y nunca se reintenta sola.
 */
export async function markConflict(id: string, error: string): Promise<void> {
  await run("update sync_queue set status = 'conflict', last_error = ? where id = ?", [error, id]);
}

/** Respuesta definitiva que no se reintenta (permiso, payload inválido). */
export async function markRejected(id: string, error: string, now = Date.now()): Promise<void> {
  await run(
    "update sync_queue set status = 'failed', retry_count = ?, next_attempt_at = ?, last_error = ? where id = ?",
    [MAX_SYNC_ATTEMPTS, now, error, id],
  );
}

export async function recoverStaleOperations(now = Date.now()): Promise<number> {
  const res = await run(
    "update sync_queue set status = 'pending', next_attempt_at = ? where status = 'in_flight'",
    [now],
  );
  return res.changes;
}
