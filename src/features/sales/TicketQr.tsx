import QRCode from "react-native-qrcode-svg";

import { C22 } from "@/constants/theme";

/**
 * QR del boleto. Codifica EXACTAMENTE el qr_token (UUID), sin JSON, URL,
 * prefijos, texto adicional ni PII. Grande, con zona de silencio y fondo
 * claro para lectura fiable con expo-camera.
 */
export function TicketQr({
  qrToken,
  size = 240,
  color = C22.ink,
  backgroundColor = C22.creamLight,
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
