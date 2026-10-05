import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
import type { SupabaseContext } from "npm:@supabase/server@^1";

type AdminDb = SupabaseContext["supabaseAdmin"];

const USUARIO_RE = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GENERIC_LOGIN_ERROR = "Usuario o contraseña incorrectos.";
const GENERIC_REQUEST_ERROR = "No fue posible procesar la solicitud. Verifica el enlace e inténtalo nuevamente.";
const GENERIC_RECOVERY_MESSAGE =
  "Si el correo pertenece al administrador, recibirás un enlace para recuperar tu contraseña.";
const RESET_REDIRECT_URL = Deno.env.get("APP_RESET_REDIRECT_URL") ?? "comitec22://reset-password";

function json(status: number, data: unknown): Response {
  return Response.json(data, { status });
}

function fail(status: number, code: string, message: string): Response {
  return json(status, { ok: false, code, message });
}

function normalizeUsuario(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

type AdminTarget = { id: string; email: string };

async function findActiveAdmin(db: AdminDb, usuario: string): Promise<AdminTarget | null> {
  const { data, error } = await db
    .from("profiles")
    .select("id, roles, activo")
    .eq("usuario", usuario)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const roles = (data as { roles?: unknown }).roles;
  if (!Array.isArray(roles) || !roles.includes("admin")) return null;
  if ((data as { activo?: boolean }).activo !== true) return null;

  const id = (data as { id: string }).id;
  const { data: authData, error: authError } = await db.auth.admin.getUserById(id);
  if (authError || !authData.user) throw new Error(authError?.message ?? "user not found");
  const email = authData.user.email;
  if (!email) return null;
  return { id, email };
}

async function handleLogin(db: AdminDb, body: Record<string, unknown>): Promise<Response> {
  const usuario = normalizeUsuario(body.usuario);
  const password = typeof body.password === "string" ? body.password : "";
  if (!USUARIO_RE.test(usuario) || password.length < MIN_PASSWORD_LEN) {
    return fail(401, "INVALID_LOGIN", GENERIC_LOGIN_ERROR);
  }

  let target: AdminTarget | null = null;
  try {
    target = await findActiveAdmin(db, usuario);
  } catch {
    return fail(500, "LOGIN_FAILED", "No se pudo iniciar sesión. Inténtalo de nuevo.");
  }
  if (!target) return fail(401, "INVALID_LOGIN", GENERIC_LOGIN_ERROR);

  const { data, error } = await db.auth.signInWithPassword({ email: target.email, password });
  if (error || !data.session) {
    const msg = error?.message ?? "";
    if (/invalid login credentials|invalid_credentials/i.test(msg)) {
      return fail(401, "INVALID_LOGIN", GENERIC_LOGIN_ERROR);
    }
    if (/rate limit/i.test(msg)) {
      return fail(429, "RATE_LIMITED", "Demasiados intentos. Espera un momento e inténtalo de nuevo.");
    }
    return fail(500, "LOGIN_FAILED", "No se pudo iniciar sesión. Inténtalo de nuevo.");
  }

  const session = data.session;
  return json(200, {
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
    token_type: session.token_type ?? "bearer",
  });
}

async function handleRecover(db: AdminDb, body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fail(400, "INVALID_EMAIL", "Escribe un correo electrónico válido.");
  }

  const { data, error } = await db.rpc("admin_email_is_admin", { p_email: email });
  if (error) return fail(500, "RECOVERY_CHECK_FAILED", GENERIC_REQUEST_ERROR);
  if (data !== true) return json(200, { ok: true, message: GENERIC_RECOVERY_MESSAGE });

  const { error: sendError } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: RESET_REDIRECT_URL,
  });
  if (sendError) {
    console.error("admin-auth recover send failed", sendError.name, sendError.status);
  }
  return json(200, { ok: true, message: GENERIC_RECOVERY_MESSAGE });
}

type AdminCaller = { userId: string };

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

async function verifyAdminCaller(req: Request, db: AdminDb): Promise<AdminCaller | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) return fail(401, "MISSING_TOKEN", "Falta el JWT del admin (Authorization: Bearer).");

  const { data: caller, error: callerError } = await db.auth.getUser(jwt);
  if (callerError || !caller.user) return fail(401, "INVALID_TOKEN", "JWT inválido o expirado.");

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("roles, activo")
    .eq("id", caller.user.id)
    .maybeSingle();
  if (profileError) return fail(500, "PROFILE_CHECK_FAILED", GENERIC_REQUEST_ERROR);
  const p = profile as { roles?: unknown; activo?: boolean } | null;
  const isProfileAdmin = Array.isArray(p?.roles) && p?.roles.includes("admin");
  if (!p || !isProfileAdmin || p.activo !== true) {
    return fail(403, "FORBIDDEN", "Solo un Admin Principal activo puede gestionar su correo.");
  }
  return { userId: caller.user.id };
}

async function handleGetEmail(req: Request, db: AdminDb): Promise<Response> {
  const caller = await verifyAdminCaller(req, db);
  if (isResponse(caller)) return caller;
  const { data, error } = await db.auth.admin.getUserById(caller.userId);
  if (error || !data.user) return fail(404, "USER_NOT_FOUND", GENERIC_REQUEST_ERROR);
  return json(200, { ok: true, email: data.user.email ?? "" });
}

async function handleSetEmail(req: Request, db: AdminDb, body: Record<string, unknown>): Promise<Response> {
  const caller = await verifyAdminCaller(req, db);
  if (isResponse(caller)) return caller;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fail(400, "INVALID_EMAIL", "Escribe un correo electrónico válido.");
  }

  const { error } = await db.auth.admin.updateUserById(caller.userId, {
    email,
    email_confirm: true,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/already (been )?registered|already exists|email_exists/i.test(msg)) {
      return fail(409, "EMAIL_TAKEN", "Ese correo ya está en uso por otra cuenta.");
    }
    if (/email_address_invalid|invalid email/i.test(msg)) {
      return fail(
        400,
        "INVALID_EMAIL",
        "Ese correo no puede recibir mensajes. Usa un correo personal (por ejemplo @gmail.com).",
      );
    }
    return fail(500, "EMAIL_UPDATE_FAILED", "No se pudo guardar el correo. Inténtalo de nuevo.");
  }

  return json(200, { ok: true, email });
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
    if (body.mode === "login") return await handleLogin(db, body);
    if (body.mode === "recover") return await handleRecover(db, body);
    if (body.mode === "get-email") return await handleGetEmail(req, db);
    if (body.mode === "set-email") return await handleSetEmail(req, db, body);
    return fail(400, "INVALID_MODE", "Modo inválido: usa 'login', 'recover', 'get-email' o 'set-email'.");
  }),
};
