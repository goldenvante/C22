import html2canvas from "html2canvas-pro";

type CaptureOptions = {
  format?: "jpg" | "png" | "webm" | "raw";
  quality?: number;
  result?: "tmpfile" | "base64" | "data-uri" | "zip-base64";
  width?: number;
  height?: number;
  snapshotContentContainer?: boolean;
  fileName?: string;
};

/**
 * html2canvas 1.4.1 (la que usa react-native-view-shot) nunca resuelve en
 * Safari: el iframe clonado no dispara onload (html2canvas #2864/#2909). Se
 * captura con html2canvas-pro, su fork con ese arreglo, más un tope de tiempo
 * para no dejar el botón girando sin fin.
 */
const CAPTURE_TIMEOUT_MS = 15_000;
const TIMEOUT_MESSAGE =
  "Safari no terminó de generar la imagen. Intenta de nuevo o usa Chrome/Firefox.";

function elementOf(view: unknown): HTMLElement {
  let current: unknown = view;
  for (let step = 0; step < 4 && current != null; step += 1) {
    if (current instanceof HTMLElement) return current;
    const holder = current as { current?: unknown; getNode?: () => unknown };
    if (holder.current != null) {
      current = holder.current;
      continue;
    }
    if (typeof holder.getNode === "function") {
      current = holder.getNode();
      continue;
    }
    break;
  }
  if (typeof current === "number") {
    const node = document.querySelector(`[data-react-native-tag="${current}"]`);
    if (node) return node as HTMLElement;
  }
  throw new Error("No se encontró la tarjeta del boleto para capturarla.");
}

function withTimeout<T>(task: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), CAPTURE_TIMEOUT_MS);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function captureRef(view: unknown, options: CaptureOptions = {}): Promise<string> {
  const element = elementOf(view);
  const rendered = await withTimeout(html2canvas(element, { useCORS: true, logging: false }));
  let output = rendered;
  if (options.width && options.height) {
    const resized = document.createElement("canvas");
    resized.width = options.width;
    resized.height = options.height;
    const ctx = resized.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la imagen del boleto.");
    ctx.drawImage(rendered, 0, 0, options.width, options.height);
    output = resized;
  }
  const mime = options.format === "jpg" ? "image/jpeg" : "image/png";
  return output.toDataURL(mime, options.quality);
}

export async function captureScreen(options: CaptureOptions = {}): Promise<string> {
  return captureRef(document.body, options);
}

export function releaseCapture(_uri: string): void {}
