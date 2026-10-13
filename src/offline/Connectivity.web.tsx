import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ConnectivityState, ConnectivityStatus } from "./Connectivity";

/**
 * En web NetInfo mide el alcance con un HEAD a la raíz del origen; GitHub
 * Pages sirve la app en /C22/ y esa raíz responde 404, así que NetInfo reporta
 * "sin internet" aunque la red esté bien. Aquí la conectividad sale de
 * navigator.onLine (sin peticiones) y sólo se queda offline si el navegador
 * mismo avisa de pérdida de red.
 */
const INITIAL: ConnectivityState = { status: "unknown", online: true };

let current: ConnectivityState = INITIAL;
const listeners = new Set<(state: ConnectivityState) => void>();
let monitoring = false;

function fromNavigator(): ConnectivityStatus {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.onLine === false ? "offline" : "online";
}

function publish(status: ConnectivityStatus) {
  if (status === current.status) return;
  current = { status, online: status !== "offline" };
  for (const listener of listeners) listener(current);
}

export function startConnectivityMonitor(): void {
  if (monitoring) return;
  monitoring = true;
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => publish("online"));
  window.addEventListener("offline", () => publish("offline"));
  publish(fromNavigator());
}

export function getConnectivity(): ConnectivityState {
  return current;
}

export function subscribeConnectivity(listener: (state: ConnectivityState) => void): () => void {
  startConnectivityMonitor();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const ConnectivityContext = createContext<ConnectivityState>(INITIAL);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectivityState>(getConnectivity);

  useEffect(() => {
    startConnectivityMonitor();
    return subscribeConnectivity(setState);
  }, []);

  const value = useMemo(() => state, [state]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityState {
  return useContext(ConnectivityContext);
}
