import { allSales } from "@/features/sales/api";
import {
  type MetodoPago,
  type SaleTicket,
  type TicketEstado,
} from "@/features/sales/types";
import { formatPrecio } from "@/features/events/types";

export type ReportFilters = {
  eventId: string; // "" = todos
  desde: string; // YYYY-MM-DD o ""
  hasta: string; // YYYY-MM-DD o ""
  sellerId: string; // "" = todos
  phaseId: string; // "" = todas
  estado: TicketEstado | "TODOS";
  metodo: MetodoPago | "TODOS";
};

export const EMPTY_FILTERS: ReportFilters = {
  eventId: "",
  desde: "",
  hasta: "",
  sellerId: "",
  phaseId: "",
  estado: "TODOS",
  metodo: "TODOS",
};

export type ReportSummary = {
  vendidos: number;
  ingresos: number;
  cortesias: number;
  utilizados: number;
  cancelados: number;
};

export type GroupRow = {
  key: string;
  label: string;
  cantidad: number;
  ingresos: number;
};

/** Carga todas las ventas (solo admin por RLS). Única consulta del reporte. */
export async function loadReportTickets(): Promise<SaleTicket[]> {
  return allSales();
}

function saleDate(t: SaleTicket): string {
  return t.created_at.slice(0, 10);
}

/** Filtra en cliente sobre el conjunto cargado (volumen MVP). */
export function applyFilters(tickets: SaleTicket[], f: ReportFilters): SaleTicket[] {
  return tickets.filter((t) => {
    if (f.eventId && t.event_id !== f.eventId) return false;
    if (f.sellerId && t.seller_id !== f.sellerId) return false;
    if (f.phaseId && t.phase_id !== f.phaseId) return false;
    if (f.estado !== "TODOS" && t.estado !== f.estado) return false;
    if (f.metodo !== "TODOS" && t.metodo_pago !== f.metodo) return false;
    const d = saleDate(t);
    if (f.desde && d < f.desde) return false;
    if (f.hasta && d > f.hasta) return false;
    return true;
  });
}

/** Resumen sobre filas YA filtradas. Cortesías suman $0 y se cuentan aparte;
 * los cancelados cuentan en dinero porque el esquema no guarda reembolsos. */
export function computeSummary(rows: SaleTicket[]): ReportSummary {
  let vendidos = 0;
  let ingresos = 0;
  let cortesias = 0;
  let utilizados = 0;
  let cancelados = 0;
  for (const t of rows) {
    vendidos += 1;
    if (t.estado === "CANCELADO") cancelados += 1;
    if (t.es_cortesia) {
      cortesias += 1;
    } else {
      ingresos += Number(t.precio_pagado);
    }
    if (t.estado === "UTILIZADO") utilizados += 1;
  }
  return { vendidos, ingresos, cortesias, utilizados, cancelados };
}

function groupSum(rows: SaleTicket[], keyOf: (t: SaleTicket) => { key: string; label: string }): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const t of rows) {
    const { key, label } = keyOf(t);
    const row = map.get(key) ?? { key, label, cantidad: 0, ingresos: 0 };
    row.cantidad += 1;
    if (!t.es_cortesia) row.ingresos += Number(t.precio_pagado);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.ingresos - a.ingresos || b.cantidad - a.cantidad);
}

export function groupByEvent(rows: SaleTicket[]): GroupRow[] {
  return groupSum(rows, (t) => ({
    key: t.event_id,
    label: t.evento?.nombre ?? "Evento no disponible",
  }));
}

export function groupByPhase(rows: SaleTicket[]): GroupRow[] {
  return groupSum(rows, (t) => ({
    key: t.phase_id ?? "sin-fase",
    label: t.fase?.nombre ?? (t.es_cortesia ? "Cortesía (sin fase)" : "Sin fase"),
  }));
}

export function groupBySeller(rows: SaleTicket[]): GroupRow[] {
  return groupSum(rows, (t) => ({
    key: t.seller_id,
    label: t.vendedor?.nombre ?? "Vendedor",
  }));
}
