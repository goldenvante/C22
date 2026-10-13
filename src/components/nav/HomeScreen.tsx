import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { MaxContentWidth } from "@/constants/theme";
import { Type } from "@/constants/type";
import type { UIPalette } from "@/branding/palette";
import { useBrandPalette } from "@/features/events/eventStyles";
import { AppSidebar } from "./AppSidebar";
import { HomeHeader } from "./HomeHeader";
import { NavIcon, type IconName } from "./Icons";
import { pushRoute } from "./navModel";

const GRID_PAD = 16;
const GRID_GAP = 12;

export type HomeCard = {
  key: string;
  label: string;
  icon: IconName;
  /** Ruta destino (equivale a onPress: pushRoute(href)). */
  href?: string;
  /** Acción propia (p. ej. abrir el selector de evento). Tiene prioridad. */
  onPress?: () => void;
};

type Props = {
  committee?: string | null;
  welcome?: string | null;
  logo?: string | null;
  loading?: boolean;
  cards: HomeCard[];
  /** Elementos adicionales al final del árbol (modales de la pantalla). */
  children?: ReactNode;
};

const makeStyles = (p: UIPalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: p.background,
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: p.background,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
      padding: GRID_PAD,
      alignContent: "flex-start",
    },
    card: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      gap: 9,
    },
    cardLabel: {
      fontFamily: Type.bodySemibold,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      textAlign: "center",
      color: p.textSoft,
    },
  });

/**
 * Inicio (compartido por admin/seller/access): encabezado, retícula de
 * accesos 2×2 y sidebar desde el menú. Solo navegación: sin métricas, sin
 * descripciones, sin chevrons. La tarjeta es cuadrada y su contenido está
 * centrado: el lado sale del ancho de pantalla (Yoga no resuelve bien
 * `aspectRatio` con ancho en % dentro de un contenedor con wrap).
 *
 * Pinta con la paleta activa (tema elegido + colores del comité), igual que
 * el resto de pantallas: el wordmark conserva su tipografía MONARQ, no su
 * color fijo.
 *
 * La barra inferior NO vive aquí: se monta una sola vez en el root layout.
 */
export function HomeScreen({ committee, welcome, logo, loading, cards, children }: Props) {
  const p = useBrandPalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const [menu, setMenu] = useState(false);
  const { width } = useWindowDimensions();
  // Dos columnas exactas: (ancho - paddings - un gap) / 2. El ancho se limita
  // al contenedor central para que una tablet no genere tarjetas gigantes.
  const gridWidth = Math.min(width, MaxContentWidth);
  const cardSize = Math.floor((gridWidth - GRID_PAD * 2 - GRID_GAP) / 2);
  const suelta = cards.length % 2 === 1;

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={{ flex: 1 }}>
        <HomeHeader
          committee={committee}
          welcome={welcome}
          logo={logo}
          onMenu={() => setMenu(true)}
        />
        <ScrollView
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}>
          {cards.map((card, i) => (
            <GridCard
              key={card.key}
              card={card}
              size={cardSize}
              solo={suelta && i === cards.length - 1}
              styles={styles}
              iconColor={p.title}
            />
          ))}
        </ScrollView>
      </View>

      <AppSidebar visible={menu} onClose={() => setMenu(false)} />
      {children}
    </View>
  );
}

function GridCard({
  card,
  size,
  solo,
  styles,
  iconColor,
}: {
  card: HomeCard;
  size: number;
  solo?: boolean;
  styles: ReturnType<typeof makeStyles>;
  iconColor: string;
}) {
  const onPress =
    card.onPress ?? (card.href ? () => pushRoute(card.href as string) : undefined);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={card.label}
      style={({ pressed }) => [
        styles.card,
        { width: size, height: size, opacity: pressed ? 0.7 : 1 },
        solo && { alignSelf: "center" },
      ]}>
      <NavIcon name={card.icon} size={32} color={iconColor} strokeWidth={1.6} />
      <Text style={styles.cardLabel} numberOfLines={1}>
        {card.label}
      </Text>
    </Pressable>
  );
}
