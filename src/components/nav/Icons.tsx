import type { ReactElement } from "react";

import Svg, { Circle, Line, Path, type SvgProps } from "react-native-svg";

export type IconName =
  | "users"
  | "calendar"
  | "target"
  | "ticket"
  | "sale"
  | "scan"
  | "flag"
  | "home"
  | "gear";

type IconProps = {
  /** Lado del ícono en px. */
  size?: number;
  /** Color de trazo. */
  color?: string;
  /** Grosor del trazo (en unidades del viewBox). */
  strokeWidth?: number;
};

/**
 * Íconos de línea dibujados con react-native-svg: trazo fino, sin relleno y
 * terminaciones en ángulo recto. Decorativos: el nombre accesible lo aporta
 * el texto de la tarjeta.
 */
const base = (size: number, color: string, strokeWidth: number): SvgProps => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  accessible: false,
  importantForAccessibility: "no",
});

/** Persona: cabeza (círculo) + arco de hombros. */
export function UsersIcon({ size = 32, color = "#F7F6F2", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 20 C4 16.2 7.6 14 12 14 C16.4 14 20 16.2 20 20" />
    </Svg>
  );
}

/** Calendario: rectángulo, dos pestañas arriba y línea horizontal. */
export function CalendarIcon({ size = 32, color = "#F7F6F2", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M8 3 V6 M16 3 V6" />
      <Path d="M4 6 H20 V20 H4 Z" />
      <Line x1="4" y1="11" x2="20" y2="11" />
    </Svg>
  );
}

/** Diana: tres círculos concéntricos. */
export function TargetIcon({ size = 32, color = "#F7F6F2", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="5.5" />
      <Circle cx="12" cy="12" r="2" />
    </Svg>
  );
}

/**
 * Boleto: rectángulo con muescas laterales a media altura y línea punteada
 * vertical de perforación en el centro.
 */
export function TicketIcon({ size = 32, color = "#F7F6F2", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M6 6 H18 A2 2 0 0 1 20 8 V10 A2 2 0 0 0 20 14 V16 A2 2 0 0 1 18 18 H6 A2 2 0 0 1 4 16 V14 A2 2 0 0 0 4 10 V8 A2 2 0 0 1 6 6 Z" />
      <Path d="M12 8 V16" strokeDasharray="2 2.5" />
    </Svg>
  );
}

/** Nueva venta: cruz dentro de un círculo. */
export function SaleIcon({ size = 32, color = "#F7F6F2", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 8 V16 M8 12 H16" />
    </Svg>
  );
}

/** Escanear: marco de cuatro esquinas con línea central. */
export function ScanIcon({ size = 32, color = "#F7F6F2", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M4 9 V6 A2 2 0 0 1 6 4 H9" />
      <Path d="M15 4 H18 A2 2 0 0 1 20 6 V9" />
      <Path d="M20 15 V18 A2 2 0 0 1 18 20 H15" />
      <Path d="M9 20 H6 A2 2 0 0 1 4 18 V15" />
      <Line x1="4" y1="12" x2="20" y2="12" />
    </Svg>
  );
}

/**
 * Bandera del saludo: astil + paño, sobre un lienzo de 16 (el trazo de 1.6
 * queda a escala real en el px que pide el encabezado).
 */
export function FlagIcon({ size = 16, color = "#A08F7A", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      accessible={false}
      importantForAccessibility="no">
      <Path d="M4 2.5 V14" />
      <Path d="M4 3.5 H12.5 L10.6 6.2 L12.5 8.9 H4" />
    </Svg>
  );
}

/** Casa: tejado, cuerpo y puerta. */
export function HomeIcon({ size = 24, color = "#F7F6F2", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M3.5 11.5 L12 4 L20.5 11.5" />
      <Path d="M6 10 V20 H18 V10" />
      <Path d="M10 20 V15.5 H14 V20" />
    </Svg>
  );
}

/** Engranaje: anillo, eje y ocho dientes radiales. */
export function GearIcon({ size = 24, color = "#F7F6F2", strokeWidth = 1.6 }: IconProps) {
  const dientes = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    dientes.push(
      <Path
        key={i}
        d={`M${(12 + 7.5 * c).toFixed(2)} ${(12 + 7.5 * s).toFixed(2)} L${(12 + 10.5 * c).toFixed(2)} ${(12 + 10.5 * s).toFixed(2)}`}
      />,
    );
  }
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="7.5" />
      <Circle cx="12" cy="12" r="3" />
      {dientes}
    </Svg>
  );
}

/** Paleta de pintor: blob con muesca para el pulgar y tres puntos de tinta. */
export function PaletteIcon({ size = 20, color = "#A08F7A", strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 3.5C7.3 3.5 3.5 7.2 3.5 11.7C3.5 15.7 6.7 19 10.7 19C12.2 19 13 18.1 13 17.1C13 16.5 12.7 16.1 12.4 15.7C12.1 15.3 11.9 14.9 11.9 14.4C11.9 13.4 12.7 12.6 13.8 12.6H15.4C18.3 12.6 20.5 10.4 20.5 7.6C20.5 5.2 16.7 3.5 12 3.5Z" />
      <Circle cx="7.8" cy="10.2" r="1.05" />
      <Circle cx="11.6" cy="7.4" r="1.05" />
      <Circle cx="7.9" cy="14.4" r="1.05" />
    </Svg>
  );
}

const ICONS: Record<IconName, (p: IconProps) => ReactElement> = {
  users: UsersIcon,
  calendar: CalendarIcon,
  target: TargetIcon,
  ticket: TicketIcon,
  sale: SaleIcon,
  scan: ScanIcon,
  flag: FlagIcon,
  home: HomeIcon,
  gear: GearIcon,
};

export function NavIcon({ name, size, color, strokeWidth }: IconProps & { name: IconName }) {
  const Cmp = ICONS[name];
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} />;
}
