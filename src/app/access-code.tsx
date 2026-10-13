import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { verifyAccessCode } from "@/features/gate/api";
import { markGateUnlocked } from "@/features/gate/localFlag";
import { useEventStyles } from "@/features/events/eventStyles";
import { Type } from "@/constants/theme";

export default function AccessCodeScreen() {
  const { s, p } = useEventStyles();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (busy) return;
    const value = codigo.trim();
    if (value.length < 4) {
      setError("Ingresa tu código de acceso.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await verifyAccessCode(value);
      if (result === "ok") {
        await markGateUnlocked();
        router.replace("/");
        return;
      }
      setError(
        result === "vencido"
          ? "El código de acceso venció. Pide uno nuevo al administrador."
          : "Código incorrecto.",
      );
    } catch {
      setError("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}>
          <View style={[s.center, styles.center]}>
            <View style={[s.card, styles.card]}>
              <Text style={[styles.title, { color: p.title }]}>
                Ingrese codigo para acceder a MONARQ
              </Text>

              <TextInput
                value={codigo}
                onChangeText={setCodigo}
                placeholder="Código"
                placeholderTextColor={p.textSoft}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                onSubmitEditing={onSubmit}
                style={s.input}
              />

              {error ? <Text style={s.error}>{error}</Text> : null}

              <Pressable
                onPress={onSubmit}
                disabled={busy}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: busy || pressed ? 0.7 : 1 },
                ]}>
                {busy ? (
                  <ActivityIndicator color={p.onPrimary} />
                ) : (
                  <Text style={s.primaryButtonText}>Continuar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    gap: 16,
    padding: 24,
    borderRadius: 16,
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontFamily: Type.heading,
    textAlign: "center",
  },
});
