import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { useCommittee } from "@/branding/useCommittee";
import { EventPickerModal } from "@/features/events/EventPickerModal";
import { useEventStyles } from "@/features/events/eventStyles";
import { navGroups, pushRoute } from "./navModel";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Sidebar accesible desde el menú de tres líneas. Es navegación SECUNDARIA:
 * agrupa las rutas ya existentes por rol (Administración / Ventas / Acceso /
 * Ajustes) y cierra la sesión. No muestra métricas ni descripciones.
 */
export function AppSidebar({ visible, onClose }: Props) {
  const { s, p } = useEventStyles();
  const { profile, signOut } = useAuth();
  const { committee } = useCommittee();
  const groups = navGroups(profile);
  const name = (committee?.nombre ?? "").trim();
  // "Lista de puerta" exige eventId: el sidebar pide el evento antes de ir.
  const [pick, setPick] = useState(false);
  // El Modal sale con statusBarTranslucent y ahí el inset del SafeAreaView no
  // llega a aplicarse: se baja el contenido a mano para que no choque con el
  // notch / la barra de estado.
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 24) + 20;

  function go(href: string) {
    onClose();
    pushRoute(href);
  }

  function close() {
    onClose();
  }

  function run(item: (typeof groups)[number]["items"][number]) {
    if (item.action === "signOut") {
      onClose();
      signOut();
      return;
    }
    if (item.action === "pickLista") {
      onClose();
      setPick(true);
      return;
    }
    go(item.href);
  }

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: p.scrim }}>
        <Pressable
          accessibilityLabel="Cerrar menú"
          onPress={close}
          style={{ flex: 1 }}
        />
        <SafeAreaView edges={["bottom", "right"]} style={{ width: 300, maxWidth: "86%" }}>
          <View
            style={{
              flex: 1,
              backgroundColor: p.surface,
              borderLeftWidth: 1,
              borderColor: p.border,
              paddingHorizontal: 16,
              paddingTop: topPad,
            }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", letterSpacing: 5, color: p.title }}>
                  MONARQ
                </Text>
                {name ? <Text style={s.meta}>{name}</Text> : null}
              </View>
              <Pressable onPress={close} hitSlop={12} style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: p.textSoft }}>{"×"}</Text>
              </Pressable>
            </View>

            <View style={s.goldRule} />

            <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
              {groups.map((group) => (
                <View key={group.title}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      letterSpacing: 2,
                      color: p.textSoft,
                      marginBottom: 2,
                    }}>
                    {group.title.toUpperCase()}
                  </Text>
                  {group.items.map((item) => (
                    <Pressable
                      key={item.label}
                      onPress={() => run(item)}
                      accessibilityRole="button"
                      style={({ pressed }) => ({
                        paddingVertical: 12,
                        paddingHorizontal: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: p.border,
                        opacity: pressed ? 0.7 : 1,
                      })}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: item.action === "signOut" ? p.danger : p.text,
                        }}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>

    <EventPickerModal
      visible={pick}
      onClose={() => setPick(false)}
      onSelect={(eventId) =>
        router.push({ pathname: "/(access)/lista", params: { eventId } })
      }
    />
    </>
  );
}
