import { supabase } from "@/lib/supabase";

import type { EventEstado, EventItem, EventPhase } from "./types";

function friendlyDbError(e: unknown, fallback: string): Error {
  const code = (e as { code?: string } | null)?.code;
  const message = (e as { message?: string } | null)?.message ?? "";
  if (code === "23505") {
    if (/codigo/i.test(message)) return new Error("El código ya está en uso por otro evento.");
    return new Error("Ya existe un registro con esos datos.");
  }
  if (code === "23503") {
    return new Error("No se puede eliminar: ya tiene boletos asociados.");
  }
  return new Error(message || fallback);
}

function toEvent(row: Record<string, unknown>): EventItem {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    codigo: row.codigo as string,
    fecha: row.fecha as string,
    hora: (row.hora as string | null) ?? null,
    lugar: (row.lugar as string | null) ?? null,
    imagen_url: (row.imagen_url as string | null) ?? null,
    mapas_url: (row.mapas_url as string | null) ?? null,
    estado: row.estado as EventEstado,
    ultimo_folio: Number(row.ultimo_folio ?? 0),
    created_at: row.created_at as string,
  };
}

function toPhase(row: Record<string, unknown>): EventPhase {
  return {
    id: row.id as string,
    event_id: row.event_id as string,
    nombre: row.nombre as string,
    precio: Number(row.precio),
    orden: Number(row.orden),
    activa: Boolean(row.activa),
    fecha_inicio: (row.fecha_inicio as string | null) ?? null,
    fecha_fin: (row.fecha_fin as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export async function listEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("fecha", { ascending: true });
  if (error) throw friendlyDbError(error, "No se pudieron cargar los eventos.");
  return (data as Record<string, unknown>[]).map(toEvent);
}

export async function getEvent(id: string): Promise<EventItem | null> {
  const { data, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (error) throw friendlyDbError(error, "No se pudo cargar el evento.");
  return data ? toEvent(data as Record<string, unknown>) : null;
}

export type EventInput = {
  nombre: string;
  codigo: string;
  fecha: string;
  hora: string | null;
  lugar: string | null;
  imagen_url: string | null;
  mapas_url: string | null;
};

/**
 * Bucket público de Supabase Storage para imágenes de eventos.
 * Lectura pública; escritura solo admin activo (políticas en Supabase).
 */
export const EVENT_IMAGE_BUCKET = "eventos";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type UploadedImage = { path: string; publicUrl: string };

/**
 * Sube la imagen seleccionada (URI file://) al bucket y devuelve
 * la ruta interna + la URL pública para guardar en events.imagen_url.
 * Nunca guarda rutas locales en la base de datos.
 */
export async function uploadEventImage(
  eventId: string,
  localUri: string,
  mimeType?: string | null,
): Promise<UploadedImage> {
  const mime = mimeType ?? "image/jpeg";
  const ext = IMAGE_EXT[mime];
  if (!ext) {
    throw new Error("Tipo de imagen no permitido. Usa JPG, PNG o WEBP.");
  }
  let buffer: ArrayBuffer;
  try {
    const res = await fetch(localUri);
    if (!res.ok) throw new Error("read");
    buffer = await res.arrayBuffer();
  } catch {
    throw new Error("No se pudo leer la imagen seleccionada.");
  }
  if (buffer.byteLength === 0) {
    throw new Error("La imagen está vacía.");
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera los 5 MB.");
  }
  const path = `${eventId}/portada-${Date.now()}.${ext}`;
  const { error } = await supabase
    .storage
    .from(EVENT_IMAGE_BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (error) {
    const msg = error.message ?? "";
    if (/bucket not found|bucket_not_found/i.test(msg)) {
      throw new Error("Bucket de imágenes no configurado en Supabase.");
    }
    if (/row-level security|permission|not authorized|403/i.test(msg)) {
      throw new Error("Sin permiso para subir imágenes.");
    }
    throw new Error(msg || "No se pudo subir la imagen.");
  }
  const { data } = supabase.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/** Extrae la ruta interna del bucket desde una URL pública. Null si no aplica. */
export function eventImagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${EVENT_IMAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = url.slice(i + marker.length).split(/[?#]/)[0];
  return path || null;
}

/** Elimina un objeto del bucket. Lanza si falla (usar best-effort al limpiar). */
export async function deleteEventImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).remove([path]);
  if (error) throw new Error(error.message || "No se pudo eliminar la imagen anterior.");
}

export async function createEvent(input: EventInput): Promise<EventItem> {
  const { data, error } = await supabase.from("events").insert(input).select("*").single();
  if (error) throw friendlyDbError(error, "No se pudo crear el evento.");
  return toEvent(data as Record<string, unknown>);
}

export async function updateEvent(id: string, patch: Partial<EventInput>): Promise<EventItem> {
  const { data, error } = await supabase.from("events").update(patch).eq("id", id).select("*").single();
  if (error) throw friendlyDbError(error, "No se pudo guardar el evento.");
  return toEvent(data as Record<string, unknown>);
}

export async function changeEventEstado(id: string, estado: EventEstado): Promise<EventItem> {
  const { data, error } = await supabase
    .from("events")
    .update({ estado })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw friendlyDbError(error, "No se pudo cambiar el estado.");
  return toEvent(data as Record<string, unknown>);
}

export async function listPhases(eventId: string): Promise<EventPhase[]> {
  const { data, error } = await supabase
    .from("event_phases")
    .select("*")
    .eq("event_id", eventId)
    .order("orden", { ascending: true });
  if (error) throw friendlyDbError(error, "No se pudieron cargar las fases.");
  return (data as Record<string, unknown>[]).map(toPhase);
}

export async function createPhase(
  eventId: string,
  input: { nombre: string; precio: number; fecha_inicio: string; fecha_fin: string },
): Promise<EventPhase> {
  const { data: maxRow, error: maxError } = await supabase
    .from("event_phases")
    .select("orden")
    .eq("event_id", eventId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw friendlyDbError(maxError, "No se pudo crear la fase.");
  const orden = maxRow ? Number((maxRow as Record<string, unknown>).orden) + 1 : 1;

  const { data, error } = await supabase
    .from("event_phases")
    .insert({
      event_id: eventId,
      nombre: input.nombre,
      precio: input.precio,
      orden,
      fecha_inicio: input.fecha_inicio,
      fecha_fin: input.fecha_fin,
    })
    .select("*")
    .single();
  if (error) throw friendlyDbError(error, "No se pudo crear la fase.");
  return toPhase(data as Record<string, unknown>);
}

// NOTA: no existen updatePhase ni deletePhase a propósito. Las fases son
// inmutables por trigger en BD (antifraude): solo se crean y se listan.
