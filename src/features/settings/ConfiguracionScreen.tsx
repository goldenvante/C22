import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { ThemeSelector } from "@/branding/ThemeSelector";
import { NEUTRAL_BRAND } from "@/branding/palette";
import { normalizeHex, useCommittee } from "@/branding/useCommittee";
import { BackHeader } from "@/components/back-header";
import { ColorField } from "@/components/color-field";
import { homeHref } from "@/components/nav/navModel";
import { updateCommittee } from "@/features/committees/api";
import { useEventStyles } from "@/features/events/eventStyles";
import { hasRole } from "@/lib/supabase";

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
  const [primario, setPrimario] = useState("");
  const [secundario, setSecundario] = useState("");
  const [fondo, setFondo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!committee) return;
    setNombre(committee.nombre);
    setPrimario(committee.color_primario);
    setSecundario(committee.color_secundario);
    setFondo(committee.color_fondo);
    // Solo al cambiar de comité: no pisa lo que el usuario está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committee?.id]);

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
      });
      setNotice("Guardado.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
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
