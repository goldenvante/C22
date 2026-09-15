export type EventEstado = "borrador" | "publicado" | "finalizado" | "cancelado";

export type EventItem = {
  id: string;
  nombre: string;
  codigo: string;
  fecha: string; // YYYY-MM-DD
  hora: string | null; // HH:MM:SS o null
  lugar: string | null;
  imagen_url: string | null;
  /** URL de Google/Apple Maps pegada por el admin (opcional, para QR). */
  mapas_url: string | null;
  estado: EventEstado;
  ultimo_folio: number;
  created_at: string;
};

export type EventPhase = {
  id: string;
  event_id: string;
  nombre: string;
  precio: number;
  orden: number;
  activa: boolean;
  fecha_inicio: string | null; // DATE YYYY-MM-DD
  fecha_fin: string | null; // DATE YYYY-MM-DD
  created_at: string;
};

export const ESTADO_LABEL: Record<EventEstado, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

/** Transiciones permitidas desde cada estado. Los terminales no cambian. */
export const NEXT_ESTADOS: Record<EventEstado, EventEstado[]> = {
  borrador: ["publicado", "cancelado"],
  publicado: ["finalizado", "cancelado"],
  finalizado: [],
  cancelado: [],
};

export function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

/** "2026-11-14" -> Date local (sin desfase UTC). Null si inválida. */
export function parseFechaLocal(fecha: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  // Rechaza desbordes como mes 13 o día 40.
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    return null;
  }
  return d;
}

/** Date -> "YYYY-MM-DD" para la columna DATE de Supabase. */
export function toFechaKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatHora(hora: string | null): string {
  if (!hora) return "—";
  return hora.slice(0, 5);
}

export function formatPrecio(precio: number): string {
  return `$${Number(precio).toFixed(2)}`;
}
