import { getEvent, listPhases } from "@/features/events/api";
import type { EventEstado } from "@/features/events/types";
import { supabase } from "@/lib/supabase";

import { all, one, readMeta, run, withTransaction, writeMeta } from "./db";
import {
  DOWNLOAD_PAGE_SIZE,
  computeExpiresAt,
  isEventStateInvalid,
  isExpired,
  isStale,
} from "./policy";

type OfflineTicketDto = {
  id: string;
  folio: number;
  comprador_nombre: string;
  comprador_telefono: string | null;
  estado: string;
  es_cortesia: boolean;
  phase_id: string | null;
  qr_hash: string;
};

type DownloadResponse = {
  total?: number;
  offset?: number;
  tickets?: OfflineTicketDto[];
  code?: string;
};

export type PrepareStep = "evento" | "fases" | "boletos" | "guardando" | "listo";

export type PrepareProgress = {
  step: PrepareStep;
  downloaded: number;
  total: number;
};

export type PreparedPackage = {
  eventId: string;
  totalTickets: number;
  preparedAt: number;
  expiresAt: number;
};

export type OfflineStatus = {
  eventId: string;
  estado: EventEstado;
  ticketCount: number;
  preparedAt: number;
  lastSyncAt: number | null;
  expiresAt: number;
  expired: boolean;
  stale: boolean;
  invalidState: boolean;
};

const STEP_LABEL: Record<PrepareStep, string> = {
  evento: "Descargando el evento",
  fases: "Descargando fases y precios",
  boletos: "Descargando boletos",
  guardando: "Guardando en el dispositivo",
  listo: "Listo",
};

export function prepareStepLabel(step: PrepareStep): string {
  return STEP_LABEL[step];
}

function syncAtKey(eventId: string): string {
  return `event_sync_at:${eventId}`;
}

function friendlyRpcError(e: unknown, fallback: string): Error {
  const message = (e as { message?: string } | null)?.message ?? "";
  if (/network|fetch|failed|could not|timeout/i.test(message)) {
    return new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  }
  return new Error(message || fallback);
}

function denialMessage(code: string, total: number): string {
  if (code === "NO_AUTORIZADO") return "No tienes permiso para preparar este evento.";
  if (code === "PAQUETE_DEMASIADO_GRANDE") {
    return `El evento tiene ${total} boletos y supera el límite permitido para uso sin conexión.`;
  }
  return "Respuesta inesperada del servidor.";
}

export async function prepareEventOffline(
  eventId: string,
  onProgress: (progress: PrepareProgress) => void,
): Promise<PreparedPackage> {
  onProgress({ step: "evento", downloaded: 0, total: 0 });
  const event = await getEvent(eventId);
  if (!event) throw new Error("El evento no existe.");

  onProgress({ step: "fases", downloaded: 0, total: 0 });
  const phases = await listPhases(eventId);

  const tickets: OfflineTicketDto[] = [];
  let offset = 0;
  let total = 0;
  onProgress({ step: "boletos", downloaded: 0, total: 0 });
  for (;;) {
    const { data, error } = await supabase.rpc("download_offline_package", {
      p_event_id: eventId,
      p_offset: offset,
      p_limit: DOWNLOAD_PAGE_SIZE,
    });
    if (error) throw friendlyRpcError(error, "No se pudieron descargar los boletos.");
    const res = (data ?? {}) as DownloadResponse;
    total = Number(res.total ?? 0);
    if (res.code) throw new Error(denialMessage(res.code, total));
    const page = Array.isArray(res.tickets) ? res.tickets : [];
    tickets.push(...page);
    onProgress({ step: "boletos", downloaded: tickets.length, total });
    if (tickets.length >= total) break;
    if (page.length === 0) throw new Error("La descarga se interrumpió. Inténtalo de nuevo.");
    offset += page.length;
  }

  onProgress({ step: "guardando", downloaded: tickets.length, total });
  const preparedAt = Date.now();

  await withTransaction(async () => {
    await run("delete from offline_tickets where event_id = ?", [eventId]);
    await run("delete from offline_phases where event_id = ?", [eventId]);
    const existing = await one<{ prepared_at: number }>(
      "select prepared_at from offline_events where id = ?",
      [eventId],
    );
    await run(
      `insert into offline_events
         (id, nombre, codigo, fecha, hora, lugar, imagen_url, mapas_url, estado, ultimo_folio, committee_id, prepared_at, downloaded_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?)
       on conflict(id) do update set
         nombre = excluded.nombre,
         codigo = excluded.codigo,
         fecha = excluded.fecha,
         hora = excluded.hora,
         lugar = excluded.lugar,
         imagen_url = excluded.imagen_url,
         mapas_url = excluded.mapas_url,
         estado = excluded.estado,
         ultimo_folio = excluded.ultimo_folio,
         downloaded_at = excluded.downloaded_at`,
      [
        event.id,
        event.nombre,
        event.codigo,
        event.fecha,
        event.hora,
        event.lugar,
        event.imagen_url,
        event.mapas_url,
        event.estado,
        event.ultimo_folio,
        existing?.prepared_at ?? preparedAt,
        preparedAt,
      ],
    );
    for (const phase of phases) {
      await run(
        `insert into offline_phases (id, event_id, nombre, precio, orden, activa, fecha_inicio, fecha_fin)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           nombre = excluded.nombre,
           precio = excluded.precio,
           orden = excluded.orden,
           activa = excluded.activa,
           fecha_inicio = excluded.fecha_inicio,
           fecha_fin = excluded.fecha_fin`,
        [
          phase.id,
          phase.event_id,
          phase.nombre,
          phase.precio,
          phase.orden,
          phase.activa ? 1 : 0,
          phase.fecha_inicio,
          phase.fecha_fin,
        ],
      );
    }
    for (const ticket of tickets) {
      await run(
        `insert into offline_tickets
           (id, event_id, phase_id, folio, comprador_nombre, comprador_telefono, estado, es_cortesia, qr_hash, downloaded_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           event_id = excluded.event_id,
           phase_id = excluded.phase_id,
           folio = excluded.folio,
           comprador_nombre = excluded.comprador_nombre,
           comprador_telefono = excluded.comprador_telefono,
           estado = excluded.estado,
           es_cortesia = excluded.es_cortesia,
           qr_hash = excluded.qr_hash,
           downloaded_at = excluded.downloaded_at`,
        [
          ticket.id,
          eventId,
          ticket.phase_id,
          ticket.folio,
          ticket.comprador_nombre,
          ticket.comprador_telefono,
          ticket.estado,
          ticket.es_cortesia ? 1 : 0,
          ticket.qr_hash,
          preparedAt,
        ],
      );
    }
  });

  await writeMeta(syncAtKey(eventId), String(preparedAt));
  onProgress({ step: "listo", downloaded: tickets.length, total });

  return {
    eventId,
    totalTickets: tickets.length,
    preparedAt,
    expiresAt: computeExpiresAt(event.fecha, phases),
  };
}

export async function readOfflineStatus(eventId: string): Promise<OfflineStatus | null> {
  const event = await one<{
    fecha: string;
    estado: string;
    prepared_at: number;
    downloaded_at: number;
  }>("select fecha, estado, prepared_at, downloaded_at from offline_events where id = ?", [eventId]);
  if (!event) return null;

  const phases = await all<{ fecha_fin: string | null }>(
    "select fecha_fin from offline_phases where event_id = ?",
    [eventId],
  );
  const counter = await one<{ n: number }>(
    "select count(*) as n from offline_tickets where event_id = ?",
    [eventId],
  );
  const storedSync = await readMeta(syncAtKey(eventId));
  const lastSyncAt = storedSync ? Number(storedSync) : event.downloaded_at;
  const expiresAt = computeExpiresAt(event.fecha, phases);

  return {
    eventId,
    estado: event.estado as EventEstado,
    ticketCount: Number(counter?.n ?? 0),
    preparedAt: event.prepared_at,
    lastSyncAt,
    expiresAt,
    expired: isExpired(expiresAt),
    stale: isStale(lastSyncAt),
    invalidState: isEventStateInvalid(event.estado),
  };
}
