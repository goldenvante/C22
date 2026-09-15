import type { TextStyle, ViewStyle } from "react-native";

import { C22 } from "@/constants/theme";

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

/** Folio entero por evento -> formato visible FM-0001. Solo presentación. */
export function formatFolio(folio: number): string {
  return `FM-${String(folio).padStart(4, "0")}`;
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

/** Pastilla de estado del ticket: sólido legible sobre cream. */
export function ticketBadge(estado: TicketEstado): Badge {
  switch (estado) {
    case "UTILIZADO":
      return {
        pill: { ...badgeBase, backgroundColor: C22.success, borderColor: C22.success },
        text: { fontSize: 13, fontWeight: "700", color: C22.cream },
      };
    case "CANCELADO":
      return {
        pill: { ...badgeBase, backgroundColor: C22.danger, borderColor: C22.danger },
        text: { fontSize: 13, fontWeight: "700", color: C22.cream },
      };
    case "ACTIVO":
    default:
      return {
        pill: { ...badgeBase, backgroundColor: C22.wine, borderColor: C22.wine },
        text: { fontSize: 13, fontWeight: "700", color: C22.cream },
      };
  }
}
