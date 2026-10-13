const META_PREFIX = "monarq_meta_";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  return (globalThis as unknown as { localStorage?: Storage }).localStorage ?? null;
}

export function getOfflineDb(): never {
  throw new Error("Sin almacenamiento offline en la web.");
}

export async function run(): Promise<{ changes: number; lastInsertRowId: number }> {
  return { changes: 0, lastInsertRowId: 0 };
}

export async function all<T>(): Promise<T[]> {
  return [];
}

export async function one<T>(): Promise<T | null> {
  return null;
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

export async function readMeta(clave: string): Promise<string | null> {
  try {
    return storage()?.getItem(META_PREFIX + clave) ?? null;
  } catch {
    return null;
  }
}

export async function writeMeta(clave: string, valor: string): Promise<void> {
  try {
    storage()?.setItem(META_PREFIX + clave, valor);
  } catch {
    // Storage lleno o bloqueado: el dato es sólo caché.
  }
}

export async function deleteMeta(clave: string): Promise<void> {
  try {
    storage()?.removeItem(META_PREFIX + clave);
  } catch {
    // Idem.
  }
}
