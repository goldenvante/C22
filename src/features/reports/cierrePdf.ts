/**
 * Documento de cierre de un evento en PDF. Módulo PURO (sin React Native ni
 * Expo): solo calcula el desglose y arma el modelo de tablas que consume
 * `buildLockedPdf`, de modo que el mismo documento se pueda generar y
 * verificarse con node fuera de la app.
 */
import { formatPrecio } from "@/features/events/types";
import {
  formatFolio,
  METODO_LABEL,
  TICKET_ESTADO_LABEL,
  type SaleTicket,
} from "@/features/sales/types";

import type { PdfTable } from "./pdfSecure";

export type CierreEvento = { nombre: string; codigo: string };

export type MetodBucket = { n: number; total: number };

export type VendedorBucket = {
  label: string;
  efectivo: number;
  transferencia: number;
  otro: number;
  cortesias: number;
};

export type DesgloseCierre = {
  /** Todos los boletos del evento: pagados, cortesías y cancelados. */
  vendidos: number;
  /** Boletos no cortesía: los que aportan dinero (cancelados incluidos). */
  pagados: number;
  cortesias: number;
  cancelados: number;
  utilizados: number;
  efectivo: MetodBucket;
  transferencia: MetodBucket;
  otro: MetodBucket;
  /** Suma de los tres métodos. */
  totalPagados: number;
  porVendedor: VendedorBucket[];
};

/**
 * Desglose del cierre: efectivo / transferencia / otro / cortesías y lo que
 * vendió cada usuario. Los cancelados aportan importe: el esquema no guarda
 * reembolsos, así que el pago ocurrió al vender. Las cortesías van a $0.
 */
export function desgloseCierre(tickets: SaleTicket[]): DesgloseCierre {
  const d: DesgloseCierre = {
    vendidos: 0,
    pagados: 0,
    cortesias: 0,
    cancelados: 0,
    utilizados: 0,
    efectivo: { n: 0, total: 0 },
    transferencia: { n: 0, total: 0 },
    otro: { n: 0, total: 0 },
    totalPagados: 0,
    porVendedor: [],
  };
  const porSeller = new Map<string, VendedorBucket>();

  for (const t of tickets) {
    if (t.estado === "CANCELADO") d.cancelados += 1;
    d.vendidos += 1;
    if (t.estado === "UTILIZADO") d.utilizados += 1;

    const v = porSeller.get(t.seller_id) ?? {
      label: t.vendedor?.nombre ?? "Vendedor",
      efectivo: 0,
      transferencia: 0,
      otro: 0,
      cortesias: 0,
    };
    porSeller.set(t.seller_id, v);

    if (t.es_cortesia) {
      d.cortesias += 1;
      v.cortesias += 1;
      continue;
    }

    d.pagados += 1;
    const importe = Number(t.precio_pagado);
    if (t.metodo_pago === "TRANSFERENCIA") {
      d.transferencia.n += 1;
      d.transferencia.total += importe;
      v.transferencia += importe;
    } else if (t.metodo_pago === "OTRO") {
      d.otro.n += 1;
      d.otro.total += importe;
      v.otro += importe;
    } else {
      d.efectivo.n += 1;
      d.efectivo.total += importe;
      v.efectivo += importe;
    }
  }

  d.totalPagados = d.efectivo.total + d.transferencia.total + d.otro.total;
  d.porVendedor = [...porSeller.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "es"),
  );
  return d;
}

export type CierreDoc = { title: string; meta: string[]; tables: PdfTable[] };

/**
 * Arma el documento del cierre: Resumen, Ingresos por método, Por vendedor y
 * el detalle por estado. `generado` es la fecha/hora de emisión en texto.
 */
export function buildCierrePdfDoc(
  event: CierreEvento,
  tickets: SaleTicket[],
  generado: string,
): CierreDoc {
  const d = desgloseCierre(tickets);
  const money = formatPrecio;

  const totalVendidos = d.vendidos;

  const section = (title: string, list: SaleTicket[]): PdfTable => ({
    title,
    head: ["Folio", "Comprador", "Fase", "Vendedor", "Precio", "Método", "Estado", "Cortesía"],
    rows: list
      .slice()
      .sort((a, b) => a.folio - b.folio)
      .map((t) => [
        formatFolio(t.folio, event.codigo),
        t.comprador_nombre,
        t.fase?.nombre ?? "",
        t.vendedor?.nombre ?? "",
        money(Number(t.precio_pagado)),
        `${METODO_LABEL[t.metodo_pago]}`,
        TICKET_ESTADO_LABEL[t.estado],
        t.es_cortesia ? "SI" : "NO",
      ]),
    numericCols: [4],
    colFracs: [66, 74, 48, 54, 57, 75, 46, 48],
  });

  const porVendedor: PdfTable = {
    title: "Por vendedor",
    head: ["Vendedor", "Efectivo", "Transferencia", "Otro", "Cortesías", "Total"],
    rows: [
      ...d.porVendedor.map((g) => [
        g.label,
        money(g.efectivo),
        money(g.transferencia),
        money(g.otro),
        String(g.cortesias),
        money(g.efectivo + g.transferencia + g.otro),
      ]),
      [
        "TOTAL",
        money(d.efectivo.total),
        money(d.transferencia.total),
        money(d.otro.total),
        String(d.cortesias),
        money(d.totalPagados),
      ],
    ],
    numericCols: [1, 2, 3, 4, 5],
  };

  return {
    title: `Cierre — ${event.nombre} (${event.codigo})`,
    meta: [`Generado: ${generado}`],
    tables: [
      {
        title: "Resumen",
        head: ["Concepto", "Valor"],
        rows: [
          ["Boletos vendidos", String(totalVendidos)],
          ["Ingresos", money(d.totalPagados)],
          ["Cortesías", String(d.cortesias)],
          ["Utilizados", String(d.utilizados)],
          ["Cancelados", String(d.cancelados)],
        ],
        numericCols: [1],
      },
      {
        title: "Ingresos por método",
        head: ["Método", "Boletos", "Importe"],
        rows: [
          ["Efectivo", String(d.efectivo.n), money(d.efectivo.total)],
          ["Transferencia", String(d.transferencia.n), money(d.transferencia.total)],
          ["Otro", String(d.otro.n), money(d.otro.total)],
          ["Total pagados", String(d.pagados), money(d.totalPagados)],
          ["Cortesías", String(d.cortesias), money(0)],
          ["Total boletos", String(totalVendidos), money(d.totalPagados)],
        ],
        numericCols: [1, 2],
      },
      porVendedor,
      section(
        `Utilizados (${tickets.filter((t) => t.estado === "UTILIZADO").length})`,
        tickets.filter((t) => t.estado === "UTILIZADO"),
      ),
      section(
        `Activos sin ingresar (${tickets.filter((t) => t.estado === "ACTIVO").length})`,
        tickets.filter((t) => t.estado === "ACTIVO"),
      ),
      section(
        `Cancelados (${d.cancelados})`,
        tickets.filter((t) => t.estado === "CANCELADO"),
      ),
    ],
  };
}
