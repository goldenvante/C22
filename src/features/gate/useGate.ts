import { useEffect, useState } from "react";

import { isGateOpen } from "./api";
import { isGateUnlocked, markGateUnlocked, onGateChange } from "./localFlag";

/**
 * null = aún no se resuelve. false = falta el código (nadie ve pantalla
 * alguna hasta que pase por /access-code). true = desbloqueado.
 *
 * Si ningún comité tiene código guardado todavía, el gate está apagado y
 * la app arranca sola: así se crea el primer comité desde /setup.
 */
export function useGate(): boolean | null {
  const [estado, setEstado] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let ok = await isGateUnlocked().catch(() => false);
      if (!ok) {
        try {
          if (await isGateOpen()) {
            await markGateUnlocked();
            ok = true;
          }
        } catch {
          // Sin red no se puede comprobar: se queda cerrado y se pide código.
        }
      }
      if (alive) setEstado(ok);
    })();
    const off = onGateChange((ok) => {
      if (alive) setEstado(ok);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return estado;
}
