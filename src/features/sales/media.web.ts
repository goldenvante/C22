type PermissionStatus = "granted" | "denied" | "undetermined";

async function toBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error("No se pudo leer la imagen capturada.");
  return res.blob();
}

async function download(uri: string, filename: string): Promise<void> {
  const url = URL.createObjectURL(await toBlob(uri));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export const MediaLibrary = {
  async requestPermissionsAsync(): Promise<{ status: PermissionStatus }> {
    return { status: "granted" };
  },
  Asset: {
    async create(uri: string): Promise<unknown> {
      await download(uri, "boleto.png");
      return [];
    },
  },
};

export const Sharing = {
  async isAvailableAsync(): Promise<boolean> {
    return true;
  },
  async shareAsync(
    uri: string,
    options: { mimeType?: string; dialogTitle?: string } = {},
  ): Promise<string> {
    const filename = options.mimeType === "application/pdf" ? "reporte.pdf" : "boleto.png";
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<string>;
    };
    if (nav.share) {
      try {
        const file = new File([await toBlob(uri)], filename, {
          type: options.mimeType ?? "image/png",
        });
        if (nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file] });
          return "sharedAction";
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return "dismissedAction";
      }
    }
    await download(uri, filename);
    return "completedAction";
  },
};
