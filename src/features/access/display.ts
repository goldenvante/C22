import type { ValidateCode } from "@/features/access/api";

/** Etiquetas amigables compartidas por historial y detalle (mismos códigos RPC). */
export const RESULTADO_LABEL: Record<ValidateCode, string> = {
  VALIDO: "Válido",
  YA_UTILIZADO: "Ya utilizado",
  CANCELADO: "Cancelado",
  NO_EXISTE: "No válido",
  EVENTO_INCORRECTO: "Otro evento",
  NO_AUTORIZADO: "Sin autorización",
};

export function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
