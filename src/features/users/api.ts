import { supabase, type Profile, type ProfileRole } from "@/lib/supabase";

export type StaffRole = Extract<ProfileRole, "seller" | "access">;

export const STAFF_ROLES: StaffRole[] = ["seller", "access"];

export const ROL_LABEL: Record<ProfileRole, string> = {
  admin: "Administrador",
  seller: "Vendedor",
  access: "Control de acceso",
};

const USUARIO_RE = /^[a-z0-9._-]{3,32}$/;

/** Lista todos los perfiles: activos primero, luego por rol y nombre. */
export async function listStaff(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,usuario,nombre,rol,activo")
    .order("activo", { ascending: false })
    .order("rol")
    .order("nombre");
  if (error) throw new Error(error.message || "No se pudieron cargar los usuarios.");
  return (data ?? []) as Profile[];
}

/** Activa o desactiva un usuario. Solo cambia `activo`. */
export async function setActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("profiles").update({ activo }).eq("id", id);
  if (error) throw new Error(error.message || "No se pudo actualizar el usuario.");
}

/** Cambia el nombre visible. Nunca toca usuario ni rol. */
export async function updateNombre(id: string, nombre: string): Promise<void> {
  const name = nombre.trim();
  if (name.length < 1 || name.length > 120) {
    throw new Error("El nombre debe tener entre 1 y 120 caracteres.");
  }
  const { error } = await supabase.from("profiles").update({ nombre: name }).eq("id", id);
  if (error) throw new Error(error.message || "No se pudo guardar el nombre.");
}

export type CreateStaffInput = {
  usuario: string;
  nombre: string;
  password: string;
  rol: StaffRole;
};

export type CreatedStaff = {
  id: string;
  usuario: string;
  rol: StaffRole;
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
 * Crea vendedor o acceso vía la Edge Function (única vía; sin service_role
 * en el cliente). La Function asigna la temporal y marca el cambio obligatorio.
 */
export async function createStaff(input: CreateStaffInput): Promise<CreatedStaff> {
  const usuario = input.usuario.trim().toLowerCase();
  const nombre = input.nombre.trim();
  if (!USUARIO_RE.test(usuario)) {
    throw new Error("Usuario inválido: 3-32 caracteres, letras minúsculas, números, punto, guion o guion bajo.");
  }
  if (nombre.length < 1 || nombre.length > 120) {
    throw new Error("El nombre debe tener entre 1 y 120 caracteres.");
  }
  if (input.password.length < 8) {
    throw new Error("La contraseña temporal debe tener al menos 8 caracteres.");
  }
  if (input.rol !== "seller" && input.rol !== "access") {
    throw new Error("Rol inválido: solo Vendedor o Control de acceso.");
  }
  const { data, error } = await supabase.functions.invoke("admin-create-user", {
    body: { mode: "admin", usuario, nombre, password: input.password, rol: input.rol },
  });
  if (error) throw await mapFunctionError(error);
  const created = data as { ok?: boolean; id?: string; usuario?: string; rol?: StaffRole };
  if (!created?.id) throw new Error("Respuesta inesperada del servidor.");
  return { id: created.id, usuario: created.usuario ?? usuario, rol: created.rol ?? input.rol };
}
