import { parseFechaLocal } from "@/features/events/types";

export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
export const EVENT_END_GRACE_MS = 48 * 60 * 60 * 1000;
export const DOWNLOAD_PAGE_SIZE = 500;

type PhaseWindow = { fecha_fin: string | null };

/**
 * Caduca al terminar el último día relevante (fecha del evento o cierre de
 * fase) más el margen de aprobado. 0 = fecha ilegible => paquete inválido.
 */
export function computeExpiresAt(fecha: string, phases: PhaseWindow[]): number {
  let last = parseFechaLocal(fecha);
  if (!last) return 0;
  for (const phase of phases) {
    if (!phase.fecha_fin) continue;
    const end = parseFechaLocal(phase.fecha_fin);
    if (end && end.getTime() > last.getTime()) last = end;
  }
  const endOfDay = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime() - 1;
  return endOfDay + EVENT_END_GRACE_MS;
}

export function isExpired(expiresAt: number, now = Date.now()): boolean {
  return now > expiresAt;
}

export function isStale(lastSyncAt: number | null, now = Date.now()): boolean {
  if (!lastSyncAt) return true;
  return now - lastSyncAt > STALE_AFTER_MS;
}

export function isEventStateInvalid(estado: string): boolean {
  return estado === "finalizado" || estado === "cancelado";
}
