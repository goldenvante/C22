import { HEX_RE } from "@/branding/palette";
import { isTicketFont } from "@/constants/type";
import { supabase, type Committee } from "@/lib/supabase";

export const COMMITTEE_LOGO_BUCKET = "committee-logos";

const USUARIO_RE = /^[a-z0-9._-]{3,32}$/;

export type SignupCommitteeInput = {
  committeeNombre: string;
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  /** URL pública del logo; en el registro llega como null y se sube con uploadCommitteeLogo tras iniciar sesión. */
  logoUrl?: string | null;
  facultad?: string | null;
  usuario: string;
  email: string;
  nombre: string;
  password: string;
};

export type SignupCommitteeResult = {
  committeeId: string;
  id: string;
  usuario: string;
  email?: string;
};

function friendlySignupError(code?: string, message?: string, status?: number): Error {
  if (code === "USUARIO_TAKEN") return new Error("El usuario ya existe. Elige otro nombre de usuario.");
  if (code === "EMAIL_TAKEN") return new Error("Ese correo ya está en uso por otra cuenta.");
  if (code === "INVALID_COMMITTEE") return new Error("Nombre del comité inválido (2-80 caracteres).");
  if (code === "INVALID_COLORS") return new Error("Colores inválidos. Usa formato #RRGGBB.");
  if (code === "INVALID_USUARIO") {
    return new Error("Usuario inválido: 3-32 caracteres, minúsculas, números, punto, guion o guion bajo.");
  }
  if (code === "INVALID_PASSWORD") return new Error("La contraseña debe tener al menos 8 caracteres.");
  if (code === "INVALID_EMAIL") return new Error("Escribe un correo electrónico válido.");
  if (message) return new Error(message);
  if (status === 409) return new Error("El usuario ya existe. Elige otro nombre de usuario.");
  return new Error("No se pudo registrar el comité. Inténtalo de nuevo.");
}

/**
 * Registro inicial (pantalla única): crea comité + cuenta administradora.
 * Valida en cliente y delega la creación a la Edge Function committee-signup.
 */
export async function signupCommittee(input: SignupCommitteeInput): Promise<SignupCommitteeResult> {
  const committeeNombre = input.committeeNombre.trim();
  const usuario = input.usuario.trim().toLowerCase();
  const nombre = input.nombre.trim();
  if (committeeNombre.length < 2 || committeeNombre.length > 80) {
    throw new Error("Nombre del comité inválido (2-80 caracteres).");
  }
  if (!HEX_RE.test(input.colorPrimario) || !HEX_RE.test(input.colorSecundario) || !HEX_RE.test(input.colorFondo)) {
    throw new Error("Colores inválidos. Usa formato #RRGGBB.");
  }
  if (!USUARIO_RE.test(usuario)) {
    throw new Error("Usuario inválido: 3-32 caracteres, minúsculas, números, punto, guion o guion bajo.");
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    throw new Error("Escribe un correo electrónico válido.");
  }
  if (nombre.length < 1 || nombre.length > 120) {
    throw new Error("El nombre del encargado debe tener entre 1 y 120 caracteres.");
  }
  if (input.password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }
  const facultad = input.facultad?.trim() ?? "";
  if (facultad.length > 160) {
    throw new Error("La facultad no puede superar los 160 caracteres.");
  }

  const { data, error } = await supabase.functions.invoke("committee-signup", {
    body: {
      committeeNombre,
      colorPrimario: input.colorPrimario.toUpperCase(),
      colorSecundario: input.colorSecundario.toUpperCase(),
      colorFondo: input.colorFondo.toUpperCase(),
      logoUrl: input.logoUrl ?? null,
      facultad: facultad || null,
      usuario,
      email,
      nombre,
      password: input.password,
    },
  });
  if (error) {
    const e = error as { status?: number; context?: unknown };
    try {
      const body = (await (e.context as Response).json()) as { code?: string; message?: string };
      throw friendlySignupError(body?.code, body?.message, e.status);
    } catch (err) {
      if (err instanceof Error && !/Failed to fetch|Network/i.test(err.message)) throw err;
      throw friendlySignupError(undefined, undefined, e.status);
    }
  }
  const created = data as { ok?: boolean; committeeId?: string; id?: string; usuario?: string; email?: string };
  if (!created?.committeeId || !created?.id) throw new Error("Respuesta inesperada del servidor.");
  return {
    committeeId: created.committeeId,
    id: created.id,
    usuario: created.usuario ?? usuario,
    email: created.email ?? email,
  };
}

/** Comité del admin actual (para ajustes de branding). */
export async function getMyCommittee(committeeId: string): Promise<Committee | null> {
  const { data, error } = await supabase
    .from("committees")
    .select(
      "id,nombre,color_primario,color_secundario,color_fondo,logo_url,facultad,titulo_fuente,titulo_tamano",
    )
    .eq("id", committeeId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar tu comité.");
  return (data as Committee | null) ?? null;
}

export type UpdateCommitteeInput = {
  id: string;
  nombre: string;
  colorPrimario: string;
  colorSecundario: string;
  colorFondo: string;
  logoUrl?: string | null;
  facultad?: string | null;
  tituloFuente?: string;
  tituloTamano?: number;
};

/** Ajustes de branding (solo admin del comité, vía RLS). */
export async function updateCommittee(input: UpdateCommitteeInput): Promise<void> {
  const nombre = input.nombre.trim();
  if (nombre.length < 2 || nombre.length > 80) {
    throw new Error("Nombre del comité inválido (2-80 caracteres).");
  }
  if (!HEX_RE.test(input.colorPrimario) || !HEX_RE.test(input.colorSecundario) || !HEX_RE.test(input.colorFondo)) {
    throw new Error("Colores inválidos. Usa formato #RRGGBB.");
  }
  const facultad = input.facultad?.trim() ?? "";
  if (facultad.length > 160) {
    throw new Error("La facultad no puede superar los 160 caracteres.");
  }
  if (input.tituloFuente !== undefined && !isTicketFont(input.tituloFuente)) {
    throw new Error("Fuente del título inválida.");
  }
  if (input.tituloTamano !== undefined && !Number.isInteger(input.tituloTamano)) {
    throw new Error("Tamaño del título inválido (20-48).");
  }
  if (input.tituloTamano !== undefined && (input.tituloTamano < 20 || input.tituloTamano > 48)) {
    throw new Error("Tamaño del título inválido (20-48).");
  }
  const patch: Record<string, string | number | null> = {
    nombre,
    color_primario: input.colorPrimario.toUpperCase(),
    color_secundario: input.colorSecundario.toUpperCase(),
    color_fondo: input.colorFondo.toUpperCase(),
  };
  if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
  if (input.facultad !== undefined) patch.facultad = facultad || null;
  if (input.tituloFuente !== undefined) patch.titulo_fuente = input.tituloFuente;
  if (input.tituloTamano !== undefined) patch.titulo_tamano = input.tituloTamano;
  const { error } = await supabase.from("committees").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message || "No se pudo guardar el comité.");
}

const LOGO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Sube el icono del comité al bucket público y devuelve la URL pública.
 * Requiere sesión de admin (storage exige is_active_member). `scope` es la
 * carpeta destino: el committeeId en el registro, o el committeeId al
 * cambiar el icono desde Configuración. La URL se guarda con updateCommittee.
 */
export async function uploadCommitteeLogo(
  localUri: string,
  mimeType?: string | null,
  scope?: string,
): Promise<string> {
  const mime = mimeType ?? "image/jpeg";
  const ext = LOGO_EXT[mime];
  if (!ext) throw new Error("Tipo de imagen no permitido. Usa JPG, PNG o WEBP.");
  let buffer: ArrayBuffer;
  try {
    const res = await fetch(localUri);
    if (!res.ok) throw new Error("read");
    buffer = await res.arrayBuffer();
  } catch {
    throw new Error("No se pudo leer la imagen seleccionada.");
  }
  if (buffer.byteLength === 0) throw new Error("La imagen está vacía.");
  if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("La imagen supera los 5 MB.");
  const folder = scope ?? `pendiente-${Date.now()}`;
  const path = `${folder}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(COMMITTEE_LOGO_BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/bucket not found|bucket_not_found/i.test(msg)) {
      throw new Error("Bucket de logos no configurado en Supabase (aplica la migración).");
    }
    if (/row-level security|permission|not authorized|403/i.test(msg)) {
      throw new Error("Sin permiso para subir el logo.");
    }
    throw new Error(msg || "No se pudo subir el logo.");
  }
  const { data } = supabase.storage.from(COMMITTEE_LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
