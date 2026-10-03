import QRCode from "react-native-qrcode-svg";

import { MONARQ } from "@/branding/palette";

/**
 * QR del boleto. Codifica EXACTAMENTE el qr_token (UUID), sin JSON, URL,
 * prefijos, texto adicional ni PII. Tinta MONARQ sobre blanco puro: máximo
 * contraste para lectura fiable con expo-camera.
 */
export function TicketQr({
  qrToken,
  size = 240,
  color = MONARQ.background,
  backgroundColor = MONARQ.white,
  quietZone = 14,
  ecl = "M",
}: {
  qrToken: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  quietZone?: number;
  ecl?: "L" | "M" | "Q" | "H";
}) {
  return (
    <QRCode
      value={qrToken}
      size={size}
      color={color}
      backgroundColor={backgroundColor}
      quietZone={quietZone}
      ecl={ecl}
    />
  );
}
