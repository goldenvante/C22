import * as Crypto from "expo-crypto";

import { readMeta, run } from "./db";

const DEVICE_ID_KEY = "device_id";

let cachedDeviceId: string | null = null;

export function newId(): string {
  return Crypto.randomUUID();
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
  return digest.toLowerCase();
}

/**
 * Identificador anónimo y estable del dispositivo (no es un dato personal ni
 * una credencial). Se genera una sola vez y se conserva en offline_meta.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = await readMeta(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const generated = newId();
  await run(
    "insert into offline_meta (clave, valor) values (?, ?) on conflict(clave) do nothing",
    [DEVICE_ID_KEY, generated],
  );
  const stored = await readMeta(DEVICE_ID_KEY);
  cachedDeviceId = stored ?? generated;
  return cachedDeviceId;
}
