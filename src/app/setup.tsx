import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { loginEmailForUsuario, supabase } from "@/lib/supabase";
import { COLOR_PRESETS, normalizeHex } from "@/branding/useCommittee";
import { signupCommittee, uploadCommitteeLogo } from "@/features/committees/api";

function Swatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <View style={styles.swatches}>
      {COLOR_PRESETS.map((hex) => {
        const selected = value.toUpperCase() === hex.toUpperCase();
        return (
          <Pressable
            key={hex}
            onPress={() => onChange(hex)}
            accessibilityLabel={`Color ${hex}`}
            style={({ pressed }) => [
              styles.swatch,
              { backgroundColor: hex, opacity: pressed ? 0.7 : 1 },
              selected && styles.swatchSelected,
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * Registro inicial: aparece ANTES del login (enlace "Registrar comité").
 * Cada comité registra nombre + colores representativos + icono + cuenta
 * administradora (acceso total: usuarios, eventos, ventas, reportes).
 * Tras el registro inicia sesión automáticamente como admin.
 */
export default function SetupScreen() {
  const theme = useTheme();
  const [committeeNombre, setCommitteeNombre] = useState("");
  const [primary, setPrimary] = useState("#111111");
  const [secondary, setSecondary] = useState("#6B7280");
  const [background, setBackground] = useState("#FFFFFF");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoMime, setLogoMime] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("");
  const [encargado, setEncargado] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.textSecondary, backgroundColor: theme.backgroundElement },
  ];

  async function pickLogo() {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!res.canceled && res.assets[0]) {
        setLogoUri(res.assets[0].uri);
        setLogoMime(res.assets[0].mimeType ?? "image/jpeg");
      }
    } catch {
      setError("No se pudo abrir la galería.");
    }
  }

  async function onSubmit() {
    setError(null);
    const p = normalizeHex(primary);
    const s = normalizeHex(secondary);
    const b = normalizeHex(background);
    if (!committeeNombre.trim() || committeeNombre.trim().length < 2) {
      setError("Escribe el nombre de tu comité (mínimo 2 caracteres).");
      return;
    }
    if (!p || !s || !b) {
      setError("Revisa los colores: usa formato #RRGGBB (p. ej. #8B263D).");
      return;
    }
    const u = usuario.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) {
      setError("Usuario del admin inválido: 3-32 caracteres, minúsculas, números, punto, guion o guion bajo.");
      return;
    }
    if (!encargado.trim()) {
      setError("Escribe el nombre de la persona encargada.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      // Logo a la nube (best-effort): si falla, el registro continúa sin icono.
      let logoUrl: string | null = null;
      if (logoUri) {
        try {
          logoUrl = await uploadCommitteeLogo(logoUri, logoMime, `nuevo-${Date.now()}`);
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
          return;
        }
      }
      const created = await signupCommittee({
        committeeNombre: committeeNombre.trim(),
        colorPrimario: p,
        colorSecundario: s,
        colorFondo: b,
        logoUrl,
        usuario: u,
        nombre: encargado.trim(),
        password,
      });
      // Entrada automática como admin recién creado.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmailForUsuario(created.usuario),
        password,
      });
      if (signInError) {
        router.replace("/");
        return;
      }
      // RouteGate redirige a /(admin) por rol. No navegar aquí.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <ThemedText type="title" style={styles.title}>
              Registra tu comité
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Solo se hace una vez. Personaliza colores e icono y crea la cuenta administradora.
            </ThemedText>

            <ThemedText type="smallBold">Nombre del comité</ThemedText>
            <TextInput
              value={committeeNombre}
              onChangeText={setCommitteeNombre}
              placeholder="p. ej. Comité de Festejos San Juan"
              placeholderTextColor={theme.textSecondary}
              editable={!busy}
              maxLength={80}
              style={inputStyle}
            />

            <ThemedText type="smallBold">Color principal (representativo)</ThemedText>
            <Swatches value={primary} onChange={setPrimary} />
            <TextInput
              value={primary}
              onChangeText={setPrimary}
              placeholder="#111111"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              maxLength={7}
              style={inputStyle}
            />

            <ThemedText type="smallBold">Color secundario</ThemedText>
            <Swatches value={secondary} onChange={setSecondary} />
            <TextInput
              value={secondary}
              onChangeText={setSecondary}
              placeholder="#6B7280"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              maxLength={7}
              style={inputStyle}
            />

            <ThemedText type="smallBold">Color de fondo</ThemedText>
            <Swatches value={background} onChange={setBackground} />
            <TextInput
              value={background}
              onChangeText={setBackground}
              placeholder="#FFFFFF"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              maxLength={7}
              style={inputStyle}
            />

            <ThemedText type="smallBold">Icono del comité (opcional)</ThemedText>
            {logoUri ? (
              <View style={styles.logoRow}>
                <Image source={{ uri: logoUri }} style={styles.logo} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Pressable onPress={pickLogo} disabled={busy} style={styles.linkButton}>
                    <ThemedText type="link">Cambiar icono</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setLogoUri(null);
                      setLogoMime(null);
                    }}
                    disabled={busy}
                    style={styles.linkButton}>
                    <ThemedText type="link">Quitar icono</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={pickLogo}
                disabled={busy}
                style={({ pressed }) => [styles.secondary, { opacity: pressed || busy ? 0.7 : 1 }]}>
                <ThemedText type="smallBold">Elegir icono de la galería</ThemedText>
              </Pressable>
            )}

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Cuenta administradora
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              La persona encargada: acceso total (usuarios, eventos, ventas, cortesías y reportes).
            </ThemedText>

            <ThemedText type="smallBold">Usuario del admin</ThemedText>
            <TextInput
              value={usuario}
              onChangeText={setUsuario}
              placeholder="p. ej. admin.sanjuan"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={inputStyle}
            />

            <ThemedText type="smallBold">Nombre del encargado</ThemedText>
            <TextInput
              value={encargado}
              onChangeText={setEncargado}
              placeholder="p. ej. María López"
              placeholderTextColor={theme.textSecondary}
              editable={!busy}
              maxLength={120}
              style={inputStyle}
            />

            <ThemedText type="smallBold">Contraseña</ThemedText>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={inputStyle}
            />

            <ThemedText type="smallBold">Confirmar contraseña</ThemedText>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repite la contraseña"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              onSubmitEditing={onSubmit}
              style={inputStyle}
            />

            {error ? (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}

            <Pressable
              onPress={onSubmit}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.text, opacity: busy || pressed ? 0.7 : 1 },
              ]}>
              {busy ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Crear comité y cuenta admin
                </ThemedText>
              )}
            </Pressable>

            <Pressable onPress={() => router.replace("/")} disabled={busy} style={styles.linkButton}>
              <ThemedText type="link">Ya tengo cuenta: iniciar sesión</ThemedText>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", justifyContent: "center" },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, paddingHorizontal: Spacing.four },
  form: { gap: Spacing.two, paddingVertical: Spacing.four },
  title: { textAlign: "center" },
  subtitle: { textAlign: "center", marginBottom: Spacing.two },
  sectionTitle: { marginTop: Spacing.three, textAlign: "left" },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "#D4D4D8" },
  swatchSelected: { borderColor: "#000000" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  logo: { width: 88, height: 88, borderRadius: 44 },
  error: { color: "#D64545" },
  button: { marginTop: Spacing.two, borderRadius: Spacing.two, paddingVertical: Spacing.three, alignItems: "center" },
  secondary: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: "center",
  },
  linkButton: { alignItems: "center", paddingVertical: Spacing.two },
});
