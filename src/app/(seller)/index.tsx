import { useState } from "react";
import { router } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { useCommittee } from "@/branding/useCommittee";
import { EventPickerModal } from "@/features/events/EventPickerModal";
import { HomeScreen, type HomeCard } from "@/components/nav/HomeScreen";
import { hasRole } from "@/lib/supabase";

/**
 * Inicio (vendedor): sus ventanas cambian con el rol. Con access también,
 * se añade Escanear (que pide el evento en el selector modal, porque esa
 * ruta exige eventId y la app no guarda un evento activo).
 */
export default function SellerHome() {
  const { profile, loading } = useAuth();
  const { committee } = useCommittee();
  const [pending, setPending] = useState(false);

  const isAccess = hasRole(profile, "access");

  const cards: HomeCard[] = [
    { key: "nueva-venta", label: "Nueva venta", icon: "sale", href: "/(seller)/nueva-venta" },
    { key: "boletos", label: "Boletos", icon: "ticket", href: "/(seller)/boletos" },
    { key: "eventos", label: "Eventos", icon: "calendar", href: "/(seller)/events" },
    { key: "meta", label: "Meta", icon: "target", href: "/(seller)/ahorro" },
    ...(isAccess
      ? [
          {
            key: "escanear",
            label: "Escanear",
            icon: "scan" as const,
            onPress: () => setPending(true),
          },
        ]
      : []),
  ];

  return (
    <HomeScreen
      committee={committee?.nombre}
      welcome={profile ? `Bienvenido, ${profile.nombre || profile.usuario}` : null}
      logo={committee?.logo_url}
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
