import { AUTH_EMAIL_DOMAIN, supabase } from "@/lib/supabase";

const USUARIO_RE = /^[a-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const GENERIC_REQUEST_ERROR =
  "No fue posible procesar la solicitud. Verifica el enlace e inténtalo nuevamente.";

async function readInvokeError(error: unknown): Promise<Error> {
  const e = error as { status?: number; context?: unknown };
  const status = typeof e?.status === "number" ? e.status : 0;
  try {
    const body = (await (e.context as Response).json()) as { code?: string; message?: string };
    if (body?.code === "INVALID_LOGIN") return new Error("Usuario o contraseña incorrectos.");
    if (body?.code === "EMAIL_TAKEN") return new Error("Ese correo ya está en uso por otra cuenta.");
    if (body?.message) return new Error(body.message);
  } catch {}
  if (status === 401) return new Error("Usuario o contraseña incorrectos.");
  if (status === 403) return new Error("Tu sesión expiró o no tienes permiso. Inicia sesión de nuevo.");
  if (status === 400 || status === 404) return new Error(GENERIC_REQUEST_ERROR);
  if (status === 429) return new Error("Demasiados intentos. Espera un momento e inténtalo de nuevo.");
  if (status === 0) return new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  return new Error(GENERIC_REQUEST_ERROR);
}

export async function loginIsAdmin(usuario: string): Promise<boolean> {
  const u = usuario.trim().toLowerCase();
  if (!USUARIO_RE.test(u)) return false;
  const { data, error } = await supabase.rpc("login_is_admin", { p_usuario: u });
  if (error || typeof data !== "boolean") return false;
  return data;
}

export async function adminLogin(usuario: string, password: string): Promise<void> {
  const u = usuario.trim().toLowerCase();
  if (!USUARIO_RE.test(u)) throw new Error("Usuario inválido.");
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");

  const { data, error } = await supabase.functions.invoke("admin-auth", {
    body: { mode: "login", usuario: u, password },
  });
  if (error) throw await readInvokeError(error);

  const payload = data as {
    ok?: boolean;
    access_token?: string;
    refresh_token?: string;
  };
  if (!payload?.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error(GENERIC_REQUEST_ERROR);
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });
  if (sessionError) throw new Error("No se pudo iniciar sesión. Inténtalo de nuevo.");
}

function assertReceivableEmail(clean: string): void {
  if (!EMAIL_RE.test(clean) || clean.length > 254) {
    throw new Error("Escribe un correo electrónico válido.");
  }
  if (clean.endsWith(`@${AUTH_EMAIL_DOMAIN}`)) {
    throw new Error(
      "Ese correo no puede recibir mensajes. Usa un correo personal (por ejemplo @gmail.com).",
    );
  }
}

export async function requestRecovery(email: string): Promise<string> {
  const clean = email.trim().toLowerCase();
  assertReceivableEmail(clean);
  const { data, error } = await supabase.functions.invoke("admin-auth", {
    body: { mode: "recover", email: clean },
  });
  if (error) throw await readInvokeError(error);
  const payload = data as { ok?: boolean; message?: string };
  if (!payload?.ok) throw new Error(GENERIC_REQUEST_ERROR);
  return payload.message ?? GENERIC_REQUEST_ERROR;
}

export async function getMyEmail(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("admin-auth", {
    body: { mode: "get-email" },
  });
  if (error) throw await readInvokeError(error);
  const payload = data as { ok?: boolean; email?: string };
  if (!payload?.ok) throw new Error(GENERIC_REQUEST_ERROR);
  return typeof payload.email === "string" ? payload.email : "";
}

export async function setMyEmail(email: string): Promise<string> {
  const clean = email.trim().toLowerCase();
  assertReceivableEmail(clean);
  const { data, error } = await supabase.functions.invoke("admin-auth", {
    body: { mode: "set-email", email: clean },
  });
  if (error) throw await readInvokeError(error);
  const payload = data as { ok?: boolean; email?: string };
  if (!payload?.ok) throw new Error(GENERIC_REQUEST_ERROR);
  return typeof payload.email === "string" ? payload.email : clean;
}
