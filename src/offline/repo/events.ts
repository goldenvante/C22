import { one } from "../db";
import { readOfflineStatus, type OfflineStatus } from "../prepare";

export type OfflineBlockReason = "NO_PREPARADO" | "EVENTO_INVALIDO" | "PAQUETE_EXPIRADO";

export const OFFLINE_BLOCK_MESSAGES: Record<OfflineBlockReason, string> = {
  NO_PREPARADO: "Este evento no está preparado para uso sin conexión.",
  EVENTO_INVALIDO:
    "El evento está finalizado o cancelado: no se permite validar entradas sin conexión.",
  PAQUETE_EXPIRADO:
    "El paquete sin conexión caducó. Conéctate y vuelve a preparar el evento.",
};

export type OfflineEvent = {
  id: string;
  nombre: string;
  codigo: string;
  fecha: string;
  estado: string;
};

export type OfflineGate = {
  allowed: boolean;
  reason: OfflineBlockReason | null;
  status: OfflineStatus | null;
  stale: boolean;
};

export async function getOfflineEvent(eventId: string): Promise<OfflineEvent | null> {
  return one<OfflineEvent>(
    "select id, nombre, codigo, fecha, estado from offline_events where id = ?",
    [eventId],
  );
}

/**
 * Política de vigencia de src/offline/policy.ts: evento finalizado/cancelado o
 * paquete expirado bloquean; stale (>12 h) sólo advierte y no bloquea.
 */
export async function getOfflineGate(eventId: string): Promise<OfflineGate> {
  const status = await readOfflineStatus(eventId);
  if (!status) {
    return { allowed: false, reason: "NO_PREPARADO", status: null, stale: true };
  }
  if (status.invalidState) {
    return { allowed: false, reason: "EVENTO_INVALIDO", status, stale: status.stale };
  }
  if (status.expired) {
    return { allowed: false, reason: "PAQUETE_EXPIRADO", status, stale: status.stale };
  }
  return { allowed: true, reason: null, status, stale: status.stale };
}
