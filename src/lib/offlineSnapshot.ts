import { all } from "@/offline/db";
import type { EventEstado, EventItem } from "@/features/events/types";
import type { MetodoPago, SaleTicket, TicketEstado } from "@/features/sales/types";

type OfflineEventRow = {
  id: string;
  nombre: string;
  codigo: string;
  fecha: string;
  hora: string | null;
  lugar: string | null;
  imagen_url: string | null;
  mapas_url: string | null;
  estado: string;
  ultimo_folio: number;
};

type OfflineTicketRow = {
  id: string;
  event_id: string;
  folio: number;
  comprador_nombre: string | null;
  comprador_telefono: string | null;
  estado: string;
  es_cortesia: number;
};

/**
 * Lecturas del snapshot local (tabla offline_*) usadas como respaldo cuando
 * no hay red. No escriben ni alteran el esquema offline de la FASE 1-6.
 */
export async function listOfflineEvents(): Promise<EventItem[]> {
  const rows = await all<OfflineEventRow>(
    "select id, nombre, codigo, fecha, hora, lugar, imagen_url, mapas_url, estado, ultimo_folio from offline_events order by fecha",
  );
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    codigo: r.codigo,
    fecha: r.fecha,
    hora: r.hora ?? null,
    lugar: r.lugar ?? null,
    imagen_url: r.imagen_url ?? null,
    mapas_url: r.mapas_url ?? null,
    estado: r.estado as EventEstado,
    ultimo_folio: Number(r.ultimo_folio ?? 0),
    created_at: "",
  }));
}

export async function listOfflineSales(): Promise<SaleTicket[]> {
  const rows = await all<OfflineTicketRow>(
    "select id, event_id, folio, comprador_nombre, comprador_telefono, estado, es_cortesia from offline_tickets order by folio desc",
  );
  if (rows.length === 0) return [];
  const events = await all<OfflineEventRow>(
    "select id, nombre, codigo, fecha, hora, lugar, imagen_url, mapas_url, estado, ultimo_folio from offline_events",
  );
  const byId = new Map(events.map((e) => [e.id, e]));
  return rows.map((r) => {
    const ev = byId.get(r.event_id);
    return {
      id: r.id,
      event_id: r.event_id,
      phase_id: "",
      folio: Number(r.folio),
      precio_pagado: 0,
      metodo_pago: "" as unknown as MetodoPago,
      comprador_nombre: r.comprador_nombre ?? "",
      comprador_telefono: r.comprador_telefono ?? null,
      qr_token: "",
      estado: r.estado as TicketEstado,
      es_cortesia: Boolean(r.es_cortesia),
      seller_id: "offline",
      created_at: "",
      evento: ev
        ? {
            nombre: ev.nombre,
            codigo: ev.codigo,
            fecha: ev.fecha,
            hora: ev.hora ?? null,
            lugar: ev.lugar ?? null,
            imagen_url: ev.imagen_url ?? null,
            mapas_url: ev.mapas_url ?? null,
          }
        : null,
      fase: null,
      vendedor: null,
    };
  });
}
