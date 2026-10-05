import * as SQLite from "expo-sqlite";

const DB_NAME = "monarq.db";
const SCHEMA_VERSION = 2;

const SCHEMA_V1 = `
create table if not exists offline_meta (
  clave text primary key,
  valor text not null
);

create table if not exists offline_events (
  id text primary key,
  nombre text not null,
  codigo text not null,
  fecha text not null,
  hora text,
  lugar text,
  imagen_url text,
  mapas_url text,
  estado text not null,
  ultimo_folio integer not null default 0,
  committee_id text,
  prepared_at integer not null,
  downloaded_at integer not null
);

create table if not exists offline_phases (
  id text primary key,
  event_id text not null,
  nombre text not null,
  precio real not null,
  orden integer not null,
  activa integer not null default 1,
  fecha_inicio text,
  fecha_fin text
);
create index if not exists idx_offline_phases_event on offline_phases(event_id);

create table if not exists offline_tickets (
  id text primary key,
  event_id text not null,
  phase_id text,
  folio integer not null,
  comprador_nombre text,
  comprador_telefono text,
  estado text not null,
  es_cortesia integer not null default 0,
  qr_hash text not null,
  downloaded_at integer not null
);
create index if not exists idx_offline_tickets_event on offline_tickets(event_id);
create index if not exists idx_offline_tickets_qr on offline_tickets(qr_hash);

create table if not exists offline_entries (
  operation_id text primary key,
  ticket_id text not null,
  event_id text not null,
  qr_hash text not null,
  local_scanned_at integer not null,
  resultado text not null,
  folio integer,
  comprador_nombre text,
  fase text,
  sync_status text not null default 'pending',
  retry_count integer not null default 0,
  last_error text,
  synced_at integer,
  device_id text
);
create index if not exists idx_offline_entries_ticket on offline_entries(ticket_id);

create table if not exists sync_queue (
  id text primary key,
  entity_type text not null,
  operation_type text not null,
  payload text not null,
  event_id text,
  created_at integer not null,
  status text not null default 'pending',
  retry_count integer not null default 0,
  next_attempt_at integer not null default 0,
  last_error text,
  device_id text
);
create index if not exists idx_sync_queue_status on sync_queue(status, created_at);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const rows = await db.getAllAsync<{ user_version: number }>("PRAGMA user_version");
  const version = Number(rows[0]?.user_version ?? 0);
  if (version < 1) {
    await db.execAsync(SCHEMA_V1);
  }
  if (version < 2) {
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(offline_entries)");
    if (!cols.some((c) => c.name === "device_id")) {
      await db.execAsync("alter table offline_entries add column device_id text");
    }
  }
  if (version < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}

/** Única conexión local; se abre perezosa la primera vez que se consulta. */
export function getOfflineDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function run(
  sql: string,
  params: SQLite.SQLiteBindParams = [],
): Promise<SQLite.SQLiteRunResult> {
  const db = await getOfflineDb();
  return db.runAsync(sql, params);
}

export async function all<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T[]> {
  const db = await getOfflineDb();
  return db.getAllAsync<T>(sql, params);
}

export async function one<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T | null> {
  const db = await getOfflineDb();
  return db.getFirstAsync<T>(sql, params);
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getOfflineDb();
  let out!: T;
  await db.withTransactionAsync(async () => {
    out = await fn();
  });
  return out;
}

export async function readMeta(clave: string): Promise<string | null> {
  const row = await one<{ valor: string }>("select valor from offline_meta where clave = ?", [clave]);
  return row?.valor ?? null;
}

export async function writeMeta(clave: string, valor: string): Promise<void> {
  await run(
    "insert into offline_meta (clave, valor) values (?, ?) on conflict(clave) do update set valor = excluded.valor",
    [clave, valor],
  );
}

export async function deleteMeta(clave: string): Promise<void> {
  await run("delete from offline_meta where clave = ?", [clave]);
}
