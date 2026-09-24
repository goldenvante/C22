import { hasRole, supabase, type Profile, type ProfileRole } from "@/lib/supabase";

export type StaffRole = Extract<ProfileRole, "seller" | "access">;

export const STAFF_ROLES: StaffRole[] = ["seller", "access"];

export const ROL_LABEL: Record<ProfileRole, string> = {
  admin: "Administrador",
  seller: "Vendedor",
  access: "Control de acceso",
};

/** Etiqueta de los roles de un profile (1-2 roles). */
export function profileRolesLabel(profile: Pick<Profile, "roles">): string {
  const parts = (profile.roles ?? []).map((r) => ROL_LABEL[r] ?? r);
  return parts.length > 0 ? parts.join(" + ") : "Sin rol";
}

export function isAdmin(profile: Profile | null | undefined): boolean {
  return hasRole(profile, "admin");
}

const USUARIO_RE = /^[a-z0-9._-]{3,32}$/;

/** Lista todos los perfiles del comité: activos primero, luego por nombre. */
export async function listStaff(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,usuario,nombre,roles,activo,committee_id")
    .order("activo", { ascending: false })
    .order("nombre");
  if (error) throw new Error(error.message || "No se pudieron cargar los usuarios.");
  return (data ?? []) as Profile[];
}

/** Activa o desactiva un usuario. Solo cambia `activo`. */
export async function setActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("profiles").update({ activo }).eq("id", id);
  if (error) throw new Error(error.message || "No se pudo actualizar el usuario.");
}

/** Cambia el nombre visible. Nunca toca usuario ni roles. */
export async function updateNombre(id: string, nombre: string): Promise<void> {
  const name = nombre.trim();
  if (name.length < 1 || name.length > 120) {
    throw new Error("El nombre debe tener entre 1 y 120 caracteres.");
  }
  const { error } = await supabase.from("profiles").update({ nombre: name }).eq("id", id);
  if (error) throw new Error(error.message || "No se pudo guardar el nombre.");
}

/**
 * Cambia los roles de trabajo (1-2: vendedor y/o acceso). Nunca admin por
 * esta vía; el trigger bloquea escalamientos no autorizados.
 */
export async function updateRoles(id: string, roles: StaffRole[]): Promise<void> {
  const clean = [...new Set(roles)].filter((r): r is StaffRole => r === "seller" || r === "access");
  if (clean.length < 1 || clean.length > 2) {
    throw new Error("Elige al menos un rol: Vendedor y/o Control de acceso.");
  }
  const { error } = await supabase.from("profiles").update({ roles: clean }).eq("id", id);
  if (error) throw new Error(error.message || "No se pudieron guardar los roles.");
}

export type CreateStaffInput = {
  usuario: string;
  nombre: string;
  password: string;
  /** 1-2 roles: solo vendedor, solo acceso, o ambos. */
  roles: StaffRole[];
};

export type CreatedStaff = {
  id: string;
  usuario: string;
  roles: StaffRole[];
};

async function mapFunctionError(error: unknown): Promise<Error> {
  const e = error as { status?: number; context?: unknown };
  const status = typeof e?.status === "number" ? e.status : 0;
  if (status === 409 || status === 400) {
    try {
      const body = (await (e.context as Response).json()) as {
        code?: string;
        message?: string;
      };
      if (body?.code === "USUARIO_TAKEN") {
        return new Error("El usuario ya existe. Elige otro nombre de usuario.");
      }
      if (body?.message) return new Error(body.message);
    } catch {
      // Sin cuerpo legible: mensaje según estado HTTP.
    }
    if (status === 409) return new Error("El usuario ya existe. Elige otro nombre de usuario.");
    return new Error("Revisa los datos e inténtalo de nuevo.");
  }
  if (status === 401 || status === 403) {
    return new Error("Tu sesión expiró o no tienes permiso. Inicia sesión de nuevo.");
  }
  return new Error("No se pudo crear el usuario. Inténtalo de nuevo.");
}

/**
 * Crea vendedor, acceso o ambos vía la Edge Function (única vía; sin
 * service_role en el cliente). La Function asigna la temporal y marca el
 * cambio obligatorio.
 */
export async function createStaff(input: CreateStaffInput): Promise<CreatedStaff> {
  const usuario = input.usuario.trim().toLowerCase();
  const nombre = input.nombre.trim();
  const roles = [...new Set(input.roles)].filter((r): r is StaffRole => r === "seller" || r === "access");
  if (!USUARIO_RE.test(usuario)) {
    throw new Error("Usuario inválido: 3-32 caracteres, letras minúsculas, números, punto, guion o guion bajo.");
  }
  if (nombre.length < 1 || nombre.length > 120) {
    throw new Error("El nombre debe tener entre 1 y 120 caracteres.");
  }
  if (input.password.length < 8) {
    throw new Error("La contraseña temporal debe tener al menos 8 caracteres.");
  }
  if (roles.length < 1 || roles.length > 2) {
    throw new Error("Elige al menos un rol: Vendedor y/o Control de acceso.");
  }
  const { data, error } = await supabase.functions.invoke("admin-create-user", {
    body: { mode: "admin", usuario, nombre, password: input.password, roles },
  });
  if (error) throw await mapFunctionError(error);
  const created = data as { ok?: boolean; id?: string; usuario?: string; roles?: StaffRole[] };
  if (!created?.id) throw new Error("Respuesta inesperada del servidor.");
  return { id: created.id, usuario: created.usuario ?? usuario, roles: created.roles ?? roles };
}
