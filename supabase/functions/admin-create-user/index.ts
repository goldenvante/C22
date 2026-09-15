// ============================================================================
// Comité C22 · Edge Function: admin-create-user
// Crea usuarios Auth + fila profiles. Server-side ONLY.
//
// Patrón oficial Supabase (@supabase/server): withSupabase({ auth: "none" })
// porque la autenticación la hace esta función en código (bootstrap sin JWT,
// admin con JWT verificado aquí). verify_jwt = false en config.toml.
// TODAS las operaciones privilegiadas (consultas/inserts en profiles y Auth
// Admin API) usan ctx.supabaseAdmin, que bypasa RLS. RLS no se toca.
//
// Modos:
//  - bootstrap: crea el PRIMER admin. Exige ADMIN_BOOTSTRAP_SECRET y que no
//    exista ningún profile con rol='admin'. Sin JWT.
//  - admin: un admin activo crea seller|access. Exige JWT válido de un admin.
//    Nunca crea rol='admin'.
// Contraseñas: solo viajan al Auth Admin API. Nunca se guardan ni devuelven.
// Sin claves reales en el código: el contexto lee SUPABASE_URL y
// SUPABASE_SECRET_KEYS pre-provistos por el runtime.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
import type { SupabaseContext } from "npm:@supabase/server@^1";

type AdminDb = SupabaseContext["supabaseAdmin"];

const AUTH_EMAIL_DOMAIN = Deno.env.get("AUTH_EMAIL_DOMAIN") ?? "c22.internal";
const BOOTSTRAP_SECRET = Deno.env.get("ADMIN_BOOTSTRAP_SECRET") ?? "";

// Mismo formato que el CHECK profiles_usuario_formato de la migración 01.
const USUARIO_RE = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LEN = 8;

type StaffRol = "seller" | "access";

function json(status: number, data: unknown): Response {
  return Response.json(data, { status });
}

function fail(status: number, code: string, message: string): Response {
  return json(status, { ok: false, code, message });
}

/** Normalización idéntica al trigger trg_normalize_usuario: trim + minúsculas. */
function normalizeUsuario(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Comparación en tiempo constante para el secreto bootstrap. */
function timingSafeEqual(a: string, b: string): boolean {
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  if (ae.length !== be.length) return false;
  let diff = 0;
  for (let i = 0; i < ae.length; i++) diff |= ae[i] ^ be[i];
  return diff === 0;
}

function validateNombre(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const nombre = raw.trim();
  if (nombre.length < 1 || nombre.length > 120) return null;
  return nombre;
}

function validatePassword(raw: unknown): boolean {
  return typeof raw === "string" && raw.length >= MIN_PASSWORD_LEN;
}

async function adminExists(db: AdminDb): Promise<boolean> {
  const { count, error } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("rol", "admin");
  if (error) throw new Error(`PROFILE_CHECK_FAILED: ${error.message}`);
  return (count ?? 0) > 0;
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

async function createAuthUserWithProfile(args: {
  db: AdminDb;
  usuario: string;
  nombre: string;
  password: string;
  rol: "admin" | StaffRol;
  // Respuesta 409 cuando el INSERT de profiles viola unicidad (23505):
  // en bootstrap significa que otro bootstrap ganó la carrera (ADMIN_EXISTS),
  // en modo admin significa usuario duplicado (USUARIO_TAKEN).
  profileConflict: { code: string; message: string };
}): Promise<Response> {
  const db = args.db;
  const email = `${args.usuario}@${AUTH_EMAIL_DOMAIN}`;

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password: args.password,
    email_confirm: true,
    user_metadata: { usuario: args.usuario, debe_cambiar_password: true },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "unknown";
    if (/already (been )?registered|already exists/i.test(msg)) {
      return fail(409, "USUARIO_TAKEN", "El usuario ya existe.");
    }
    return fail(500, "AUTH_CREATE_FAILED", `No se pudo crear el usuario Auth: ${msg}`);
  }

  const authId = created.user.id;
  const { error: profileError } = await db.from("profiles").insert({
    id: authId,
    nombre: args.nombre,
    usuario: args.usuario,
    rol: args.rol,
    activo: true,
  });
  if (profileError) {
    // Rollback: no dejar un Auth user huérfano sin profile.
    await db.auth.admin.deleteUser(authId);
    if (profileError.code === "23505") {
      return fail(409, args.profileConflict.code, args.profileConflict.message);
    }
    return fail(500, "PROFILE_CREATE_FAILED", `No se pudo crear el profile: ${profileError.message}`);
  }

  // Respuesta sin datos sensibles: nunca password ni secretos.
  return json(201, { ok: true, id: authId, usuario: args.usuario, rol: args.rol });
}

async function handleBootstrap(db: AdminDb, body: Record<string, unknown>): Promise<Response> {
  if (!BOOTSTRAP_SECRET) {
    return fail(500, "BOOTSTRAP_DISABLED", "Bootstrap no habilitado en el servidor.");
  }
  const provided = typeof body.bootstrapSecret === "string" ? body.bootstrapSecret : "";
  if (!provided || !timingSafeEqual(provided, BOOTSTRAP_SECRET)) {
    return fail(401, "INVALID_BOOTSTRAP_SECRET", "Secreto bootstrap inválido.");
  }

  try {
    if (await adminExists(db)) {
      return fail(409, "ADMIN_EXISTS", "Ya existe un Admin Principal.");
    }
  } catch (e) {
    return fail(500, "PROFILE_CHECK_FAILED", (e as Error).message);
  }

  const usuario = normalizeUsuario(body.usuario);
  const nombre = validateNombre(body.nombre);
  if (!USUARIO_RE.test(usuario)) {
    return fail(400, "INVALID_USUARIO", "Usuario inválido: 3-32 caracteres, letras minúsculas, números, punto, guion y guion bajo, sin espacios.");
  }
  if (!nombre) {
    return fail(400, "INVALID_NOMBRE", "Nombre inválido (1-120 caracteres).");
  }
  if (!validatePassword(body.password)) {
    return fail(400, "INVALID_PASSWORD", `Contraseña inválida (mínimo ${MIN_PASSWORD_LEN} caracteres).`);
  }

  try {
    if (await usuarioTaken(db, usuario)) {
      return fail(409, "USUARIO_TAKEN", "El usuario ya existe.");
    }
  } catch (e) {
    return fail(500, "PROFILE_CHECK_FAILED", (e as Error).message);
  }

  return await createAuthUserWithProfile({ db, usuario, nombre, password: body.password as string, rol: "admin", profileConflict: { code: "ADMIN_EXISTS", message: "Ya existe un Admin Principal." } });
}

async function handleAdmin(req: Request, db: AdminDb, body: Record<string, unknown>): Promise<Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) {
    return fail(401, "MISSING_TOKEN", "Falta el JWT del admin (Authorization: Bearer).");
  }

  const { data: caller, error: callerError } = await db.auth.getUser(jwt);
  if (callerError || !caller.user) {
    return fail(401, "INVALID_TOKEN", "JWT inválido o expirado.");
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("rol, activo")
    .eq("id", caller.user.id)
    .maybeSingle();
  if (profileError) {
    return fail(500, "PROFILE_CHECK_FAILED", profileError.message);
  }
  if (!profile || profile.rol !== "admin" || profile.activo !== true) {
    return fail(403, "FORBIDDEN", "Solo un Admin Principal activo puede crear usuarios.");
  }

  // Allowlist estricta: nunca 'admin' por este modo.
  const rol = body.rol;
  if (rol !== "seller" && rol !== "access") {
    return fail(400, "INVALID_ROL", "Rol inválido: solo 'seller' o 'access'.");
  }

  const usuario = normalizeUsuario(body.usuario);
  const nombre = validateNombre(body.nombre);
  if (!USUARIO_RE.test(usuario)) {
    return fail(400, "INVALID_USUARIO", "Usuario inválido: 3-32 caracteres, letras minúsculas, números, punto, guion y guion bajo, sin espacios.");
  }
  if (!nombre) {
    return fail(400, "INVALID_NOMBRE", "Nombre inválido (1-120 caracteres).");
  }
  if (!validatePassword(body.password)) {
    return fail(400, "INVALID_PASSWORD", `Contraseña inválida (mínimo ${MIN_PASSWORD_LEN} caracteres).`);
  }

  try {
    if (await usuarioTaken(db, usuario)) {
      return fail(409, "USUARIO_TAKEN", "El usuario ya existe.");
    }
  } catch (e) {
    return fail(500, "PROFILE_CHECK_FAILED", (e as Error).message);
  }

  return await createAuthUserWithProfile({ db, usuario, nombre, password: body.password as string, rol, profileConflict: { code: "USUARIO_TAKEN", message: "El usuario ya existe." } });
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

    // auth: "none" + verify_jwt = false: la autorización vive aquí dentro.
    // ctx.supabaseAdmin bypasa RLS para todas las operaciones privilegiadas.
    const db = ctx.supabaseAdmin;
    if (body.mode === "bootstrap") return await handleBootstrap(db, body);
    if (body.mode === "admin") return await handleAdmin(req, db, body);
    return fail(400, "INVALID_MODE", "Modo inválido: usa 'bootstrap' o 'admin'.");
  }),
};
