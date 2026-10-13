import * as SQLite from "expo-sqlite";

const DB_NAME = "monarq_access.db";
const CLAVE = "acceso_ok";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let desbloqueado = false;
const listeners = new Set<(ok: boolean) => void>();

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`create table if not exists gate (
    clave text primary key,
    valor text not null
  );`);
  return db;
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function leerPersistido(): Promise<boolean> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ valor: string }>(
      "select valor from gate where clave = ?",
      [CLAVE],
    );
    return row?.valor === "1";
  } catch {
    // Sin lectura posible: el gate queda cerrado (fail-closed).
    return false;
  }
}

/**
 * Base aparte de monarq.db: se borra al desinstalar, así que cada
 * reinstalación vuelve a pedir el código.
 */
export async function isGateUnlocked(): Promise<boolean> {
  if (desbloqueado) return true;
  const ok = await leerPersistido();
  if (ok) desbloqueado = true;
  return ok;
}

export async function markGateUnlocked(): Promise<void> {
  desbloqueado = true;
  listeners.forEach((cb) => cb(true));
  try {
    const db = await getDb();
    await db.runAsync(
      "insert into gate (clave, valor) values (?, ?) on conflict(clave) do update set valor = excluded.valor",
      [CLAVE, "1"],
    );
  } catch {
    // El flag en memoria sostiene la sesión; se reintentará al próximo arranque.
  }
}

export function onGateChange(cb: (ok: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
