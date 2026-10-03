import type { TextStyle, ViewStyle } from "react-native";

import { MONARQ, readableOn } from "@/branding/palette";
import { Type } from "@/constants/type";

export type MetodoPago = "EFECTIVO" | "TRANSFERENCIA" | "OTRO";

export const METODOS_PAGO: MetodoPago[] = ["EFECTIVO", "TRANSFERENCIA", "OTRO"];

export const METODO_LABEL: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

export type TicketEstado = "ACTIVO" | "UTILIZADO" | "CANCELADO";

export const TICKET_ESTADO_LABEL: Record<TicketEstado, string> = {
  ACTIVO: "Activo",
  UTILIZADO: "Utilizado",
  CANCELADO: "Cancelado",
};

export type NewSaleInput = {
  event_id: string;
  phase_id: string;
  nombre: string;
  telefono: string;
  metodo: MetodoPago;
};

export type SaleTicket = {  id: string;
  event_id: string;
  phase_id: string;
  folio: number;
  precio_pagado: number;
  metodo_pago: MetodoPago;
  comprador_nombre: string;
  comprador_telefono: string | null;
  qr_token: string;
  estado: TicketEstado;
  /** True = boleto gratis asignado por el admin (precio 0, sin fase visible). */
  es_cortesia: boolean;
  seller_id: string;
  created_at: string;
  evento: {
    nombre: string;
    codigo: string;
    fecha: string | null;
    hora: string | null;
    lugar: string | null;
    imagen_url: string | null;
    mapas_url: string | null;
  } | null;
  fase: { nombre: string } | null;
  vendedor: { nombre: string; usuario: string } | null;
};

/**
 * Folio entero por evento -> formato visible {CODIGO}-{NNN}, p. ej. HALL26-001.
 * Solo presentación: el prefijo es `events.codigo` (único global) para que dos
 * eventos no compartan folio legible. `codigo` va obligatorio a propósito, para
 * que el compilador obligue a todo llamador a traerlo.
 */
export function formatFolio(folio: number, codigo: string): string {
  const prefijo = codigo.trim().toUpperCase();
  const numero = String(folio).padStart(3, "0");
  return prefijo ? `${prefijo}-${numero}` : numero;
}

/** Vigencia de fase en cliente (el RPC revalida con fecha de servidor). */
export function faseVigente(inicio: string | null, fin: string | null, hoy: string): boolean {
  if (inicio && hoy < inicio) return false;
  if (fin && hoy > fin) return false;
  return true;
}

type Badge = { pill: ViewStyle; text: TextStyle };

const badgeBase: ViewStyle = {
  borderRadius: 999,
  paddingVertical: 4,
  paddingHorizontal: 12,
  alignSelf: "flex-start",
  borderWidth: 1,
};

/** Tintes semánticos fijos de estado (independientes del esquema claro/oscuro). */
const STATE = {
  OK: "#58745D",
  BAD: "#A94452",
  ACTIVO: MONARQ.accent,
} as const;

/**
 * Pastilla de estado del ticket: fondo sólido con tinta derivada por
 * `readableOn`, igual que el resto de badges de la app.
 */
export function ticketBadge(estado: TicketEstado): Badge {
  const solid = (bg: string): Badge => ({
    pill: { ...badgeBase, backgroundColor: bg, borderColor: bg },
    text: { fontSize: 13, fontFamily: Type.bodyBold, color: readableOn(bg) },
  });
  switch (estado) {
    case "UTILIZADO":
      return solid(STATE.OK);
    case "CANCELADO":
      return solid(STATE.BAD);
    case "ACTIVO":
    default:
      return solid(STATE.ACTIVO);
  }
}
