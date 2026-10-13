import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { ThemeSelector } from "@/branding/ThemeSelector";
import { MONARQ, NEUTRAL_BRAND } from "@/branding/palette";
import { normalizeHex, useCommittee } from "@/branding/useCommittee";
import { BackHeader } from "@/components/back-header";
import { ColorField } from "@/components/color-field";
import { homeHref } from "@/components/nav/navModel";
import {
  clampTicketTitleSize,
  TICKET_FONT_CATEGORIES,
  TICKET_FONTS,
  TICKET_FONT_SYSTEM,
  ticketFont,
} from "@/constants/type";
import { getMyEmail, setMyEmail } from "@/features/auth/adminAuth";
import { updateCommittee } from "@/features/committees/api";
import { useEventStyles } from "@/features/events/eventStyles";
import { AUTH_EMAIL_DOMAIN, hasRole } from "@/lib/supabase";

const PREVIEW_TEXT = "Festival de Bienvenida";

/**
 * Configuración del espacio: identidad del comité (solo admin, vía RLS) y
 * configuración de aplicación (apariencia, sesión). Pantalla única compartida
 * por los tres roles; la sección del comité solo se muestra a quien puede
 * escribir en la tabla `committees`.
 */
export default function ConfiguracionScreen() {
  const { s, p } = useEventStyles();
  const { profile, signOut } = useAuth();
  const { committee, loading, refresh } = useCommittee();

  const canEditBrand = hasRole(profile, "admin");

  const [nombre, setNombre] = useState("");
  const [facultad, setFacultad] = useState("");
  const [primario, setPrimario] = useState("");
  const [secundario, setSecundario] = useState("");
  const [fondo, setFondo] = useState("");
  const [tituloFuente, setTituloFuente] = useState<string>(TICKET_FONT_SYSTEM);
  const [tituloTamano, setTituloTamano] = useState(36);
  const [previewWidth, setPreviewWidth] = useState(300);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySaving, setRecoverySaving] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!canEditBrand) return;
    let alive = true;
    setRecoveryLoading(true);
    setRecoveryError(null);
    getMyEmail()
      .then((value) => {
        if (!alive) return;
        setRecoveryEmail(value);
        setRecoveryLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setRecoveryError((e as Error).message);
        setRecoveryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canEditBrand]);

  useEffect(() => {
    if (!committee) return;
    setNombre(committee.nombre);
    setFacultad(committee.facultad ?? "");
    setPrimario(committee.color_primario);
    setSecundario(committee.color_secundario);
    setFondo(committee.color_fondo);
    setTituloFuente(committee.titulo_fuente || TICKET_FONT_SYSTEM);
    setTituloTamano(clampTicketTitleSize(committee.titulo_tamano));
    // Solo al cambiar de comité: no pisa lo que el usuario está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committee?.id]);

  const font = ticketFont(tituloFuente);
  const fontFamily = font.key === TICKET_FONT_SYSTEM ? undefined : font.key;
  const previewSize = Math.round(
    Math.min(tituloTamano * font.optical, Math.max(22, previewWidth / 9.5)),
  );

  function onPreviewLayout(e: LayoutChangeEvent) {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== previewWidth) setPreviewWidth(w);
  }

  function useNeutralIdentity() {
    setPrimario(NEUTRAL_BRAND.primary);
    setSecundario(NEUTRAL_BRAND.secondary);
    setFondo(NEUTRAL_BRAND.background);
    setNotice(null);
    setError(null);
  }

  async function save() {
    if (!committee) return;
    const cleanName = nombre.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      setError("El nombre del comité debe tener entre 2 y 80 caracteres.");
      return;
    }
    if (facultad.trim().length > 160) {
      setError("La facultad no puede superar los 160 caracteres.");
      return;
    }
    const a = normalizeHex(primario);
    const b = normalizeHex(secundario);
    const c = normalizeHex(fondo);
    if (!a || !b || !c) {
      setError("Colores inválidos. Usa formato #RRGGBB.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updateCommittee({
        id: committee.id,
        nombre: cleanName,
        colorPrimario: a,
        colorSecundario: b,
        colorFondo: c,
        facultad,
        tituloFuente,
        tituloTamano,
      });
      setNotice("Guardado.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveRecoveryEmail() {
    setRecoveryError(null);
    setRecoveryNotice(null);
    setRecoverySaving(true);
    try {
      const saved = await setMyEmail(recoveryEmail);
      setRecoveryEmail(saved);
      setRecoveryNotice("Correo guardado.");
    } catch (e) {
      setRecoveryError((e as Error).message);
    } finally {
      setRecoverySaving(false);
    }
  }

  if (!profile) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={[s.scroll, { flexGrow: 1 }]}>
          <Text style={s.screenTitle}>Ajustes</Text>
          <View style={s.goldRule} />
          <BackHeader fallback={homeHref(profile)} />
          <Text style={s.meta}>Ajustes del espacio de trabajo.</Text>

          {canEditBrand ? (
            <View style={{ gap: 12 }}>
              <Text style={s.sectionTitle}>Comité</Text>
              <View style={s.goldRule} />

              <Text style={s.label}>Nombre</Text>
              <TextInput
                value={nombre}
                onChangeText={setNombre}
                maxLength={80}
                placeholder="Nombre del comité"
                placeholderTextColor={p.textSoft}
                style={s.input}
              />

              <Text style={s.label}>Facultad</Text>
              <TextInput
                value={facultad}
                onChangeText={setFacultad}
                maxLength={160}
                placeholder="Ej. Facultad de Ingeniería"
                placeholderTextColor={p.textSoft}
                style={s.input}
              />
              <Text style={s.meta}>Aparece bajo el nombre del evento en el boleto.</Text>

              {loading && !committee ? (
                <ActivityIndicator color={p.primary} />
              ) : committee ? (
                <>
                  <ColorField label="Color primario" value={primario} onChange={setPrimario} />
                  <ColorField label="Color secundario" value={secundario} onChange={setSecundario} />
                  <ColorField label="Color de fondo" value={fondo} onChange={setFondo} />
                  <Pressable
                    onPress={useNeutralIdentity}
                    style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={s.secondaryButtonText}>Usar identidad MONARQ (neutra)</Text>
                  </Pressable>

                  <Text style={s.label}>Título del boleto</Text>
                  <Text style={s.meta}>
                    Fuente y tamaño del nombre del evento en el boleto digital.
                  </Text>
                  <View
                    onLayout={onPreviewLayout}
                    style={{
                      width: "100%",
                      maxWidth: 420,
                      borderRadius: 20,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: MONARQ.accent,
                      backgroundColor: MONARQ.background,
                      paddingVertical: 20,
                      paddingHorizontal: 16,
                      gap: 6,
                      alignItems: "center",
                    }}>
                    <Text
                      numberOfLines={3}
                      adjustsFontSizeToFit
                      minimumFontScale={0.55}
                      style={{
                        width: "100%",
                        fontSize: previewSize,
                        ...(fontFamily ? { fontFamily } : { fontWeight: "800" as const }),
                        color: MONARQ.textPrimary,
                        textAlign: "center",
                      }}>
                      {PREVIEW_TEXT}
                    </Text>
                    <Text
                      style={{
                        fontSize: 9,
                        letterSpacing: 4,
                        color: "rgba(244, 241, 234, 0.6)",
                      }}>
                      ACCESO DIGITAL
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}>
                    <Text style={s.label}>Tamaño</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Pressable
                        accessibilityLabel="Reducir tamaño"
                        onPress={() => setTituloTamano((v) => Math.max(20, v - 2))}
                        style={({ pressed }) => [
                          {
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: p.border,
                            backgroundColor: p.secondaryBg,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}>
                        <Text style={{ fontSize: 22, lineHeight: 24, color: p.text }}>−</Text>
                      </Pressable>
                      <Text
                        style={{
                          minWidth: 64,
                          textAlign: "center",
                          fontSize: 16,
                          fontWeight: "600",
                          color: p.title,
                        }}>
                        {tituloTamano} pt
                      </Text>
                      <Pressable
                        accessibilityLabel="Aumentar tamaño"
                        onPress={() => setTituloTamano((v) => Math.min(48, v + 2))}
                        style={({ pressed }) => [
                          {
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: p.border,
                            backgroundColor: p.secondaryBg,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}>
                        <Text style={{ fontSize: 22, lineHeight: 24, color: p.text }}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  {TICKET_FONT_CATEGORIES.map((cat) => (
                    <View key={cat.key} style={{ gap: 8 }}>
                      <Text style={s.label}>{cat.label}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {TICKET_FONTS.filter((f) => f.categoria === cat.key).map((f) => {
                          const active = f.key === tituloFuente;
                          return (
                            <Pressable
                              key={f.key}
                              onPress={() => setTituloFuente(f.key)}
                              style={({ pressed }) => [
                                {
                                  paddingHorizontal: 14,
                                  paddingVertical: 9,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: active ? p.primary : p.border,
                                  backgroundColor: active ? p.primary : p.secondaryBg,
                                  opacity: pressed ? 0.7 : 1,
                                },
                              ]}>
                              <Text
                                numberOfLines={1}
                                style={{
                                  fontSize: 16,
                                  color: active ? p.onPrimary : p.title,
                                  fontFamily: f.key === TICKET_FONT_SYSTEM ? undefined : f.key,
                                }}>
                                {f.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}

                  <Pressable
                    disabled={saving}
                    onPress={save}
                    style={({ pressed }) => [
                      s.primaryButton,
                      { opacity: saving ? 0.5 : pressed ? 0.7 : 1 },
                    ]}>
                    <Text style={s.primaryButtonText}>{saving ? "Guardando…" : "Guardar identidad"}</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={s.meta}>No tienes un comité asignado.</Text>
              )}
            </View>
          ) : null}

          {canEditBrand ? (
            <View style={{ gap: 12 }}>
              <Text style={s.sectionTitle}>Correo de recuperación</Text>
              <View style={s.goldRule} />
              <Text style={s.meta}>
                A este correo se envía el enlace si olvidas tu contraseña.
              </Text>

              {recoveryLoading ? (
                <ActivityIndicator color={p.primary} />
              ) : (
                <TextInput
                  value={recoveryEmail}
                  onChangeText={setRecoveryEmail}
                  placeholder="admin@ejemplo.com"
                  placeholderTextColor={p.textSoft}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={s.input}
                />
              )}

              {recoveryEmail.toLowerCase().endsWith(`@${AUTH_EMAIL_DOMAIN}`) ? (
                <Text style={s.error}>
                  Ese correo no puede recibir mensajes. Usa un correo personal (por ejemplo
                  @gmail.com).
                </Text>
              ) : null}

              <Pressable
                disabled={recoverySaving || recoveryLoading}
                onPress={saveRecoveryEmail}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: recoverySaving || recoveryLoading ? 0.5 : pressed ? 0.7 : 1 },
                ]}>
                <Text style={s.primaryButtonText}>
                  {recoverySaving ? "Guardando…" : "Guardar correo"}
                </Text>
              </Pressable>

              {recoveryError ? <Text style={s.error}>{recoveryError}</Text> : null}
              {recoveryNotice ? <Text style={s.meta}>{recoveryNotice}</Text> : null}
            </View>
          ) : null}

          <ThemeSelector />

          <View style={{ gap: 8 }}>
            <Text style={s.sectionTitle}>Sesión</Text>
            <View style={s.goldRule} />
            <Pressable
              onPress={() => signOut()}
              style={({ pressed }) => [s.linkWrap, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={s.link}>Cerrar sesión</Text>
            </Pressable>
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}
          {notice ? <Text style={s.meta}>{notice}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
