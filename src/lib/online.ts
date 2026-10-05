import { getConnectivity } from "@/offline/Connectivity";

export const OFFLINE_MESSAGE = "Sin conexión. Revisa tu internet e inténtalo de nuevo.";

const TIMEOUT_MS = 10_000;

/**
 * Ejecuta una petición de red sin colgarse: si NetInfo ya dice que no hay red
 * falla enseguida; si la petición no termina en TIMEOUT_MS la corta. Sin esto
 * las pantallas de listado se quedan girando para siempre en modo avión.
 */
export async function onlineFirst<T>(task: () => Promise<T>): Promise<T> {
  if (getConnectivity().status === "offline") throw new Error(OFFLINE_MESSAGE);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(OFFLINE_MESSAGE)), TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** ¿El fallo viene de la red (y no de la base de datos)? */
export function isOfflineError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.message === OFFLINE_MESSAGE) return true;
  return /network request failed|fetch failed|could not connect|timed? ?out|timeout|socket|sin conexi/i.test(
    e.message,
  );
}
