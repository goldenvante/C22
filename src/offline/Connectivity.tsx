import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ConnectivityStatus = "online" | "offline" | "unknown";

export type ConnectivityState = {
  status: ConnectivityStatus;
  /**
   * Sin red = false. "unknown" (antes del primer informe de NetInfo) cuenta
   * como true para conservar el comportamiento actual de la app.
   */
  online: boolean;
};

const INITIAL: ConnectivityState = { status: "unknown", online: true };

let current: ConnectivityState = INITIAL;
const listeners = new Set<(state: ConnectivityState) => void>();
let monitoring = false;

function toStatus(s: NetInfoState): ConnectivityStatus {
  if (s.isConnected === false) return "offline";
  if (s.isInternetReachable === false) return "offline";
  if (s.isConnected === true) return "online";
  return "unknown";
}

function publish(status: ConnectivityStatus) {
  if (status === current.status) return;
  current = { status, online: status !== "offline" };
  for (const listener of listeners) listener(current);
}

/** Monitor de proceso: se levanta una sola vez y no se detiene. */
export function startConnectivityMonitor(): void {
  if (monitoring) return;
  monitoring = true;
  NetInfo.addEventListener((s) => publish(toStatus(s)));
  NetInfo.fetch()
    .then((s) => publish(toStatus(s)))
    .catch(() => undefined);
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
