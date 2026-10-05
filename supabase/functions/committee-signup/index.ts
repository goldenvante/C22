// ============================================================================
// Registro público de comité + cuenta administradora (pantalla "una sola vez").
// Crea: committees row + Auth user admin + profiles row con committee_id.
// Server-side ONLY con ctx.supabaseAdmin (bypasa RLS).
// verify_jwt = false: es signup público con rate-limit implícito por unicidad
// de usuario. Nunca devuelve password ni secretos.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
import type { SupabaseContext } from "npm:@supabase/server@^1";

type AdminDb = SupabaseContext["supabaseAdmin"];

const USUARIO_RE = /^[a-z0-9._-]{3,32}$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LEN = 8;

function json(status: number, data: unknown): Response {
  return Response.json(data, { status });
}

function fail(status: number, code: string, message: string): Response {
  return json(status, { ok: false, code, message });
}

function normalizeUsuario(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function validateNombre(raw: unknown, min: number, max: number): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.length < min || v.length > max) return null;
  return v;
}

async function usuarioTaken(db: AdminDb, usuario: string): Promise<boolean> {
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .eq("usuario", usuario)
    .maybeSingle();
  if (error) throw new Error(`PROFILE_CHECK_FAILED: ${error.message}`);
  return data !== null;
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return fail(405, "METHOD_NOT_ALLOWED", "Solo POST.");
    }
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fail(400, "BAD_REQUEST", "Cuerpo JSON inválido.");
    }

    const db = ctx.supabaseAdmin;

    // ---- Comité ----
    const committeeNombre = validateNombre(body.committeeNombre, 2, 80);
    if (!committeeNombre) {
      return fail(400, "INVALID_COMMITTEE", "Nombre del comité inválido (2-80 caracteres).");
    }
    const colorPrimario = typeof body.colorPrimario === "string" ? body.colorPrimario.trim() : "";
    const colorSecundario = typeof body.colorSecundario === "string" ? body.colorSecundario.trim() : "";
    const colorFondo = typeof body.colorFondo === "string" ? body.colorFondo.trim() : "";
    if (!HEX_RE.test(colorPrimario) || !HEX_RE.test(colorSecundario) || !HEX_RE.test(colorFondo)) {
      return fail(400, "INVALID_COLORS", "Colores inválidos. Usa formato #RRGGBB.");
    }
    const logoUrl = typeof body.logoUrl === "string" && body.logoUrl.trim().length > 0
      ? body.logoUrl.trim()
      : null;
    if (logoUrl && logoUrl.length > 500) {
      return fail(400, "INVALID_LOGO", "URL del logo demasiado larga.");
    }

    // ---- Admin encargado ----
    const usuario = normalizeUsuario(body.usuario);
    const nombre = validateNombre(body.nombre, 1, 120);
    if (!USUARIO_RE.test(usuario)) {
      return fail(400, "INVALID_USUARIO", "Usuario inválido: 3-32 caracteres, minúsculas, números, punto, guion y guion bajo.");
    }
    if (!nombre) {
      return fail(400, "INVALID_NOMBRE", "Nombre del encargado inválido (1-120 caracteres).");
    }
    if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LEN) {
      return fail(400, "INVALID_PASSWORD", `Contraseña inválida (mínimo ${MIN_PASSWORD_LEN} caracteres).`);
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return fail(400, "INVALID_EMAIL", "Correo electrónico inválido.");
    }

    try {
      if (await usuarioTaken(db, usuario)) {
        return fail(409, "USUARIO_TAKEN", "El usuario ya existe. Elige otro.");
      }
    } catch (e) {
      return fail(500, "PROFILE_CHECK_FAILED", (e as Error).message);
    }

    // 1. Comité primero (sin created_by aún).
    const { data: committee, error: committeeError } = await db
      .from("committees")
      .insert({
        nombre: committeeNombre,
        color_primario: colorPrimario,
        color_secundario: colorSecundario,
        color_fondo: colorFondo,
        logo_url: logoUrl,
      })
      .select("id")
      .single();
    if (committeeError || !committee) {
      return fail(500, "COMMITTEE_CREATE_FAILED", committeeError?.message ?? "No se pudo crear el comité.");
    }
    const committeeId = committee.id as string;

    // 2. Usuario Auth admin.
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      password: body.password as string,
      email_confirm: true,
      user_metadata: { usuario, debe_cambiar_password: false, committee_id: committeeId },
    });
    if (createError || !created.user) {
      await db.from("committees").delete().eq("id", committeeId);
      const msg = createError?.message ?? "unknown";
      if (/already (been )?registered|already exists|email_exists/i.test(msg)) {
        return fail(409, "EMAIL_TAKEN", "Ese correo ya está en uso por otra cuenta.");
      }
      return fail(500, "AUTH_CREATE_FAILED", `No se pudo crear el usuario: ${msg}`);
    }
    const authId = created.user.id;

    // 3. Profile admin con committee_id.
    const { error: profileError } = await db.from("profiles").insert({
      id: authId,
      nombre,
      usuario,
      roles: ["admin"],
      activo: true,
      committee_id: committeeId,
    });
    if (profileError) {
      await db.auth.admin.deleteUser(authId);
      await db.from("committees").delete().eq("id", committeeId);
      if (profileError.code === "23505") {
        return fail(409, "USUARIO_TAKEN", "El usuario ya existe.");
      }
      return fail(500, "PROFILE_CREATE_FAILED", profileError.message);
    }

    // 4. Vincular creador (best-effort, no bloquea el registro).
    await db.from("committees").update({ created_by: authId }).eq("id", committeeId);

    return json(201, { ok: true, committeeId, id: authId, usuario, email, rol: "admin" });
  }),
};
