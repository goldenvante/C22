type PermissionStatus = "granted" | "denied" | "undetermined";

function download(uri: string, filename: string): void {
  const link = document.createElement("a");
  link.href = uri;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export const MediaLibrary = {
  async requestPermissionsAsync(): Promise<{ status: PermissionStatus }> {
    return { status: "granted" };
  },
  Asset: {
    async create(uri: string): Promise<unknown> {
      download(uri, "boleto.png");
      return [];
    },
  },
};

export const Sharing = {
  async isAvailableAsync(): Promise<boolean> {
    return false;
  },
  async shareAsync(): Promise<string> {
    return "dismissedAction";
  },
};
