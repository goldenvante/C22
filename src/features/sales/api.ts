import { supabase } from "@/lib/supabase";
import { type EventItem, type EventPhase } from "@/features/events/types";

import {
  METODOS_PAGO,
  type MetodoPago,
  type NewSaleInput,
  type SaleTicket,
  type TicketEstado,
} from "./types";

function friendlyRpcError(e: unknown, fallback: string): Error {
  const message = (e as { message?: string } | null)?.message ?? "";
  if (/FASE_FUERA_DE_VIGENCIA/i.test(message)) {
    return new Error("La fase está fuera de vigencia.");
  }
  if (/Fase inactiva/i.test(message)) {
    return new Error("La fase ya no está activa.");
  }
  if (/Evento no disponible/i.test(message)) {
    return new Error("El evento ya no está disponible para venta.");
  }
  if (/Comprador requerido/i.test(message)) {
    return new Error("Escribe el nombre del comprador.");
  }
  if (/NO_AUTORIZADO/i.test(message)) {
    return new Error("Tu sesión expiró o no tienes permiso. Inicia sesión de nuevo.");
  }
  if (/Solo tickets ACTIVO/i.test(message)) {
    return new Error("Solo se pueden cancelar boletos activos.");
  }
  if (/SIN_CORTESIAS/i.test(message)) {
    return new Error("Ya no tienes cortesías disponibles para este evento.");
  }
  if (/Sin fase disponible/i.test(message)) {
    return new Error("Este evento no tiene fase disponible para cortesías.");
  }
  return new Error(message || fallback);
}

function toSale(row: Record<string, unknown>): SaleTicket {
  const evento = row.events as {
    nombre?: string;
    codigo?: string;
    fecha?: string | null;
    hora?: string | null;
    lugar?: string | null;
    imagen_url?: string | null;
    mapas_url?: string | null;
  } | null;
  const fase = row.event_phases as { nombre?: string } | null;
  const vendedor = row.profiles as { nombre?: string; usuario?: string } | null;
  return {
    id: row.id as string,
    event_id: row.event_id as string,
    phase_id: row.phase_id as string,
    folio: Number(row.folio),
    precio_pagado: Number(row.precio_pagado),
    metodo_pago: row.metodo_pago as MetodoPago,
    comprador_nombre: row.comprador_nombre as string,
    comprador_telefono: (row.comprador_telefono as string | null) ?? null,
    qr_token: row.qr_token as string,
    estado: row.estado as TicketEstado,
    es_cortesia: Boolean(row.es_cortesia ?? false),
    seller_id: row.seller_id as string,
    created_at: row.created_at as string,
    evento: evento?.nombre
      ? {
          nombre: evento.nombre,
          codigo: evento.codigo ?? "",
          fecha: evento.fecha ?? null,
          hora: evento.hora ?? null,
          lugar: evento.lugar ?? null,
          imagen_url: evento.imagen_url ?? null,
          mapas_url: evento.mapas_url ?? null,
        }
      : null,
    fase: fase?.nombre ? { nombre: fase.nombre } : null,
    vendedor: vendedor?.nombre ? { nombre: vendedor.nombre, usuario: vendedor.usuario ?? "" } : null,
  };
}

const SALE_SELECT =
  "*, events(nombre,codigo,fecha,hora,lugar,imagen_url,mapas_url), event_phases(nombre), profiles(nombre,usuario)";

/**
 * Eventos disponibles para vender, ordenados por fecha. Con `admin` se listan
 * los del comité sin filtrar por estado (el RPC ya exime al admin); sin él,
 * solo publicados.
 */
export async function listSellableEvents(admin = false): Promise<EventItem[]> {
  let query = supabase.from("events").select("*");
  if (!admin) query = query.eq("estado", "publicado");
  const { data, error } = await query.order("fecha", { ascending: true });
  if (error) throw new Error(error.message || "No se pudieron cargar los eventos.");
  return (data ?? []) as EventItem[];
}

/**
 * Fases del evento en orden. Se devuelven todas (activas e inactivas, dentro o
 * fuera de vigencia) para que el selector las pinte y las bloqueadas muestren
 * el motivo; quien decide es el RPC, que revalida con fecha de servidor.
 */
export async function listSellablePhases(eventId: string): Promise<EventPhase[]> {
  const { data, error } = await supabase
    .from("event_phases")
    .select("*")
    .eq("event_id", eventId)
    .order("orden", { ascending: true });
  if (error) throw new Error(error.message || "No se pudieron cargar las fases.");
  return (data ?? []) as EventPhase[];
}

/** Crea la venta vía RPC: folio, snapshot y seller los pone el backend. */
export async function createSale(input: NewSaleInput): Promise<SaleTicket> {
  if (!input.event_id || !input.phase_id) {
    throw new Error("Elige evento y fase.");
  }
  if (input.nombre.trim().length < 1 || input.nombre.trim().length > 160) {
    throw new Error("El nombre del comprador es obligatorio (máx. 160).");
  }
  if (input.telefono.trim().length > 32) {
    throw new Error("El teléfono debe tener 32 caracteres como máximo.");
  }
  if (!METODOS_PAGO.includes(input.metodo)) {
    throw new Error("Método de pago inválido.");
  }
  const { data, error } = await supabase.rpc("create_ticket", {
    p_event_id: input.event_id,
    p_phase_id: input.phase_id,
    p_nombre: input.nombre.trim(),
    p_tel: input.telefono.trim() ? input.telefono.trim() : null,
    p_metodo_pago: input.metodo,
  });
  if (error) throw friendlyRpcError(error, "No se pudo registrar la venta.");
  return toSale(data as unknown as Record<string, unknown>);
}

async function callerUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  return id;
}

/** Ventas propias del vendedor autenticado, recientes primero. */
export async function mySales(): Promise<SaleTicket[]> {
  const uid = await callerUid();
  const { data, error } = await supabase
    .from("tickets")
    .select(SALE_SELECT)
    .eq("seller_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "No se pudieron cargar tus ventas.");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toSale);
}

/** Todas las ventas (solo admin por RLS). */
export async function allSales(): Promise<SaleTicket[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(SALE_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "No se pudieron cargar las ventas.");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toSale);
}

/** Detalle de una venta (RLS: propia si seller, todas si admin). */
export async function getSale(id: string): Promise<SaleTicket | null> {
  const { data, error } = await supabase.from("tickets").select(SALE_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message || "No se pudo cargar la venta.");
  return data ? toSale(data as unknown as Record<string, unknown>) : null;
}

/** Cancela un boleto (solo admin; el folio queda consumido). */
export async function cancelSale(id: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_ticket", { p_ticket_id: id });
  if (error) throw friendlyRpcError(error, "No se pudo cancelar la venta.");
}

export type CourtesyQuota = {
  eventId: string;
  sellerId: string;
  asignadas: number;
  usadas: number;
  evento: { nombre: string; codigo: string } | null;
  vendedor: { nombre: string; usuario: string } | null;
};

const QUOTA_SELECT =
  "event_id,seller_id,asignadas,usadas,events(nombre,codigo),profiles(nombre,usuario)";

function toQuota(row: Record<string, unknown>): CourtesyQuota {
  const evento = row.events as { nombre?: string; codigo?: string } | null;
  const vendedor = row.profiles as { nombre?: string; usuario?: string } | null;
  return {
    eventId: row.event_id as string,
    sellerId: row.seller_id as string,
    asignadas: Number(row.asignadas ?? 0),
    usadas: Number(row.usadas ?? 0),
    evento: evento?.nombre ? { nombre: evento.nombre, codigo: evento.codigo ?? "" } : null,
    vendedor: vendedor?.nombre
      ? { nombre: vendedor.nombre, usuario: vendedor.usuario ?? "" }
      : null,
  };
}

/** Cupo propio del vendedor para un evento (0 si no hay fila). */
export async function getMyQuota(eventId: string): Promise<{ asignadas: number; usadas: number }> {
  const uid = await callerUid();
  const { data, error } = await supabase
    .from("courtesy_quotas")
    .select("asignadas,usadas")
    .eq("event_id", eventId)
    .eq("seller_id", uid)
    .maybeSingle();
  if (error) throw new Error(error.message || "No se pudo cargar tu cupo de cortesías.");
  if (!data) return { asignadas: 0, usadas: 0 };
  const row = data as Record<string, unknown>;
  return { asignadas: Number(row.asignadas ?? 0), usadas: Number(row.usadas ?? 0) };
}

/** Todos los cupos (solo admin por RLS). */
export async function listQuotas(): Promise<CourtesyQuota[]> {
  const { data, error } = await supabase
    .from("courtesy_quotas")
    .select(QUOTA_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "No se pudieron cargar las cortesías.");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toQuota);
}

/**
 * Asigna (o reasigna) cortesías a un vendedor para un evento (solo admin
 * por RLS; sin límite superior). Crea la fila si no existe.
 */
export async function setQuota(sellerId: string, eventId: string, asignadas: number): Promise<void> {
  if (!Number.isInteger(asignadas) || asignadas < 0) {
    throw new Error("La cantidad debe ser un número entero mayor o igual a 0.");
  }
  const { error } = await supabase
    .from("courtesy_quotas")
    .upsert({ event_id: eventId, seller_id: sellerId, asignadas }, { onConflict: "event_id,seller_id" });
  if (error) throw new Error(error.message || "No se pudo guardar la asignación.");
}

/**
 * Genera un boleto de cortesía vía RPC: consume folio normal, precio 0,
 * sin fase visible (el RPC usa la primera fase activa como vehículo).
 * Respeta el cupo del seller; el admin no consume cupo.
 */
export async function createCourtesy(
  eventId: string,
  nombre: string,
  telefono: string,
): Promise<SaleTicket> {
  const clean = nombre.trim();
  if (clean.length < 1 || clean.length > 160) {
    throw new Error("El nombre del comprador es obligatorio (máx. 160).");
  }
  if (telefono.trim().length > 32) {
    throw new Error("El teléfono debe tener 32 caracteres como máximo.");
  }
  const { data, error } = await supabase.rpc("create_courtesy_ticket", {
    p_event_id: eventId,
    p_nombre: clean,
    p_tel: telefono.trim() ? telefono.trim() : null,
  });
  if (error) throw friendlyRpcError(error, "No se pudo generar la cortesía.");
  return toSale(data as unknown as Record<string, unknown>);
}
