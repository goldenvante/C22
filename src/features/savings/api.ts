import { supabase } from "@/lib/supabase";

export type SavingsGoal = {
  id: string;
  committee_id: string;
  nombre: string;
  meta: number;
  activa: boolean;
  created_at: string;
};

export type SavingsIncome = {
  id: string;
  goal_id: string;
  concepto: string;
  monto: number;
  registrado_nombre: string | null;
  created_at: string;
};

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatMoney(n: number): string {
  return mxn.format(Number.isFinite(n) ? n : 0);
}

function toGoal(row: Record<string, unknown>): SavingsGoal {
  return {
    id: row.id as string,
    committee_id: row.committee_id as string,
    nombre: row.nombre as string,
    meta: Number(row.meta),
    activa: Boolean(row.activa),
    created_at: row.created_at as string,
  };
}

function toIncome(row: Record<string, unknown>): SavingsIncome {
  return {
    id: row.id as string,
    goal_id: row.goal_id as string,
    concepto: row.concepto as string,
    monto: Number(row.monto),
    registrado_nombre: (row.registrado_nombre as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

/** Meta activa del comité (una sola; null si aún no hay). */
export async function getActiveGoal(committeeId: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("committee_id", committeeId)
    .eq("activa", true)
    .maybeSingle();
  if (error) throw new Error(error.message || "No se pudo cargar la meta.");
  return data ? toGoal(data as Record<string, unknown>) : null;
}

/** Crea la meta (solo admin; el trigger desactiva la anterior si hubiera). */
export async function createGoal(committeeId: string, nombre: string, meta: number): Promise<SavingsGoal> {
  const name = nombre.trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error("Nombre de la meta inválido (2-80 caracteres).");
  }
  if (!Number.isFinite(meta) || meta <= 0) {
    throw new Error("La meta debe ser mayor a $0.");
  }
  const { data, error } = await supabase
    .from("savings_goals")
    .insert({ committee_id: committeeId, nombre: name, meta, activa: true })
    .select("*")
    .single();
  if (error) throw new Error(error.message || "No se pudo crear la meta.");
  return toGoal(data as Record<string, unknown>);
}

/** Edita nombre/meta de la meta activa (solo admin). */
export async function updateGoal(id: string, nombre: string, meta: number): Promise<SavingsGoal> {
  const name = nombre.trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error("Nombre de la meta inválido (2-80 caracteres).");
  }
  if (!Number.isFinite(meta) || meta <= 0) {
    throw new Error("La meta debe ser mayor a $0.");
  }
  const { data, error } = await supabase
    .from("savings_goals")
    .update({ nombre: name, meta })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message || "No se pudo guardar la meta.");
  return toGoal(data as Record<string, unknown>);
}

/** Ingresos de la meta, recientes primero. */
export async function listIncomes(goalId: string): Promise<SavingsIncome[]> {
  const { data, error } = await supabase
    .from("savings_incomes")
    .select("id,goal_id,concepto,monto,registrado_nombre,created_at")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "No se pudieron cargar los ingresos.");
  return (data as Record<string, unknown>[]).map(toIncome);
}

/**
 * Agrega un ingreso (cualquier miembro; queda auditado quién y cuándo).
 * Ej. concepto "Bazar septiembre", monto 10000.
 */
export async function addIncome(goalId: string, concepto: string, monto: number): Promise<SavingsIncome> {
  const name = concepto.trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error("Describe el ingreso (1-80 caracteres). Ej. Bazar septiembre.");
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error("El ingreso debe ser mayor a $0.");
  }
  const { data, error } = await supabase
    .from("savings_incomes")
    .insert({ goal_id: goalId, concepto: name, monto })
    .select("id,goal_id,concepto,monto,registrado_nombre,created_at")
    .single();
  if (error) throw new Error(error.message || "No se pudo registrar el ingreso.");
  return toIncome(data as Record<string, unknown>);
}

export type SavingsProgress = {
  recaudado: number;
  restante: number;
  porcentaje: number;
  superada: boolean;
};

/** Recaudado = suma de ingresos; restante = meta − recaudado. */
export function computeProgress(goal: SavingsGoal, incomes: SavingsIncome[]): SavingsProgress {
  const recaudado = incomes.reduce((acc, i) => acc + Number(i.monto || 0), 0);
  const restante = Number(goal.meta) - recaudado;
  const porcentaje = goal.meta > 0 ? Math.max(0, Math.min(100, (recaudado / Number(goal.meta)) * 100)) : 0;
  return { recaudado, restante, porcentaje, superada: restante <= 0 };
}

export function formatFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}
