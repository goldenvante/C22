import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { MaxContentWidth, Spacing, Type } from "@/constants/theme";
import { useEventStyles } from "@/features/events/eventStyles";
import { supabase } from "@/lib/supabase";
import { normalizeHex } from "@/branding/useCommittee";
import { NEUTRAL_BRAND, buildPalette, type UIPalette } from "@/branding/palette";
import { useThemeChoice } from "@/branding/ThemeChoice";
import { ColorField } from "@/components/color-field";
import { signupCommittee, updateCommittee, uploadCommitteeLogo } from "@/features/committees/api";

type EventStyles = ReturnType<typeof useEventStyles>;

function Section({
  s,
  title,
  description,
}: {
  s: EventStyles["s"];
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.goldRule} />
      {description ? <Text style={s.meta}>{description}</Text> : null}
    </View>
  );
}

/**
 * Vista previa local: usa buildPalette() con los colores elegidos para
 * mostrar cómo se verá MONARQ. No guarda nada en Supabase ni consulta datos.
 */
function Preview({
  pv,
  name,
  logoUri,
}: {
  pv: UIPalette;
  name: string;
  logoUri: string | null;
}) {
  return (
    <View style={[styles.previewBox, { backgroundColor: pv.background, borderColor: pv.border }]}>
      <View style={[styles.previewCard, { backgroundColor: pv.surface, borderColor: pv.border }]}>
        <View style={[styles.previewHeader, { backgroundColor: pv.primary }]}>
          {logoUri ? <Image source={{ uri: logoUri }} style={styles.previewLogo} /> : null}
          <Text numberOfLines={1} style={[styles.previewHeaderText, { color: pv.onPrimary, flex: 1 }]}>
            {name || "Tu comité"}
          </Text>
        </View>
        <View style={[styles.previewRule, { backgroundColor: pv.rule }]} />
        <Text style={[styles.previewBody, { color: pv.text }]}>
          Así se verá tu espacio en MONARQ con estos colores.
        </Text>
        <View style={styles.previewButtons}>
          <View style={[styles.previewBtn, { backgroundColor: pv.primary }]}>
            <Text style={[styles.previewBtnText, { color: pv.onPrimary }]}>Acción principal</Text>
          </View>
          <View
            style={[
              styles.previewBtn,
              { backgroundColor: pv.secondaryBg, borderWidth: 1, borderColor: pv.border },
            ]}>
            <Text style={[styles.previewBtnText, { color: pv.title }]}>Secundario</Text>
          </View>
        </View>
      </View>
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
  const { s, p } = useEventStyles();
  const { scheme } = useThemeChoice();
  const [committeeNombre, setCommitteeNombre] = useState("");
  const [facultad, setFacultad] = useState("");
  const [primary, setPrimary] = useState(NEUTRAL_BRAND.primary);
  const [secondary, setSecondary] = useState(NEUTRAL_BRAND.secondary);
  const [background, setBackground] = useState(NEUTRAL_BRAND.background);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoMime, setLogoMime] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [encargado, setEncargado] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [logoWarning, setLogoWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createdRef = useRef<{ committeeId: string; usuario: string } | null>(null);

  // Paleta de la vista previa: mismos tokens que verá la app tras registrarse.
  const previewPalette = useMemo(
    () => buildPalette({ primary, secondary, background }, scheme),
    [primary, secondary, background, scheme],
  );

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
    setLogoWarning(null);
    const pColor = normalizeHex(primary);
    const sColor = normalizeHex(secondary);
    const bColor = normalizeHex(background);
    if (!committeeNombre.trim() || committeeNombre.trim().length < 2) {
      setError("Escribe el nombre de tu comité (mínimo 2 caracteres).");
      return;
    }
    if (facultad.trim().length > 160) {
      setError("La facultad no puede superar los 160 caracteres.");
      return;
    }
    if (!pColor || !sColor || !bColor) {
      setError("Revisa los colores: usa formato #RRGGBB.");
      return;
    }
    const u = usuario.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) {
      setError("Usuario del admin inválido: 3-32 caracteres, minúsculas, números, punto, guion o guion bajo.");
      return;
    }
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail) || mail.length > 254) {
      setError("Escribe un correo electrónico válido. Se usará para recuperar tu contraseña.");
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
      let created = createdRef.current;
      if (!created) {
        created = await signupCommittee({
          committeeNombre: committeeNombre.trim(),
          colorPrimario: pColor,
          colorSecundario: sColor,
          colorFondo: bColor,
          logoUrl: null,
          facultad: facultad.trim() || null,
          usuario: u,
          email: mail,
          nombre: encargado.trim(),
          password,
        });
        createdRef.current = created;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: mail,
        password,
      });
      if (signInError) {
        setError(
          "Tu espacio y tu cuenta ya se crearon, pero no se pudo iniciar sesión automáticamente. Pulsa “Ya tengo cuenta” y entra con tu usuario y contraseña.",
        );
        return;
      }
      if (logoUri) {
        try {
          const logoUrl = await uploadCommitteeLogo(logoUri, logoMime, created.committeeId);
          await updateCommittee({
            id: created.committeeId,
            nombre: committeeNombre.trim(),
            colorPrimario: pColor,
            colorSecundario: sColor,
            colorFondo: bColor,
            logoUrl,
          });
        } catch {
          const aviso =
            "Tu espacio y tu cuenta se crearon correctamente, pero el logo no se pudo guardar. Puedes agregarlo desde Configuración.";
          setLogoWarning(aviso);
          Alert.alert("Registro completado", aviso);
        }
      }
    } catch (e) {
      setError((e as Error).message);
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
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.content}>
              <View style={styles.header}>
                <Text style={[styles.wordmark, { color: p.title }]}>MONARQ</Text>
                <View style={s.goldRule} />
                <Text style={[styles.title, { color: p.title }]}>
                  Configura tu espacio en MONARQ
                </Text>
                <Text style={s.meta}>Personaliza la identidad de tu comité</Text>
              </View>

              {/* 1. Identidad del comité */}
              <Section s={s} title="Identidad del comité" description="Nombre con el que tu comité aparecerá en la app y facultad que se muestra en el boleto." />
              <Text style={s.label}>Nombre del comité</Text>
              <TextInput
                value={committeeNombre}
                onChangeText={setCommitteeNombre}
                placeholder="Ej. Comité de Graduación 2027"
                placeholderTextColor={p.textSoft}
                editable={!busy}
                maxLength={80}
                style={s.input}
              />

              <Text style={s.label}>Facultad</Text>
              <TextInput
                value={facultad}
                onChangeText={setFacultad}
                placeholder="Ej. Facultad de Ingeniería"
                placeholderTextColor={p.textSoft}
                editable={!busy}
                maxLength={160}
                style={s.input}
              />
              <Text style={s.meta}>Aparece bajo el nombre del evento en el boleto. Puedes dejarlo vacío.</Text>

              {/* 2. Identidad visual */}
              <Section s={s} title="Identidad visual" description="Logo y colores que se aplicarán a toda tu app." />
              <Text style={s.label}>Logo del comité</Text>
              {logoUri ? (
                <View style={styles.logoRow}>
                  <Image source={{ uri: logoUri }} style={styles.logo} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Pressable onPress={pickLogo} disabled={busy} style={styles.linkButton}>
                      <Text style={s.link}>Cambiar logo</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setLogoUri(null);
                        setLogoMime(null);
                      }}
                      disabled={busy}
                      style={styles.linkButton}>
                      <Text style={s.link}>Quitar logo</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={pickLogo}
                  disabled={busy}
                  style={({ pressed }) => [s.secondaryButton, { opacity: pressed || busy ? 0.7 : 1 }]}>
                  <Text style={s.secondaryButtonText}>Elegir logo de la galería</Text>
                </Pressable>
              )}

              <ColorField
                label="Color principal"
                value={primary}
                onChange={setPrimary}
                placeholder={NEUTRAL_BRAND.primary}
                editable={!busy}
              />

              <ColorField
                label="Color secundario"
                value={secondary}
                onChange={setSecondary}
                placeholder={NEUTRAL_BRAND.secondary}
                editable={!busy}
              />

              <ColorField
                label="Color de fondo"
                value={background}
                onChange={setBackground}
                placeholder={NEUTRAL_BRAND.background}
                editable={!busy}
              />

              {/* 3. Vista previa */}
              <Section s={s} title="Vista previa" description="Los cambios se reflejan aquí al instante." />
              <Preview pv={previewPalette} name={committeeNombre.trim()} logoUri={logoUri} />

              {/* 4. Crear espacio */}
              <Section
                s={s}
                title="Crear espacio"
                description="Cuenta administradora: acceso total (usuarios, eventos, ventas, cortesías y reportes)."
              />
              <Text style={s.label}>Usuario del admin</Text>
              <TextInput
                value={usuario}
                onChangeText={setUsuario}
                placeholder="Ej. mi.usuario"
                placeholderTextColor={p.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                style={s.input}
              />

              <Text style={s.label}>Correo del admin</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Ej. hola@tudominio.com"
                placeholderTextColor={p.textSoft}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                style={s.input}
              />

              <Text style={s.label}>Nombre del encargado</Text>
              <TextInput
                value={encargado}
                onChangeText={setEncargado}
                placeholder="Ej. Ana López"
                placeholderTextColor={p.textSoft}
                editable={!busy}
                maxLength={120}
                style={s.input}
              />

              <Text style={s.label}>Contraseña</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={p.textSoft}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                style={s.input}
              />

              <Text style={s.label}>Confirmar contraseña</Text>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repite la contraseña"
                placeholderTextColor={p.textSoft}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                onSubmitEditing={onSubmit}
                style={s.input}
              />

              {error ? <Text style={s.error}>{error}</Text> : null}
              {logoWarning ? (
                <Text style={[styles.warning, { color: p.success }]}>{logoWarning}</Text>
              ) : null}

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
                  <Text style={s.primaryButtonText}>Crear espacio</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => router.replace("/")}
                disabled={busy}
                style={({ pressed }) => [s.linkWrap, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.link}>Ya tengo cuenta: iniciar sesión</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.three,
  },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  header: {
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  wordmark: {
    fontSize: 26,
    fontFamily: Type.display,
    letterSpacing: 5,
    textAlign: "center",
  },
  title: {
    fontSize: 24,
    fontFamily: Type.heading,
    textAlign: "center",
  },
  warning: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Type.body,
    marginTop: Spacing.one,
  },
  section: {
    gap: 4,
    marginTop: Spacing.three,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  linkButton: {
    alignItems: "flex-start",
    paddingVertical: Spacing.one,
  },
  previewBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    gap: Spacing.two,
    padding: Spacing.three,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  previewLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  previewHeaderText: {
    fontSize: 15,
    fontFamily: Type.bodyBold,
  },
  previewRule: {
    height: 3,
    width: 64,
    borderRadius: 2,
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Type.body,
  },
  previewButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  previewBtn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    alignItems: "center",
  },
  previewBtnText: {
    fontSize: 13,
    fontFamily: Type.bodyBold,
  },
});
