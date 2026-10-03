import { useAuth } from "@/auth/AuthProvider";
import { useCommittee } from "@/branding/useCommittee";
import { HomeScreen, type HomeCard } from "@/components/nav/HomeScreen";

/**
 * Inicio (admin): retícula de accesos de navegación pura (sin métricas ni
 * descripciones). La lista de eventos vive en /(admin)/events.
 */
export default function AdminHome() {
  const { profile, loading } = useAuth();
  const { committee } = useCommittee();

  const cards: HomeCard[] = [
    { key: "nueva-venta", label: "Nueva venta", icon: "sale", href: "/(seller)/nueva-venta" },
    { key: "usuarios", label: "Usuarios", icon: "users", href: "/(admin)/usuarios" },
    { key: "evento", label: "Evento", icon: "calendar", href: "/(admin)/events" },
    { key: "meta", label: "Meta", icon: "target", href: "/(admin)/ahorro" },
    { key: "boletos", label: "Boletos", icon: "ticket", href: "/(admin)/boletos" },
  ];

  return (
    <HomeScreen
      committee={committee?.nombre}
      welcome={profile ? `Bienvenido, ${profile.nombre || profile.usuario}` : null}
      loading={loading || !profile}
      cards={cards}
    />
  );
}
