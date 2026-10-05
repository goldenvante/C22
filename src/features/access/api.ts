import { supabase } from "@/lib/supabase";
import type { TicketEstado } from "@/features/sales/types";
import type { ConnectivityStatus } from "@/offline/Connectivity";
import { OFFLINE_BLOCK_MESSAGES } from "@/offline/repo/events";
import { validateOffline } from "@/offline/repo/tickets";

/**
 * Códigos EXACTOS que devuelve la RPC validate_entry. No inventar otros:
 * la UI los diferencia uno por uno.
 */
export type ValidateCode =
  | "VALIDO"
  | "YA_UTILIZADO"
  | "CANCELADO"
  | "NO_EXISTE"
  | "EVENTO_INCORRECTO"
  | "NO_AUTORIZADO";

const VALID_CODES: ValidateCode[] = [
  "VALIDO",
  "YA_UTILIZADO",
  "CANCELADO",
  "NO_EXISTE",
  "EVENTO_INCORRECTO",
  "NO_AUTORIZADO",
];

export type ValidateResult = {
  ok: boolean;
  code: ValidateCode;
  /** Solo presente en VALIDO, YA_UTILIZADO, CANCELADO y EVENTO_INCORRECTO. */
  folio: number | null;
  /** Solo presente en VALIDO. */
  comprador: string | null;
  /** Solo presente en VALIDO. */
  ticketId: string | null;
  /** Nombre vivo de la fase (VALIDO, YA_UTILIZADO, CANCELADO, EVENTO_INCORRECTO). */
  fase: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True si el texto es un UUID (formato del qr_token). */
export function isTicketQr(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function friendlyRpcError(e: unknown): Error {
  const message = (e as { message?: string } | null)?.message ?? "";
  if (/network|fetch|failed|could not|timeout/i.test(message)) {
    return new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  }
  return new Error(message || "No se pudo validar el boleto.");
}

/**
 * token + eventId → resultado. La RPC es SECURITY DEFINER y registra la
 * auditoría; el cliente nunca escribe tickets ni necesita service_role.
 * QR con formato inválido se rechaza localmente SIN llamar a la RPC.
 */
export async function validateTicket(qrValue: string, eventId: string): Promise<ValidateResult> {
  const token = qrValue.trim();
  if (!UUID_RE.test(token)) {
    throw new Error("El código escaneado no es un QR de boleto válido.");
  }
  if (!eventId) {
    throw new Error("Elige el evento del control antes de escanear.");
  }
  const { data, error } = await supabase.rpc("validate_entry", {
    p_qr_token: token,
    p_event_id: eventId,
  });
  if (error) throw friendlyRpcError(error);
  // Forma real de la RPC: { ok, code, folio?, comprador?, ticket_id?, fase? }.
  const raw = data as { ok?: boolean; code?: string; folio?: number; comprador?: string; ticket_id?: string; fase?: string } | null;
  if (!raw || !VALID_CODES.includes(raw.code as ValidateCode)) {
    throw new Error("Respuesta inesperada del servidor.");
  }
  return {
    ok: raw.ok === true,
    code: raw.code as ValidateCode,
    folio: typeof raw.folio === "number" ? raw.folio : null,
    comprador: typeof raw.comprador === "string" ? raw.comprador : null,
    ticketId: typeof raw.ticket_id === "string" ? raw.ticket_id : null,
    fase: typeof raw.fase === "string" ? raw.fase : null,
  };
}

export type ScanRecord = {
  id: string;
  ticketId: string | null;
  eventId: string;
  scannedAt: string;
  resultado: ValidateCode;
  qrToken: string | null;
  /** Join permitido por RLS (eventos publicados). Null si no aplica. */
  evento: { nombre: string; codigo: string } | null;
  // NOTA: sin join a tickets (RLS de access lo bloquea) y sin fase/precio/
  // comprador: la RPC no los devuelve y no deben inventarse.
};

/**
 * Historial de entradas propias desde entries. RLS limita a
 * scanned_by = auth.uid(); sin joins a tickets.
 */
export async function myScans(): Promise<ScanRecord[]> {
  const { data, error } = await supabase
    .from("entries")
    .select("id,ticket_id,event_id,scanned_at,resultado,qr_token,events(nombre,codigo)")
    .order("scanned_at", { ascending: false });
  if (error) {
    const message = error.message ?? "";
    if (/network|fetch|failed|could not|timeout/i.test(message)) {
      throw new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    }
    throw new Error(message || "No se pudo cargar el historial.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toScanRecord);
}

function toScanRecord(row: Record<string, unknown>): ScanRecord {
  const evento = row.events as { nombre?: string; codigo?: string } | null;
  const resultado = row.resultado as string;
  return {
    id: row.id as string,
    ticketId: (row.ticket_id as string | null) ?? null,
    eventId: row.event_id as string,
    scannedAt: row.scanned_at as string,
    resultado: (VALID_CODES.includes(resultado as ValidateCode)
      ? resultado
      : "NO_EXISTE") as ValidateCode,
    qrToken: (row.qr_token as string | null) ?? null,
    evento: evento?.nombre ? { nombre: evento.nombre, codigo: evento.codigo ?? "" } : null,
  };
}

/**
 * Una entry propia por id (RLS limita a scanned_by = auth.uid()).
 * Null si no existe o no es visible.
 */
export async function getScanEntry(id: string): Promise<ScanRecord | null> {
  const { data, error } = await supabase
    .from("entries")
    .select("id,ticket_id,event_id,scanned_at,resultado,qr_token,events(nombre,codigo)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    const message = error.message ?? "";
    if (/network|fetch|failed|could not|timeout/i.test(message)) {
      throw new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    }
    throw new Error(message || "No se pudo cargar el acceso.");
  }
  if (!data) return null;
  return toScanRecord(data as Record<string, unknown>);
}

export type EntryTicketCode = "OK" | "NO_AUTORIZADO" | "NO_EXISTE" | "SIN_BOLETO";

export type EntryTicketBundle = {
  entry: { id: string; resultado: ValidateCode; scannedAt: string };
  ticket: {
    id: string;
    folio: number;
    comprador: string;
    estado: TicketEstado;
    qrToken: string;
    esCortesia: boolean;
  };
  evento: {
    nombre: string;
    fecha: string | null;
    hora: string | null;
    lugar: string | null;
    imagenUrl: string | null;
  } | null;
  fase: string | null;
};

export type EntryTicketResult =
  | { ok: true; code: "OK"; bundle: EntryTicketBundle }
  | { ok: false; code: Exclude<EntryTicketCode, "OK">; bundle: null };

/**
 * Boleto asociado a una entry propia vía RPC SECURITY DEFINER
 * (sin SELECT directo sobre tickets). Incluye fase y evento para contexto.
 */
export async function getEntryTicket(entryId: string): Promise<EntryTicketResult> {
  const { data, error } = await supabase.rpc("get_entry_ticket", {
    p_entry_id: entryId,
  });
  if (error) {
    const message = error.message ?? "";
    if (/network|fetch|failed|could not|timeout/i.test(message)) {
      throw new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    }
    throw new Error(message || "No se pudo cargar el boleto.");
  }
  const raw = data as {
    ok?: boolean;
    code?: string;
    entry?: { id?: string; resultado?: string; scanned_at?: string };
    ticket?: { id?: string; folio?: number; comprador?: string; estado?: string; qr_token?: string; es_cortesia?: boolean };
    evento?: { nombre?: string; fecha?: string | null; hora?: string | null; lugar?: string | null; imagen_url?: string | null } | null;
    fase?: string;
  } | null;
  const code = raw?.code;
  if (!raw || (code !== "OK" && code !== "NO_AUTORIZADO" && code !== "NO_EXISTE" && code !== "SIN_BOLETO")) {
    throw new Error("Respuesta inesperada del servidor.");
  }
  if (!raw.ok || code !== "OK") {
    return { ok: false, code: code as Exclude<EntryTicketCode, "OK">, bundle: null };
  }
  const t = raw.ticket;
  const e = raw.entry;
  if (!t?.id || typeof t.folio !== "number" || !e?.id) {
    throw new Error("Respuesta inesperada del servidor.");
  }
  const ev = raw.evento;
  return {
    ok: true,
    code: "OK",
    bundle: {
      entry: {
        id: e.id,
        resultado: (VALID_CODES.includes(e.resultado as ValidateCode)
          ? (e.resultado as ValidateCode)
          : "NO_EXISTE"),
        scannedAt: typeof e.scanned_at === "string" ? e.scanned_at : "",
      },
      ticket: {
        id: t.id,
        folio: t.folio,
        comprador: typeof t.comprador === "string" ? t.comprador : "",
        estado: (t.estado as TicketEstado) ?? "ACTIVO",
        qrToken: typeof t.qr_token === "string" ? t.qr_token : "",
        esCortesia: t.es_cortesia === true,
      },
      evento: ev?.nombre
        ? {
            nombre: ev.nombre,
            fecha: ev.fecha ?? null,
            hora: ev.hora ?? null,
            lugar: ev.lugar ?? null,
            imagenUrl: ev.imagen_url ?? null,
          }
        : null,
      fase: typeof raw.fase === "string" ? raw.fase : null,
    },
  };
}

/** Estados que devuelve list_guestlist (enum de BD en texto). */
const GUEST_ESTADOS: TicketEstado[] = ["ACTIVO", "UTILIZADO", "CANCELADO"];

export type GuestTicket = {
  ticketId: string;
  folio: number;
  comprador: string;
  fase: string | null;
  estado: TicketEstado;
  esCortesia: boolean;
};

/**
 * Lista de puerta del evento vía RPC SECURITY DEFINER list_guestlist
 * (sin SELECT directo sobre tickets y SIN qr_token). Sirve para buscar
 * por nombre/folio a quien perdió su QR y registrar su entrada manual.
 */
export async function listGuestlist(eventId: string): Promise<GuestTicket[]> {
  if (!eventId) {
    throw new Error("Elige el evento del control antes de ver la lista.");
  }
  const { data, error } = await supabase.rpc("list_guestlist", {
    p_event_id: eventId,
  });
  if (error) {
    const message = error.message ?? "";
    if (/network|fetch|failed|could not|timeout/i.test(message)) {
      throw new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    }
    throw new Error(message || "No se pudo cargar la lista.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row, i) => {
    const estado = row.estado as string;
    if (
      typeof row.ticket_id !== "string" ||
      typeof row.folio !== "number" ||
      typeof row.comprador !== "string" ||
      !GUEST_ESTADOS.includes(estado as TicketEstado)
    ) {
      throw new Error(`Respuesta inesperada del servidor (fila ${i}).`);
    }
    return {
      ticketId: row.ticket_id,
      folio: row.folio,
      comprador: row.comprador,
      fase: typeof row.fase === "string" ? row.fase : null,
      estado: estado as TicketEstado,
      esCortesia: row.es_cortesia === true,
    };
  });
}

function parseValidateResult(data: unknown): ValidateResult {
  const raw = data as { ok?: boolean; code?: string; folio?: number; comprador?: string; ticket_id?: string; fase?: string } | null;
  if (!raw || !VALID_CODES.includes(raw.code as ValidateCode)) {
    throw new Error("Respuesta inesperada del servidor.");
  }
  return {
    ok: raw.ok === true,
    code: raw.code as ValidateCode,
    folio: typeof raw.folio === "number" ? raw.folio : null,
    comprador: typeof raw.comprador === "string" ? raw.comprador : null,
    ticketId: typeof raw.ticket_id === "string" ? raw.ticket_id : null,
    fase: typeof raw.fase === "string" ? raw.fase : null,
  };
}

/**
 * ticketId + eventId → resultado. Misma máquina de estados y códigos que
 * validateTicket, pero buscando por id (entrada manual desde la lista de
 * puerta). La RPC es SECURITY DEFINER y registra la auditoría.
 */
export async function validateEntryById(ticketId: string, eventId: string): Promise<ValidateResult> {
  const id = ticketId.trim();
  if (!UUID_RE.test(id)) {
    throw new Error("El boleto seleccionado no es válido.");
  }
  if (!eventId) {
    throw new Error("Elige el evento del control antes de registrar.");
  }
  const { data, error } = await supabase.rpc("validate_entry_by_id", {
    p_ticket_id: id,
    p_event_id: eventId,
  });
  if (error) throw friendlyRpcError(error);
  return parseValidateResult(data);
}

export type ScanResult = ValidateResult & {
  /** true cuando el resultado salió de SQLite y no de Supabase. */
  offline: boolean;
  /** Paquete sin conexión sin sincronizar por más de 12 h (advertencia). */
  stale: boolean;
  /** Operación enlazada en sync_queue, pendiente de FASE 6. */
  pendingSync: boolean;
  operationId: string | null;
};

/**
 * Selecciona ONLINE u OFFLINE: "unknown" conserva el comportamiento actual
 * (se considera online). El flujo online sigue siendo validateEntry sin cambios.
 */
export async function validateScan(
  qrValue: string,
  eventId: string,
  status: ConnectivityStatus,
): Promise<ScanResult> {
  if (status === "offline") {
    const local = await validateOffline(qrValue, eventId);
    if (local.blocked) throw new Error(OFFLINE_BLOCK_MESSAGES[local.blocked]);
    return {
      ok: local.ok,
      code: local.code,
      folio: local.folio,
      comprador: local.comprador,
      ticketId: local.ticketId,
      fase: local.fase,
      offline: true,
      stale: local.stale,
      pendingSync: local.pendingSync,
      operationId: local.operationId,
    };
  }
  const remote = await validateTicket(qrValue, eventId);
  return {
    ...remote,
    offline: false,
    stale: false,
    pendingSync: false,
    operationId: null,
  };
}
