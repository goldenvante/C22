import { cacheDirectory, EncodingType, writeAsStringAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import JSZip from "jszip";

import type { EventItem } from "@/features/events/types";
import { formatPrecio } from "@/features/events/types";
import { allSales } from "@/features/sales/api";
import { formatFolio, METODO_LABEL, TICKET_ESTADO_LABEL, type SaleTicket } from "@/features/sales/types";

import { computeSummary } from "./api";
import { base64Encode, buildLockedPdf, type PdfTable } from "./pdfSecure";

import {
  assembleCierreWorkbook,
  buildCierreSheets,
  buildReportSheets,
  legacyPasswordHash,
  type CierreTicket,
  type ReportRow,
} from "./xlsxWorkbook";

/**
 * Password de protección de hojas (hash legacy real de Excel, aplicado por
 * Excel al abrir). Disuasoria: vive en el código del cliente. No simular
 * más protección de la que esto da.
 */
const CIERRE_PASSWORD = "ComiteCierre2026";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function toCierreTicket(t: SaleTicket): CierreTicket {
  return {
    folio: t.folio,
    comprador_nombre: t.comprador_nombre,
    fase_nombre: t.fase?.nombre ?? (t.es_cortesia ? "Cortesía (sin fase)" : "Sin fase"),
    vendedor_nombre: t.vendedor?.nombre ?? "Vendedor",
    precio_pagado: Number(t.precio_pagado),
    metodo_pago: t.metodo_pago,
    estado: t.estado,
    es_cortesia: t.es_cortesia,
  };
}

/**
 * Genera el XLSX de cierre de un evento FINALIZADO con 3 hojas protegidas:
 * Totales, Por vendedor y Boletos. Comparte el archivo.
 */
export async function exportCierreXlsx(event: EventItem, tickets: SaleTicket[]): Promise<void> {
  const mine = tickets.filter((t) => t.event_id === event.id);
  const now = new Date();
  const sheets = buildCierreSheets(
    { nombre: event.nombre, codigo: event.codigo },
    mine.map(toCierreTicket),
    `${now.toLocaleDateString("es-MX")} ${now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`,
  );
  const files = assembleCierreWorkbook(
    sheets,
    legacyPasswordHash(CIERRE_PASSWORD),
    "Comite C22",
    now.toISOString(),
  );
  const zip = new JSZip();
  for (const [path, xml] of files) zip.file(path, xml);
  const base64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  if (!cacheDirectory) throw new Error("Almacenamiento no disponible en este dispositivo.");
  const uri = `${cacheDirectory}cierre-${event.codigo}-${stamp()}.xlsx`;
  await writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dialogTitle: "Compartir cierre",
  });
}

/** Carga las ventas de un evento para el cierre (reutiliza allSales + filtro). */
export async function loadEventTickets(eventId: string): Promise<SaleTicket[]> {
  const all = await allSales();
  return all.filter((t) => t.event_id === eventId);
}

export type ReportExportMeta = {
  evento: string;
  periodo: string;
  generado: string;
  generadoPor: string;
};

function toReportRow(t: SaleTicket): ReportRow {
  const d = new Date(t.created_at);
  const p = (n: number) => String(n).padStart(2, "0");
  const fecha = Number.isNaN(d.getTime())
    ? t.created_at.slice(0, 10)
    : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return {
    folio: formatFolio(t.folio),
    evento: t.evento?.nombre ?? "",
    fase: t.fase?.nombre ?? "",
    comprador: t.comprador_nombre,
    vendedor: t.vendedor?.nombre ?? "",
    precio: Number(t.precio_pagado),
    metodo: METODO_LABEL[t.metodo_pago],
    fecha,
    estado: TICKET_ESTADO_LABEL[t.estado],
    cortesia: t.es_cortesia,
  };
}

async function shareWorkbook(
  sheets: Parameters<typeof assembleCierreWorkbook>[0],
  filename: string,
): Promise<void> {
  const now = new Date();
  const files = assembleCierreWorkbook(sheets, legacyPasswordHash(CIERRE_PASSWORD), "Comite C22", now.toISOString());
  const zip = new JSZip();
  for (const [path, xml] of files) zip.file(path, xml);
  const base64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  if (!cacheDirectory) throw new Error("Almacenamiento no disponible en este dispositivo.");
  const uri = `${cacheDirectory}${filename}`;
  await writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
  await Sharing.shareAsync(uri, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dialogTitle: "Compartir reporte",
  });
}

/**
 * XLSX del reporte filtrado: hoja "Reporte de ventas" con cabecera C22,
 * resumen, detalle con wrap/autofiltro/congelado y totales. Protegido.
 */
export async function exportReportXlsx(rows: SaleTicket[], meta: ReportExportMeta): Promise<void> {
  const sheets = buildReportSheets(
    { evento: meta.evento, periodo: meta.periodo, generado: `${meta.generado} · Por: ${meta.generadoPor}` },
    rows.map(toReportRow),
  );
  await shareWorkbook(sheets, `reporte-ventas-${stamp()}.xlsx`);
}

/**
 * PDF del reporte filtrado, BLOQUEADO (solo lectura + impresión) y en
 * horizontal para que la tabla de 10 columnas sea legible.
 */
export async function exportReportPdf(
  rows: SaleTicket[],
  meta: ReportExportMeta,
): Promise<void> {
  const money = (n: number) => formatPrecio(n);
  const vigentes = rows.filter((t) => t.estado !== "CANCELADO");
  const ingresos = vigentes.reduce((a, t) => (t.es_cortesia ? a : a + Number(t.precio_pagado)), 0);
  const byVendedor = new Map<string, { label: string; n: number; ing: number }>();
  for (const t of vigentes) {
    const g = byVendedor.get(t.seller_id) ?? { label: t.vendedor?.nombre ?? "Vendedor", n: 0, ing: 0 };
    g.n += 1;
    if (!t.es_cortesia) g.ing += Number(t.precio_pagado);
    byVendedor.set(t.seller_id, g);
  }
  const byFase = new Map<string, { label: string; n: number; ing: number }>();
  for (const t of vigentes) {
    const key = t.phase_id ?? "sin-fase";
    const g = byFase.get(key) ?? {
      label: t.fase?.nombre ?? (t.es_cortesia ? "Cortesía (sin fase)" : "Sin fase"),
      n: 0,
      ing: 0,
    };
    g.n += 1;
    if (!t.es_cortesia) g.ing += Number(t.precio_pagado);
    byFase.set(key, g);
  }
  const detail = rows
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((t) => {
      const d = new Date(t.created_at);
      const p = (n: number) => String(n).padStart(2, "0");
      const fecha = Number.isNaN(d.getTime())
        ? t.created_at.slice(0, 10)
        : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
      return [
        formatFolio(t.folio),
        t.evento?.nombre ?? "",
        t.fase?.nombre ?? "",
        t.comprador_nombre,
        t.vendedor?.nombre ?? "",
        money(Number(t.precio_pagado)),
        `${METODO_LABEL[t.metodo_pago]}${t.es_cortesia ? " (Cortesía)" : ""}`,
        fecha,
        TICKET_ESTADO_LABEL[t.estado],
        t.es_cortesia ? "SI" : "NO",
      ];
    });
  const pdf = buildLockedPdf(
    {
      title: "Reporte de ventas",
      meta: [
        `Generado: ${meta.generado} · Por: ${meta.generadoPor}`,
        `Evento: ${meta.evento || "Todos"} · Periodo: ${meta.periodo || "Todo"}`,
      ],
      tables: [
        {
          title: "Resumen",
          head: ["Concepto", "Valor"],
          rows: [
            ["Boletos vendidos", String(vigentes.length)],
            ["Ingresos", money(ingresos)],
            ["Cortesías", String(vigentes.filter((t) => t.es_cortesia).length)],
            ["Utilizados", String(rows.filter((t) => t.estado === "UTILIZADO").length)],
            ["Cancelados", String(rows.filter((t) => t.estado === "CANCELADO").length)],
          ],
          numericCols: [1],
        },
        {
          title: "Por vendedor",
          head: ["Vendedor", "Boletos", "Ingresos"],
          rows: [...byVendedor.values()]
            .sort((a, b) => a.label.localeCompare(b.label, "es"))
            .map((g) => [g.label, String(g.n), money(g.ing)]),
          numericCols: [1, 2],
        },
        {
          title: "Por fase",
          head: ["Fase", "Boletos", "Ingresos"],
          rows: [...byFase.values()]
            .sort((a, b) => a.label.localeCompare(b.label, "es"))
            .map((g) => [g.label, String(g.n), money(g.ing)]),
          numericCols: [1, 2],
        },
        {
          title: `Detalle (${rows.length})`,
          head: ["Folio", "Evento", "Etapa", "Comprador", "Vendedor", "Precio", "Método", "Fecha", "Estado", "Tipo"],
          rows: detail,
          numericCols: [5],
        },
      ],
    },
    PDF_OWNER_PASSWORD,
    randomId(),
    true,
  );
  if (!cacheDirectory) throw new Error("Almacenamiento no disponible en este dispositivo.");
  const uri = `${cacheDirectory}reporte-ventas-${stamp()}.pdf`;
  await writeAsStringAsync(uri, base64Encode(pdf), { encoding: EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Compartir reporte" });
}

/** Password de propietario del PDF (abre sin contraseña; protege edición). */
const PDF_OWNER_PASSWORD = "ComiteCierre2026";

function fechaHoraActual(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * PDF de cierre BLOQUEADO (solo lectura + impresión): mismo contenido que el
 * XLSX (resumen, por vendedor, boletos por estado). Sin contraseña de
 * apertura; la edición/anotación/copia quedan denegadas por el lector.
 */
export async function exportCierrePdf(event: EventItem, tickets: SaleTicket[]): Promise<void> {
  const mine = tickets.filter((t) => t.event_id === event.id);
  const summary = computeSummary(mine);
  const money = (n: number) => formatPrecio(n);
  const vigente = mine.filter((t) => t.estado !== "CANCELADO");

  const bySeller = new Map<string, { label: string; e: number; t: number; o: number; c: number }>();
  for (const t of vigente) {
    let g = bySeller.get(t.seller_id);
    if (!g) {
      g = { label: t.vendedor?.nombre ?? "Vendedor", e: 0, t: 0, o: 0, c: 0 };
      bySeller.set(t.seller_id, g);
    }
    if (t.es_cortesia) {
      g.c += 1;
    } else if (t.metodo_pago === "EFECTIVO") {
      g.e += Number(t.precio_pagado);
    } else if (t.metodo_pago === "TRANSFERENCIA") {
      g.t += Number(t.precio_pagado);
    } else {
      g.o += Number(t.precio_pagado);
    }
  }
  const sellers = [...bySeller.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));

  const section = (title: string, list: SaleTicket[]): PdfTable => ({
    title,
    head: ["Folio", "Comprador", "Fase", "Vendedor", "Precio", "Método", "Estado", "Cortesía"],
    rows: list
      .slice()
      .sort((a, b) => a.folio - b.folio)
      .map((t) => [
        formatFolio(t.folio),
        t.comprador_nombre,
        t.fase?.nombre ?? "",
        t.vendedor?.nombre ?? "",
        money(Number(t.precio_pagado)),
        `${METODO_LABEL[t.metodo_pago]}${t.es_cortesia ? " (Cortesía)" : ""}`,
        TICKET_ESTADO_LABEL[t.estado],
        t.es_cortesia ? "SI" : "NO",
      ]),
    numericCols: [4],
  });

  const pdf = buildLockedPdf(
    {
      title: `Cierre — ${event.nombre} (${event.codigo})`,
      meta: [`Generado: ${fechaHoraActual()}`],
      tables: [
        {
          title: "Resumen",
          head: ["Concepto", "Valor"],
          rows: [
            ["Boletos vendidos", String(summary.vendidos)],
            ["Ingresos", money(summary.ingresos)],
            ["Cortesías", String(summary.cortesias)],
            ["Utilizados", String(summary.utilizados)],
            ["Cancelados", String(summary.cancelados)],
          ],
          numericCols: [1],
        },
        {
          title: "Por vendedor",
          head: ["Vendedor", "Efectivo", "Transferencia", "Otro", "Cortesías", "Total"],
          rows: sellers.map((g) => [
            g.label,
            money(g.e),
            money(g.t),
            money(g.o),
            String(g.c),
            money(g.e + g.t + g.o),
          ]),
          numericCols: [1, 2, 3, 4, 5],
        },
        section(`Utilizados (${mine.filter((t) => t.estado === "UTILIZADO").length})`, mine.filter((t) => t.estado === "UTILIZADO")),
        section(`Activos sin ingresar (${mine.filter((t) => t.estado === "ACTIVO").length})`, mine.filter((t) => t.estado === "ACTIVO")),
        section(`Cancelados (${mine.filter((t) => t.estado === "CANCELADO").length})`, mine.filter((t) => t.estado === "CANCELADO")),
      ],
    },
    PDF_OWNER_PASSWORD,
    randomId(),
  );
  if (!cacheDirectory) throw new Error("Almacenamiento no disponible en este dispositivo.");
  const uri = `${cacheDirectory}cierre-${event.codigo}-${stamp()}.pdf`;
  await writeAsStringAsync(uri, base64Encode(pdf), { encoding: EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Compartir cierre" });
}

/** 16 bytes no secretos como ID del documento (identificador, no clave). */
function randomId(): Uint8Array {
  const out = new Uint8Array(16);
  const now = Date.now();
  let seed = (now ^ (now / 1000)) >>> 0 || 0x9e3779b9;
  for (let i = 0; i < 16; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    seed ^= Math.floor(Math.random() * 0xffffffff);
    out[i] = seed & 0xff;
  }
  return out;
}
