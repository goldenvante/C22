import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useColorScheme } from "@/hooks/use-color-scheme";
import type { Scheme } from "./palette";

/**
 * Elección de apariencia del DISPOSITIVO (no del comité):
 * auto (sistema), light u dark. Persiste local, vale para todos los roles
 * (admin, seller, access). Nunca altera los colores del admin: solo superficies
 * y textos neutros.
 */
export type ThemeChoice = "auto" | "light" | "dark";

const STORAGE_KEY = "comite.themeChoice.v1";

function readStored(): ThemeChoice {
  try {
    const raw = (globalThis as unknown as { localStorage?: Storage }).localStorage?.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  } catch {
    // Sin storage: auto.
  }
  return "auto";
}

type ThemeChoiceValue = {
  choice: ThemeChoice;
  /** Esquema efectivo tras resolver auto con el sistema. */
  scheme: Scheme;
  setChoice: (c: ThemeChoice) => void;
};

const ThemeChoiceContext = createContext<ThemeChoiceValue>({
  choice: "auto",
  scheme: "light",
  setChoice: () => undefined,
});

export function ThemeChoiceProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStored);
  const system = useColorScheme();

  useEffect(() => {
    try {
      (globalThis as unknown as { localStorage?: Storage }).localStorage?.setItem(STORAGE_KEY, choice);
    } catch {
      // Persistencia best-effort.
    }
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => setChoiceState(c), []);

  const value = useMemo<ThemeChoiceValue>(() => {
    const scheme: Scheme =
      choice === "auto" ? (system === "dark" ? "dark" : "light") : choice;
    return { choice, scheme, setChoice };
  }, [choice, system, setChoice]);

  return <ThemeChoiceContext.Provider value={value}>{children}</ThemeChoiceContext.Provider>;
}

export function useThemeChoice(): ThemeChoiceValue {
  return useContext(ThemeChoiceContext);
}
