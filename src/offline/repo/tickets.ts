import type { ValidateCode } from "@/features/access/api";

import { one, run, withTransaction } from "../db";
import { getDeviceId, sha256Hex } from "../ids";
import { enqueueOperation } from "../queue";
import { getOfflineGate, type OfflineBlockReason } from "./events";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OfflineTicketRow = {
  id: string;
  event_id: string;
  phase_id: string | null;
  folio: number;
  comprador_nombre: string | null;
  comprador_telefono: string | null;
  estado: string;
  es_cortesia: number;
  qr_hash: string;
  downloaded_at: number;
};

export type OfflineTicketSnapshot = {
  id: string;
  event_id: string;
  estado: string;
  folio: number;
  comprador_nombre: string | null;
} | null;

/**
 * Misma máquina de estados y MISMA precedencia que validate_entry:
 * NO_EXISTE > EVENTO_INCORRECTO > CANCELADO > YA_UTILIZADO > VALIDO.
 */
export function decideOfflineCode(
  ticket: OfflineTicketSnapshot,
  eventId: string,
  hasValidEntry: boolean,
): ValidateCode {
  if (!ticket) return "NO_EXISTE";
  if (ticket.event_id !== eventId) return "EVENTO_INCORRECTO";
  if (ticket.estado === "CANCELADO") return "CANCELADO";
  if (ticket.estado === "UTILIZADO" || hasValidEntry) return "YA_UTILIZADO";
  return "VALIDO";
}

export type OfflineScanResult = {
  eventId: string;
  scannedAt: number;
  stale: boolean;
} & (
  | {
      blocked: OfflineBlockReason;
      ok: false;
      code: null;
      folio: null;
      comprador: null;
      ticketId: null;
      fase: null;
      pendingSync: false;
      operationId: null;
    }
  | {
      blocked: null;
      ok: boolean;
      code: ValidateCode;
      folio: number | null;
      comprador: string | null;
      ticketId: string | null;
      fase: string | null;
      pendingSync: true;
      operationId: string;
    }
);

async function getPhaseName(phaseId: string | null): Promise<string | null> {
  if (!phaseId) return null;
  const row = await one<{ nombre: string }>("select nombre from offline_phases where id = ?", [
    phaseId,
  ]);
  return row?.nombre ?? null;
}

async function hasValidOfflineEntry(ticketId: string): Promise<boolean> {
  const row = await one<{ n: number }>(
    "select count(*) as n from offline_entries where ticket_id = ? and resultado = 'VALIDO'",
    [ticketId],
  );
  return Number(row?.n ?? 0) > 0;
}

/**
 * Validación 100 % local: el qr_token vive sólo en memoria, se convierte de
 * inmediato a sha256 y se busca por qr_hash. Nunca se persiste el token.
 */
export async function validateOffline(
  qrValue: string,
  eventId: string,
): Promise<OfflineScanResult> {
  const token = qrValue.trim();
  if (!UUID_RE.test(token)) {
    throw new Error("El código escaneado no es un QR de boleto válido.");
  }
  if (!eventId) {
    throw new Error("Elige el evento del control antes de escanear.");
  }

  const gate = await getOfflineGate(eventId);
  if (!gate.allowed) {
    return {
      eventId,
      scannedAt: Date.now(),
      stale: gate.stale,
      blocked: gate.reason ?? "NO_PREPARADO",
      ok: false,
      code: null,
      folio: null,
      comprador: null,
      ticketId: null,
      fase: null,
      pendingSync: false,
      operationId: null,
    };
  }

  const qrHash = await sha256Hex(token);
  const ticket = await one<OfflineTicketRow>(
    "select * from offline_tickets where qr_hash = ? limit 1",
    [qrHash],
  );
  const fase = await getPhaseName(ticket?.phase_id ?? null);
  const hasValidEntry = ticket ? await hasValidOfflineEntry(ticket.id) : false;
  const code = decideOfflineCode(ticket ? toSnapshot(ticket) : null, eventId, hasValidEntry);
  const scannedAt = Date.now();
  const deviceId = await getDeviceId();
  const entryTicketId = ticket && code !== "NO_EXISTE" ? ticket.id : "";
  const folio = ticket ? ticket.folio : null;
  const comprador = code === "VALIDO" ? (ticket?.comprador_nombre ?? null) : null;

  const operation = await withTransaction(async () => {
    const op = await enqueueOperation({
      entityType: "entry",
      operationType: "create",
      payload: {
        eventId,
        ticketId: entryTicketId || null,
        qrHash,
        resultado: code,
        localScannedAt: scannedAt,
        deviceId,
      },
      eventId,
      deviceId,
    });
    await run(
      `insert into offline_entries
         (operation_id, ticket_id, event_id, qr_hash, local_scanned_at, resultado, folio, comprador_nombre, fase, sync_status, device_id)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        op.id,
        entryTicketId,
        eventId,
        qrHash,
        scannedAt,
        code,
        folio,
        ticket?.comprador_nombre ?? null,
        fase,
        deviceId,
      ],
    );
    if (code === "VALIDO" && ticket) {
      await run("update offline_tickets set estado = 'UTILIZADO' where id = ?", [ticket.id]);
    }
    return op;
  });

  return {
    eventId,
    scannedAt,
    stale: gate.stale,
    blocked: null,
    ok: code === "VALIDO",
    code,
    folio,
    comprador,
    ticketId: code === "VALIDO" && ticket ? ticket.id : null,
    fase,
    pendingSync: true,
    operationId: operation.id,
  };
}

function toSnapshot(ticket: OfflineTicketRow): OfflineTicketSnapshot {
  return {
    id: ticket.id,
    event_id: ticket.event_id,
    estado: ticket.estado,
    folio: ticket.folio,
    comprador_nombre: ticket.comprador_nombre,
  };
}
