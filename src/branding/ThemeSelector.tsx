import { Pressable, Text, View } from "react-native";

import { useEventStyles } from "@/features/events/eventStyles";
import { useThemeChoice, type ThemeChoice } from "./ThemeChoice";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "auto", label: "Automático" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

/**
 * Selector de apariencia para TODOS los roles (admin, seller, access).
 * Solo cambia superficies/textos neutros; los colores del comité
 * (elegidos por el admin) no se pueden modificar desde aquí.
 */
export function ThemeSelector() {
  const { s, p } = useEventStyles();
  const { choice, setChoice } = useThemeChoice();

  return (
    <View style={{ gap: 8 }}>
      <Text style={s.sectionTitle}>Apariencia</Text>
      <Text style={s.meta}>Los colores de tu comité no cambian: solo claro u oscuro.</Text>
      <View style={s.row}>
        {OPTIONS.map((opt) => {
          const selected = choice === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setChoice(opt.value)}
              style={({ pressed }) => [
                s.secondaryButton,
                { flex: 1 },
                selected && { backgroundColor: p.primary, borderColor: p.primary },
                { opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[s.secondaryButtonText, selected && { color: p.onPrimary }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
