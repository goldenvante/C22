import { useState } from "react";
import { router } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { useCommittee } from "@/branding/useCommittee";
import { EventPickerModal } from "@/features/events/EventPickerModal";
import { HomeScreen, type HomeCard } from "@/components/nav/HomeScreen";
import { hasRole } from "@/lib/supabase";

/**
 * Inicio (control de acceso): Escanear y Boletos (Historial de accesos).
 * Escanear pide el evento en el selector modal: esa ruta exige eventId y la
 * app no guarda un "evento activo". Con el rol seller además, entrada a Ventas.
 */
export default function AccessHome() {
  const { profile, loading } = useAuth();
  const { committee } = useCommittee();
  const [pending, setPending] = useState(false);

  const isSeller = hasRole(profile, "seller");

  const cards: HomeCard[] = [
    {
      key: "escanear",
      label: "Escanear",
      icon: "scan",
      onPress: () => setPending(true),
    },
    { key: "boletos", label: "Boletos", icon: "ticket", href: "/(access)/historial" },
    { key: "meta", label: "Meta", icon: "target", href: "/(access)/ahorro" },
    ...(isSeller
      ? [
          {
            key: "ventas",
            label: "Ventas",
            icon: "sale" as const,
            href: "/(seller)",
          },
        ]
      : []),
  ];

  return (
    <HomeScreen
      committee={committee?.nombre}
      welcome={profile ? `Bienvenido, ${profile.nombre || profile.usuario}` : null}
      loading={loading || !profile}
      cards={cards}>
      <EventPickerModal
        visible={pending}
        onClose={() => setPending(false)}
        onSelect={(eventId) =>
          router.push({ pathname: "/(access)/escanear", params: { eventId } })
        }
      />
    </HomeScreen>
  );
}
