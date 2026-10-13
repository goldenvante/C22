import { supabase } from "@/lib/supabase";

export type AccessCodeResult = "ok" | "invalido" | "vencido";

export async function isGateOpen(): Promise<boolean> {
  const { data, error } = await supabase.rpc("gate_abierto");
  if (error) throw new Error(error.message);
  return data === true;
}

export async function verifyAccessCode(codigo: string): Promise<AccessCodeResult> {
  const { data, error } = await supabase.rpc("verificar_codigo_acceso", {
    p_codigo: codigo,
  });
  if (error) throw new Error(error.message);
  if (data === "ok" || data === "invalido" || data === "vencido") return data;
  return "invalido";
}
