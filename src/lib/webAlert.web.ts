import { Alert } from "react-native";

type WebAlertButton = { text?: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" };

let installed = false;
let active: HTMLElement | null = null;

function dismiss(): void {
  active?.remove();
  active = null;
}

function show(title: string, message?: string, buttons?: WebAlertButton[]): void {
  if (typeof document === "undefined") return;
  dismiss();
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.style.cssText =
    "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,420px);" +
    "background:#171310;color:#f7f3ee;border:1px solid #5b4a33;border-radius:12px;padding:14px 16px;" +
    "box-shadow:0 10px 40px rgba(0,0,0,.5);font:14px/1.45 system-ui,-apple-system,sans-serif;";

  const titleEl = document.createElement("div");
  titleEl.textContent = title;
  titleEl.style.cssText = "font-weight:600;margin-bottom:4px;";
  box.appendChild(titleEl);

  if (message) {
    const msg = document.createElement("div");
    msg.textContent = message;
    msg.style.cssText = "opacity:.85;white-space:pre-wrap;overflow-wrap:anywhere;";
    box.appendChild(msg);
  }

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;";
  const list = buttons && buttons.length > 0 ? buttons : [{ text: "OK" }];
  for (const b of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = b.text || "OK";
    const primary = b.style !== "cancel";
    btn.style.cssText = primary
      ? "background:#c9a227;color:#171310;border:0;border-radius:8px;padding:7px 14px;font:inherit;font-weight:600;cursor:pointer;"
      : "background:transparent;color:#f7f3ee;border:1px solid #6b5942;border-radius:8px;padding:7px 14px;font:inherit;cursor:pointer;";
    btn.onclick = () => {
      dismiss();
      b.onPress?.();
    };
    row.appendChild(btn);
  }
  box.appendChild(row);

  document.body.appendChild(box);
  active = box;
  setTimeout(dismiss, buttons && buttons.length > 0 ? 8000 : 3500);
}

/** react-native-web no implementa Alert: se sustituye por un aviso visible. */
export function installWebAlert(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  (Alert as unknown as { alert: (title?: string, message?: string, buttons?: WebAlertButton[]) => void }).alert =
    (title, message, buttons) => show(title ?? "", message, buttons);
}
