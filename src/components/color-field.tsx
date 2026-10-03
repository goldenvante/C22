import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { normalizeHex } from "@/branding/useCommittee";
import { ColorPickerModal } from "@/components/color-picker";
import { PaletteIcon } from "@/components/nav/Icons";
import { useEventStyles } from "@/features/events/eventStyles";

type Props = {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Texto de ayuda cuando el campo está vacío. */
  placeholder?: string;
  /** false mientras la pantalla está ocupada (p. ej. creando el comité). */
  editable?: boolean;
};

/**
 * Campo de color: input hex + botón de muestra con el ícono de paleta que abre
 * la rueda de selector. Sin presets: el comité elige el tono que quiera.
 */
export function ColorField({ label, value, onChange, placeholder = "#RRGGBB", editable = true }: Props) {
  const { s, p } = useEventStyles();
  const [open, setOpen] = useState(false);
  const valid = normalizeHex(value) !== null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <TextInput
          value={value}
          onChangeText={onChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          placeholder={placeholder}
          placeholderTextColor={p.textSoft}
          editable={editable}
          style={[s.input, { flex: 1 }]}
        />
        <Pressable
          onPress={() => setOpen(true)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Elegir ${label.toLowerCase()}`}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: p.border,
              backgroundColor: valid ? (normalizeHex(value) as string) : "transparent",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              padding: 4,
              opacity: !editable ? 0.5 : pressed ? 0.7 : 1,
            },
          ]}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: p.surface,
              borderWidth: 1,
              borderColor: p.border,
              alignItems: "center",
              justifyContent: "center",
            }}>
            <PaletteIcon size={13} color={p.accent} strokeWidth={1.8} />
          </View>
        </Pressable>
      </View>
      <ColorPickerModal
        visible={open}
        initial={value}
        label={label}
        onCancel={() => setOpen(false)}
        onConfirm={(hex) => {
          onChange(hex);
          setOpen(false);
        }}
      />
    </View>
  );
}
