import { View } from "react-native";

/** Tres líneas dibujadas (no emoji): insignia de menú. */
export function MenuGlyph({ color, size = 20 }: { color: string; size?: number }) {
  const bar = { width: size, height: 2, borderRadius: 1, backgroundColor: color };
  return (
    <View style={{ width: size, gap: 4, alignItems: "center" }} accessibilityElementsHidden>
      <View style={bar} />
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}
