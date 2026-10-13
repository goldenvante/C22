import { forwardRef, useState } from "react";
import { type LayoutChangeEvent, Text, useWindowDimensions, View } from "react-native";
import { ImageBackground } from "expo-image";

import { MONARQ, readableOn } from "@/branding/palette";
import { clampTicketTitleSize, TICKET_FONT_SYSTEM, ticketFont } from "@/constants/type";
import { TicketQr } from "@/features/sales/TicketQr";
import { formatFolio, type TicketEstado } from "@/features/sales/types";

/** Identidad MONARQ: negro profundo, tinta clara y acento dorado. */
const ACCENT = MONARQ.accent;
const INK_TEXT = MONARQ.textPrimary;
const PAPER = MONARQ.white;
const DANGER = "#A94452";
const DANGER_INK = readableOn(DANGER);
const ACCENT_INK = readableOn(ACCENT);

/**
 * Datos mínimos para el boleto. SaleTicket es asignable (tiene estos campos
 * más otros que aquí se ignoran: fase, precio, método, etc.).
 */
export type BoletoData = {
  id: string;
  folio: number;
  comprador_nombre: string;
  estado: TicketEstado;
  /** True = boleto gratis (sin fase visible, precio 0). */
  es_cortesia: boolean;
  qr_token: string;
  evento: {
    nombre: string;
    codigo: string;
    fecha: string | null;
    hora: string | null;
    lugar: string | null;
    imagen_url: string | null;
    mapas_url: string | null;
  } | null;
};

const MESES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const MESES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function splitFecha(fecha: string | null): { y: string; m: string; d: string } | null {
  const parts = (fecha ?? "").split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function fechaCorta(fecha: string | null): string | null {
  const p = splitFecha(fecha);
  if (!p) return null;
  const idx = Number(p.m) - 1;
  const mes = MESES_CORTO[idx] ?? p.m;
  return `${Number(p.d)} . ${mes} . ${p.y}`;
}

function fechaLarga(fecha: string | null): string | null {
  const p = splitFecha(fecha);
  if (!p) return null;
  const idx = Number(p.m) - 1;
  const mes = MESES_LARGO[idx] ?? p.m;
  return `${Number(p.d)} de ${mes} de ${p.y}`;
}

function horaCorta(hora: string | null): string | null {
  if (!hora) return null;
  const hhmm = hora.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? `${hhmm} hrs` : null;
}

function Corner({ style }: { style: object }) {
  return <View pointerEvents="none" style={[{ position: "absolute", width: 26, height: 26 }, style]} />;
}

/**
 * Boleto digital premium (réplica de referencia): foto full-bleed con scrim
 * integral, marca, título, fecha, QR central con marcas de visor sobre
 * superficie clara, folio, comprador, divisor e info inferior.
 * Sin fase, precio, método ni datos técnicos. Con ref para captura.
 */
export const BoletoCard = forwardRef<
  View,
  {
    sale: BoletoData;
    committeeName?: string | null;
    committeeFacultad?: string | null;
    /** Familia del título: key de TICKET_FONTS (falta -> sistema). */
    committeeTitleFont?: string | null;
    /** Tamaño del título en pt (20-48); falta -> 36. */
    committeeTitleSize?: number | null;
  }
>(function BoletoCard(
  { sale, committeeName, committeeFacultad, committeeTitleFont, committeeTitleSize },
  ref,
) {
  const { width } = useWindowDimensions();
  /**
   * Todo el diseño se deriva del ancho REAL de la tarjeta (se llena el
   * contenedor con un tope de 420), nunca del ancho de la ventana: así el
   * boleto se adapta solo a pantallas angostas, normales y tabletas sin
   * cortar el título ni montar la fecha sobre el QR.
   */
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  const cardWidth = boxWidth ?? Math.min(420, Math.max(240, width - 32));
  const narrow = cardWidth < 340;
  const qrSize = Math.round(Math.min(170, Math.max(118, cardWidth * 0.4)));
  const font = ticketFont(committeeTitleFont);
  // Con familia propia hay que omitir fontWeight: el peso vive en el nombre.
  const fontFamily = font.key === TICKET_FONT_SYSTEM ? undefined : font.key;
  const chosenTitle = clampTicketTitleSize(committeeTitleSize) * font.optical;
  const titleSize = Math.round(Math.min(chosenTitle, Math.max(22, cardWidth / 9.5)));
  const infoPadX = narrow ? 20 : 40;
  const headPadX = narrow ? 16 : 24;
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== boxWidth) setBoxWidth(w);
  };
  const cancelled = sale.estado === "CANCELADO";
  const fecha = fechaCorta(sale.evento?.fecha ?? null);
  const fechaLong = fechaLarga(sale.evento?.fecha ?? null);
  const hora = horaCorta(sale.evento?.hora ?? null);
  // Solo texto: el diseño de la tarjeta no cambia. Si no hay comité, genérico.
  const committee = (committeeName ?? "").trim().toUpperCase();
  const header = committee ? `${committee} · ACCESO DIGITAL` : "ACCESO DIGITAL";
  const footer = committee || "ACCESO DIGITAL";
  const facultad = (committeeFacultad ?? "").trim();

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={onLayout}
      style={{
        borderRadius: 26,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: ACCENT,
        backgroundColor: MONARQ.background,
        width: "100%",
        maxWidth: 420,
        alignSelf: "center",
      }}>
      <ImageBackground
        source={sale.evento?.imagen_url ? { uri: sale.evento.imagen_url } : null}
        contentFit="cover"
        style={{ width: "100%", minHeight: Math.round(cardWidth * (16 / 9)) }}>
        <View style={{ flex: 1, backgroundColor: "rgba(11, 11, 13, 0.60)" }}>
          <View
            style={{
              alignItems: "center",
              paddingTop: narrow ? 20 : 26,
              paddingHorizontal: headPadX,
              gap: 6,
            }}>
            <Text style={{ fontSize: 10, letterSpacing: 4, color: ACCENT, fontWeight: "700" }}>
              {header}
            </Text>
            <Text
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              ellipsizeMode="tail"
              style={{
                fontSize: titleSize,
                ...(fontFamily ? { fontFamily } : { fontWeight: "800" as const }),
                color: INK_TEXT,
                textAlign: "center",
                width: "100%",
              }}>
              {sale.evento?.nombre ?? "Evento no disponible"}
            </Text>
            {fecha ? (
              <Text style={{ fontSize: 14, letterSpacing: 3, color: INK_TEXT, fontWeight: "600" }}>
                {fecha}
              </Text>
            ) : null}
            {facultad ? (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ fontSize: 12, letterSpacing: 2, color: INK_TEXT }}>
                {facultad.toUpperCase()}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              alignItems: "center",
              paddingVertical: narrow ? 10 : 14,
              flexShrink: 0,
            }}>
            <View style={{ padding: narrow ? 10 : 14 }}>
              <Corner
                style={{ top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderColor: INK_TEXT }}
              />
              <Corner
                style={{ top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderColor: INK_TEXT }}
              />
              <Corner
                style={{ bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: INK_TEXT }}
              />
              <Corner
                style={{ bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderColor: INK_TEXT }}
              />
              <View style={{ backgroundColor: PAPER, borderRadius: 8, padding: narrow ? 10 : 12 }}>
                <TicketQr qrToken={sale.qr_token} size={qrSize} />
              </View>
            </View>
            <Text
              style={{
                fontSize: narrow ? 15 : 17,
                letterSpacing: 4,
                color: INK_TEXT,
                fontWeight: "700",
                marginTop: 10,
              }}>
              {formatFolio(sale.folio, sale.evento?.codigo ?? "")}
            </Text>
          </View>

          <View style={{ alignItems: "center", paddingHorizontal: headPadX, gap: 2 }}>
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              ellipsizeMode="tail"
              style={{
                fontSize: narrow ? 19 : 22,
                fontWeight: "600",
                color: INK_TEXT,
                textAlign: "center",
                width: "100%",
              }}>
              {sale.comprador_nombre}
            </Text>
            {cancelled ? (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: DANGER_INK,
                  backgroundColor: DANGER,
                  borderRadius: 999,
                  paddingVertical: 5,
                  paddingHorizontal: 16,
                  overflow: "hidden",
                  marginTop: 4,
                }}>
                BOLETO CANCELADO
              </Text>
            ) : sale.es_cortesia ? (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: ACCENT_INK,
                  backgroundColor: ACCENT,
                  borderRadius: 999,
                  paddingVertical: 5,
                  paddingHorizontal: 16,
                  overflow: "hidden",
                  marginTop: 4,
                }}>
                CORTESÍA
              </Text>
            ) : null}
          </View>

          <View
            style={{
              marginHorizontal: infoPadX,
              marginTop: 12,
              borderTopWidth: 1,
              borderTopColor: "rgba(244, 241, 234, 0.35)",
            }}
          />

          <View style={{ paddingHorizontal: infoPadX, paddingVertical: 12, gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                justifyContent: "center",
              }}>
              <View style={{ flex: 1, minWidth: narrow ? 150 : 130, gap: 8 }}>
                {fechaLong || hora ? (
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Text
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        letterSpacing: 2,
                        color: ACCENT,
                        fontWeight: "700",
                      }}>
                      FECHA
                    </Text>
                    <View style={{ flex: 1, flexShrink: 1 }}>
                      {fechaLong ? (
                        <Text numberOfLines={2} style={{ fontSize: 14, color: INK_TEXT }}>
                          {fechaLong}
                        </Text>
                      ) : null}
                      {hora ? <Text style={{ fontSize: 14, color: INK_TEXT }}>{hora}</Text> : null}
                    </View>
                  </View>
                ) : null}
                {sale.evento?.lugar ? (
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Text
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        letterSpacing: 2,
                        color: ACCENT,
                        fontWeight: "700",
                      }}>
                      LUGAR
                    </Text>
                    <Text
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={{ fontSize: 14, color: INK_TEXT, flex: 1, flexShrink: 1 }}>
                      {sale.evento.lugar}
                    </Text>
                  </View>
                ) : null}
              </View>
              {sale.evento?.mapas_url ? (
                <View style={{ alignItems: "center", gap: 3, flexShrink: 0 }}>
                  <TicketQr
                    qrToken={sale.evento.mapas_url}
                    size={84}
                    color={INK_TEXT}
                    backgroundColor="transparent"
                    quietZone={6}
                    ecl="H"
                  />
                  <Text style={{ fontSize: 8, letterSpacing: 1, color: ACCENT, fontWeight: "800" }}>
                    CÓMO LLEGAR
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text
            style={{
              textAlign: "center",
              fontSize: 9,
              letterSpacing: 4,
              color: "rgba(244, 241, 234, 0.6)",
              paddingBottom: 18,
            }}>
            {footer}
          </Text>
        </View>
      </ImageBackground>
    </View>
  );
});
