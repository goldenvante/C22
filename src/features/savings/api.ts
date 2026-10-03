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
  /** Evento que originó el ingreso (cierre) o null (ingreso manual). */
  event_id: string | null;
};

export type SavingsInvestment = {
  id: string;
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
    event_id: (row.event_id as string | null) ?? null,
  };
}

function toInvestment(row: Record<string, unknown>): SavingsInvestment {
  return {
    id: row.id as string,
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

/**
 * Ingresos del comité, recientes primero. Sin filtro de meta: RLS ya acota al
 * comité, así "recaudado" existe aunque aún no haya meta activa.
 */
export async function listIncomes(): Promise<SavingsIncome[]> {
  const { data, error } = await supabase
    .from("savings_incomes")
    .select("id,goal_id,concepto,monto,registrado_nombre,created_at,event_id")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "No se pudieron cargar los ingresos.");
  return (data as Record<string, unknown>[]).map(toIncome);
}

/** Inversiones del comité (solo suma; sin UPDATE/DELETE en la base). */
export async function listInvestments(): Promise<SavingsInvestment[]> {
  const { data, error } = await supabase
    .from("savings_investments")
    .select("id,concepto,monto,registrado_nombre,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "No se pudieron cargar las inversiones.");
  return (data as Record<string, unknown>[]).map(toInvestment);
}

/**
 * Registra una inversión (solo admin; RLS lo exige). Queda auditado quién y
 * cuándo y no se puede modificar ni borrar.
 */
export async function addInvestment(concepto: string, monto: number): Promise<SavingsInvestment> {
  const name = concepto.trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error("Describe la inversión (1-80 caracteres). Ej. Renta de salón.");
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error("La inversión debe ser mayor a $0.");
  }
  const { data, error } = await supabase
    .from("savings_investments")
    .insert({ concepto: name, monto })
    .select("id,concepto,monto,registrado_nombre,created_at")
    .single();
  if (error) throw new Error(error.message || "No se pudo registrar la inversión.");
  return toInvestment(data as Record<string, unknown>);
}

export type PostEventSavingsResult = {
  /** Monto transferido (o ya registrado) a Meta. */
  monto: number;
  /** true si el evento ya se había enviado antes (idempotente). */
  yaExistia: boolean;
};

/**
 * Envía lo recaudado por un evento a Meta. Idempotente: si ya se envió
 * devuelve el mismo monto sin duplicarlo. Camino manual (el automático es el
 * trigger de cierre de evento).
 */
export async function postEventSavings(eventId: string): Promise<PostEventSavingsResult> {
  const { data, error } = await supabase.rpc("post_event_savings", {
    p_event_id: eventId,
  });
  if (error) throw new Error(error.message || "No se pudo enviar a Meta.");
  const row = Array.isArray(data) ? (data as Record<string, unknown>[])[0] : undefined;
  if (!row) return { monto: 0, yaExistia: false };
  return { monto: Number(row.monto ?? 0), yaExistia: Boolean(row.ya_existia) };
}

/**
 * Agrega un ingreso (solo admin del comité; RLS lo exige; queda auditado quién
 * y cuándo). Ej. concepto "Bazar septiembre", monto 10000.
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
    .select("id,goal_id,concepto,monto,registrado_nombre,created_at,event_id")
    .single();
  if (error) {
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      throw new Error("Solo el administrador puede registrar ingresos.");
    }
    throw new Error(error.message || "No se pudo registrar el ingreso.");
  }
  return toIncome(data as Record<string, unknown>);
}

export type SavingsProgress = {
  /** Lo que queda en Meta (recaudado − inversión). */
  disponible: number;
  restante: number;
  porcentaje: number;
  superada: boolean;
};

/**
 * Progreso contra la meta usando lo DISPONIBLE: lo ya invertido no cuenta
 * como ahorro. Sin meta activa no hay progreso (el recaudado se muestra solo).
 */
export function computeProgress(goal: SavingsGoal, totals: SavingsTotals): SavingsProgress {
  const disponible = totals.disponible;
  const restante = Number(goal.meta) - disponible;
  const porcentaje =
    goal.meta > 0 ? Math.max(0, Math.min(100, (disponible / Number(goal.meta)) * 100)) : 0;
  return { disponible, restante, porcentaje, superada: restante <= 0 };
}

export type SavingsTotals = {
  recaudado: number;
  inversion: number;
  disponible: number;
};

/**
 * Recaudado = suma de ingresos (cierre de eventos + manuales, aunque no haya
 * meta activa). Inversión = suma de la bitácora de egresos. Disponible = lo
 * que queda en Meta.
 */
export function computeTotals(
  incomes: SavingsIncome[],
  investments: SavingsInvestment[],
): SavingsTotals {
  const recaudado = incomes.reduce((acc, i) => acc + Number(i.monto || 0), 0);
  const inversion = investments.reduce((acc, i) => acc + Number(i.monto || 0), 0);
  return { recaudado, inversion, disponible: recaudado - inversion };
}

export function formatFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}
