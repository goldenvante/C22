import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { normalizeHex } from "@/branding/useCommittee";
import { useEventStyles } from "@/features/events/eventStyles";

export type Hsv = { h: number; s: number; v: number };

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number] = [0, 0, 0];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = v - c;
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

export function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  const t = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${t(r)}${t(g)}${t(b)}`;
}

export function hexToHsv(hex: string): Hsv {
  const clean = normalizeHex(hex) ?? "#A08F7A";
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

const WHEEL = 240;
const R = WHEEL / 2;
const TRACK_H = 26;
const THUMB = 22;

type Point = { locationX: number; locationY: number };

/**
 * Selector de color tipo rueda: matiz por ángulo, saturación por radio
 * (centro blanco) y una barra de brillo debajo. Cierra con Aplicar/Cancelar;
 * el valor solo se emite al confirmar para no pisar lo que ya está escrito.
 */
export function ColorPickerModal({
  visible,
  initial,
  label,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  initial: string;
  /** Nombre del campo (p. ej. "Color primario) para el lector de pantalla. */
  label?: string;
  onCancel: () => void;
  onConfirm: (hex: string) => void;
}) {
  const { s, p } = useEventStyles();
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(initial));
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  useEffect(() => {
    if (visible) setHsv(hexToHsv(initial));
  }, [visible, initial]);

  const wedges = useMemo(() => {
    const n = 96;
    const out: { d: string; fill: string }[] = [];
    for (let i = 0; i < n; i++) {
      const h0 = (i * 360) / n;
      const h1 = ((i + 1) * 360) / n;
      const a0 = ((h0 - 90) * Math.PI) / 180;
      const a1 = ((h1 - 90) * Math.PI) / 180;
      const x0 = R + R * Math.cos(a0);
      const y0 = R + R * Math.sin(a0);
      const x1 = R + R * Math.cos(a1);
      const y1 = R + R * Math.sin(a1);
      out.push({
        d:
          `M${R} ${R}L${x0.toFixed(2)} ${y0.toFixed(2)}` +
          `A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`,
        fill: hsvToHex(h0, 1, 1),
      });
    }
    return out;
  }, []);

  const dotX = R + R * hsv.s * Math.sin((hsv.h * Math.PI) / 180);
  const dotY = R - R * hsv.s * Math.cos((hsv.h * Math.PI) / 180);

  function pickOnWheel(pt: Point) {
    const dx = pt.locationX - R;
    const dy = pt.locationY - R;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    setHsv((cur) => ({ h: deg, s: clamp01(dist / R), v: cur.v }));
  }

  function pickOnTrack(pt: Point) {
    setHsv((cur) => ({ ...cur, v: clamp01(pt.locationX / WHEEL) }));
  }

  const responder = (fn: (pt: Point) => void) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: { nativeEvent: Point }) => fn(e.nativeEvent),
    onResponderMove: (e: { nativeEvent: Point }) => fn(e.nativeEvent),
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={{ flex: 1, backgroundColor: p.scrim, alignItems: "center", justifyContent: "center", padding: 20 }}
        onPress={onCancel}>
        <Pressable
          onPress={() => {}}
          style={{
            width: 300,
            maxWidth: "100%",
            backgroundColor: p.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: p.border,
            padding: 18,
            gap: 14,
          }}>
          <Text style={s.sectionTitle}>{label ? `Elegir ${label.toLowerCase()}` : "Elegir color"}</Text>
          <View style={s.goldRule} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: hex,
                borderWidth: 1,
                borderColor: p.border,
              }}
            />
            <Text style={[s.smallBold, { color: p.text, letterSpacing: 1 }]}>{hex}</Text>
          </View>

          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Rueda de color: matiz y saturación"
            style={{ width: WHEEL, height: WHEEL, alignSelf: "center" }}
            {...responder(pickOnWheel)}>
            <Svg width={WHEEL} height={WHEEL}>
              <Defs>
                <RadialGradient id="sat" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                  <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              {wedges.map((w, i) => (
                <Path key={i} d={w.d} fill={w.fill} />
              ))}
              <Circle cx={R} cy={R} r={R} fill="url(#sat)" />
              <Circle cx={dotX} cy={dotY} r={13} fill="none" stroke="#000000" strokeOpacity={0.35} strokeWidth={3} />
              <Circle cx={dotX} cy={dotY} r={10} fill="none" stroke="#FFFFFF" strokeWidth={3} />
            </Svg>
          </View>

          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Brillo"
            style={{ width: WHEEL, height: TRACK_H, alignSelf: "center" }}
            {...responder(pickOnTrack)}>
            <Svg width={WHEEL} height={TRACK_H}>
              <Defs>
                <LinearGradient id="val" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor="#000000" />
                  <Stop offset="100%" stopColor={hsvToHex(hsv.h, hsv.s, 1)} />
                </LinearGradient>
              </Defs>
              <Rect
                x={1}
                y={1}
                width={WHEEL - 2}
                height={TRACK_H - 2}
                rx={(TRACK_H - 2) / 2}
                fill="url(#val)"
                stroke={p.border}
              />
            </Svg>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: Math.max(0, Math.min(WHEEL - THUMB, hsv.v * WHEEL - THUMB / 2)),
                top: (TRACK_H - THUMB) / 2,
                width: THUMB,
                height: THUMB,
                borderRadius: THUMB / 2,
                borderWidth: 3,
                borderColor: "#FFFFFF",
                backgroundColor: hex,
              }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [s.secondaryButton, { flex: 1, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={s.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(hex)}
              style={({ pressed }) => [s.primaryButton, { flex: 1, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={s.primaryButtonText}>Aplicar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
