/**
 * Documento del "Reporte de ventas". Módulo PURO (sin React Native ni Expo):
 * solo agrega y arma el modelo que consume `buildLockedPdf`, de modo que el
 * mismo documento se pueda generar y verificarse con node fuera de la app.
 *
 * Estructura pedida:
 *   1. Ingreso total de TODOS los boletos, destacado, al principio.
 *   2. Bloque individual por vendedor: efectivo, transferencia, total general
 *      y el total por fase de ese vendedor.
 *   3. Total general y resumen por fase del evento.
 *   4. Todos los boletos en orden de folio con su estado.
 *   5. Al final: totales de utilizados, activos y cancelados.
 *
 * Criterio de dinero: suma de `precio_pagado` de todos los boletos (las
 * cortesías son $0 y los cancelados siguen aportando porque el esquema no
 * guarda reembolsos).
 */
import { formatPrecio } from "@/features/events/types";
import { formatFolio, TICKET_ESTADO_LABEL, type SaleTicket } from "@/features/sales/types";

import type { PdfDoc, PdfTable } from "./pdfSecure";

export type ReporteMeta = {
  evento: string;
  periodo: string;
  generado: string;
  generadoPor: string;
};

export type Banda = { n: number; total: number };

export type VendedorReporte = {
  label: string;
  efectivo: Banda;
  transferencia: Banda;
  otro: Banda;
  total: Banda;
  fases: { label: string; n: number; total: number }[];
};

export type FaseReporte = { label: string; n: number; total: number };

export type ResumenReporte = {
  ingresoTotal: number;
  efectivo: Banda;
  transferencia: Banda;
  otro: Banda;
  boletos: number;
  cortesias: number;
  utilizados: number;
  activos: number;
  cancelados: number;
};

/** Cifra con millares ($1,750.00): se lee de un vistazo en las tablas. */
export const money = formatPrecio;

const banda = (): Banda => ({ n: 0, total: 0 });

/** Importe que aporta un boleto: las cortesías son $0. */
function importeDe(t: SaleTicket): number {
  return t.es_cortesia ? 0 : Number(t.precio_pagado);
}

/** Rótulo de fase coherente con la tabla "Por fase" (nunca "Etapa"). */
export function etiquetaFase(t: SaleTicket): string {
  if (t.fase?.nombre) return t.fase.nombre;
  return t.es_cortesia ? "Cortesía (sin fase)" : "Sin fase";
}

function claveFase(t: SaleTicket): string {
  return t.phase_id ? `f:${t.phase_id}` : `s:${t.es_cortesia ? "c" : "n"}`;
}

const cmpTexto = (a: string, b: string) => a.localeCompare(b, "es");

export function resumenReporte(rows: SaleTicket[]): ResumenReporte {
  const r: ResumenReporte = {
    ingresoTotal: 0,
    efectivo: banda(),
    transferencia: banda(),
    otro: banda(),
    boletos: rows.length,
    cortesias: 0,
    utilizados: 0,
    activos: 0,
    cancelados: 0,
  };
  for (const t of rows) {
    const imp = importeDe(t);
    r.ingresoTotal += imp;
    if (t.es_cortesia) r.cortesias += 1;
    if (t.estado === "UTILIZADO") r.utilizados += 1;
    else if (t.estado === "ACTIVO") r.activos += 1;
    else if (t.estado === "CANCELADO") r.cancelados += 1;

    const b = r[t.metodo_pago === "TRANSFERENCIA" ? "transferencia" : t.metodo_pago === "OTRO" ? "otro" : "efectivo"];
    b.n += 1;
    b.total += imp;
  }
  return r;
}

export function porVendedorReporte(rows: SaleTicket[]): VendedorReporte[] {
  const map = new Map<string, VendedorReporte>();
  const fasesMap = new Map<string, Map<string, FaseReporte>>();

  for (const t of rows) {
    const key = t.seller_id || "sin-vendedor";
    let v = map.get(key);
    if (!v) {
      v = {
        label: t.vendedor?.nombre ?? "Sin vendedor",
        efectivo: banda(),
        transferencia: banda(),
        otro: banda(),
        total: banda(),
        fases: [],
      };
      map.set(key, v);
      fasesMap.set(key, new Map());
    }

    const imp = importeDe(t);
    const b =
      v[t.metodo_pago === "TRANSFERENCIA" ? "transferencia" : t.metodo_pago === "OTRO" ? "otro" : "efectivo"];
    b.n += 1;
    b.total += imp;
    v.total.n += 1;
    v.total.total += imp;

    const porFase = fasesMap.get(key)!;
    const fk = claveFase(t);
    let f = porFase.get(fk);
    if (!f) {
      f = { label: etiquetaFase(t), n: 0, total: 0 };
      porFase.set(fk, f);
      v.fases.push(f);
    }
    f.n += 1;
    f.total += imp;
  }

  const out = [...map.values()];
  for (const v of out) v.fases.sort((a, b) => cmpTexto(a.label, b.label));
  return out.sort((a, b) => cmpTexto(a.label, b.label));
}

export function porFaseReporte(rows: SaleTicket[]): FaseReporte[] {
  const map = new Map<string, FaseReporte>();
  for (const t of rows) {
    const fk = claveFase(t);
    let f = map.get(fk);
    if (!f) {
      f = { label: etiquetaFase(t), n: 0, total: 0 };
      map.set(fk, f);
    }
    f.n += 1;
    f.total += importeDe(t);
  }
  return [...map.values()].sort((a, b) => cmpTexto(a.label, b.label));
}

const FRACS_IMPORTE = [0.46, 0.22, 0.32];

function tablaImportes(title: string, col0: string, rows: string[][], strongRows: number[]): PdfTable {
  return {
    title,
    head: [col0, "Boletos", "Importe"],
    rows,
    numericCols: [1, 2],
    colFracs: FRACS_IMPORTE,
    strongRows,
  };
}

export function buildReportPdfDoc(rows: SaleTicket[], meta: ReporteMeta): PdfDoc {
  const r = resumenReporte(rows);
  const vendedores = porVendedorReporte(rows);
  const fases = porFaseReporte(rows);

  const tables: PdfTable[] = [];

  for (const v of vendedores) {
    const filas: string[][] = [
      ["Efectivo", String(v.efectivo.n), money(v.efectivo.total)],
      ["Transferencia", String(v.transferencia.n), money(v.transferencia.total)],
      ["Otro", String(v.otro.n), money(v.otro.total)],
      ["Total general", String(v.total.n), money(v.total.total)],
      ...v.fases.map((f) => [f.label, String(f.n), money(f.total)]),
      ["Total por fase", String(v.total.n), money(v.total.total)],
    ];
    tables.push(tablaImportes(`Vendedor: ${v.label}`, "Concepto", filas, [3, filas.length - 1]));
  }

  tables.push(
    tablaImportes(
      "Total general",
      "Método",
      [
        ["Efectivo", String(r.efectivo.n), money(r.efectivo.total)],
        ["Transferencia", String(r.transferencia.n), money(r.transferencia.total)],
        ["Otro", String(r.otro.n), money(r.otro.total)],
        ["Total", String(r.boletos), money(r.ingresoTotal)],
      ],
      [3],
    ),
  );

  tables.push(
    tablaImportes(
      "Por fase",
      "Fase",
      [
        ...fases.map((f) => [f.label, String(f.n), money(f.total)]),
        ["Total", String(r.boletos), money(r.ingresoTotal)],
      ],
      [fases.length],
    ),
  );

  const porFolio = rows.slice().sort((a, b) => a.folio - b.folio);
  tables.push({
    title: `Boletos por folio (${porFolio.length})`,
    head: ["Folio", "Fase", "Comprador", "Vendedor", "Estado"],
    rows: porFolio.map((t) => [
      formatFolio(t.folio, t.evento?.codigo ?? ""),
      etiquetaFase(t),
      t.comprador_nombre,
      t.vendedor?.nombre ?? "",
      TICKET_ESTADO_LABEL[t.estado],
    ]),
    colFracs: [0.16, 0.2, 0.26, 0.18, 0.16],
  });

  tables.push({
    title: "Totales por estado",
    head: ["Estado", "Boletos"],
    rows: [
      ["Utilizados", String(r.utilizados)],
      ["Activos", String(r.activos)],
      ["Cancelados", String(r.cancelados)],
      ["Total de boletos", String(r.boletos)],
    ],
    numericCols: [1],
    colFracs: [0.7, 0.3],
    strongRows: [3],
  });

  return {
    title: "Reporte de ventas",
    meta: [
      `Generado: ${meta.generado} · Por: ${meta.generadoPor}`,
      `Evento: ${meta.evento || "Todos"} · Periodo: ${meta.periodo || "Todo"}`,
    ],
    kpi: {
      label: "INGRESO TOTAL DE TODOS LOS BOLETOS",
      value: money(r.ingresoTotal),
      sub: `${r.boletos} boletos · ${r.cortesias} cortesías · ${r.utilizados} utilizados · ${r.cancelados} cancelados`,
    },
    tables,
  };
}
