const CLAVE = "monarq_acceso_ok";

let desbloqueado = false;
const listeners = new Set<(ok: boolean) => void>();

function leerPersistido(): boolean {
  try {
    const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    return storage?.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export async function isGateUnlocked(): Promise<boolean> {
  if (desbloqueado) return true;
  const ok = leerPersistido();
  if (ok) desbloqueado = true;
  return ok;
}

export async function markGateUnlocked(): Promise<void> {
  desbloqueado = true;
  listeners.forEach((cb) => cb(true));
  try {
    const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    storage?.setItem(CLAVE, "1");
  } catch {
    // Sin storage: el flag en memoria sostiene la sesión.
  }
}

export function onGateChange(cb: (ok: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
