import { cacheDirectory, EncodingType, writeAsStringAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { EventItem } from "@/features/events/types";
import { allSales } from "@/features/sales/api";
import type { SaleTicket } from "@/features/sales/types";

import { buildCierrePdfDoc } from "./cierrePdf";
import { base64Encode, buildLockedPdf } from "./pdfSecure";
import { buildReportPdfDoc } from "./reportePdf";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
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

/**
 * PDF del reporte filtrado, BLOQUEADO (solo lectura + impresión). El documento
 * lo arma `buildReportPdfDoc` (módulo puro) y sale en vertical: con las
 * columnas nuevas la tabla de 10 sobraba en horizontal.
 */
export async function exportReportPdf(
  rows: SaleTicket[],
  meta: ReportExportMeta,
): Promise<void> {
  const doc = buildReportPdfDoc(rows, meta);
  const pdf = buildLockedPdf(doc, PDF_OWNER_PASSWORD, randomId());
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
 * PDF de cierre BLOQUEADO (solo lectura + impresión): resumen, ingresos por
 * método (efectivo / transferencia / otro), lo que vendió cada vendedor y el
 * detalle por estado. Sin contraseña de apertura; la edición/anotación/copia
 * quedan denegadas por el lector.
 */
export async function exportCierrePdf(event: EventItem, tickets: SaleTicket[]): Promise<void> {
  const mine = tickets.filter((t) => t.event_id === event.id);
  const doc = buildCierrePdfDoc(event, mine, fechaHoraActual());
  const pdf = buildLockedPdf(doc, PDF_OWNER_PASSWORD, randomId());
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
