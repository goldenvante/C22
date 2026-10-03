import { router } from "expo-router";

import { hasRole, type Profile } from "@/lib/supabase";

/**
 * Navegación por texto. Los tipos de ruta (`expo-router` typed routes) se
 * regeneran con `expo start`; como el sidebar y la barra inferior resuelven
 * las rutas en runtime por rol, el cast vive SOLO aquí.
 */
export function pushRoute(href: string): void {
  router.push(href as never);
}

export function replaceRoute(href: string): void {
  router.replace(href as never);
}

export type NavItem = {
  label: string;
  /** Ruta de expo-router. Vacío cuando el ítem es una acción local. */
  href: string;
  action?: "signOut" | "pickLista";
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export type HomeGroup = "(admin)" | "(seller)" | "(access)";

/**
 * Grupo de destino por rol: admin > seller > access (igual que RouteGate).
 * Sin barra inicial, que es como `useSegments()` devuelve `segments[0]`.
 */
export function homeGroup(profile: Profile | null): HomeGroup {
  if (hasRole(profile, "admin")) return "(admin)";
  if (hasRole(profile, "seller")) return "(seller)";
  return "(access)";
}

/** Ruta navegable del inicio por rol (con barra inicial). */
export function homeHref(profile: Profile | null): `/${HomeGroup}` {
  return `/${homeGroup(profile)}`;
}

/** Pantalla de configuración alcanzable por el rol. */
export function configHref(profile: Profile | null): string {
  return `${homeHref(profile)}/configuracion`;
}

/**
 * Grupos del sidebar. Solo rutas que YA existen y que el rol puede alcanzar
 * (mismos grupos que RouteGate: admin llega a (admin) y (seller); el admin
 * nunca entra a (access)). Sin métricas ni descripciones: solo navegación.
 */
export function navGroups(profile: Profile | null): NavGroup[] {
  const isAdmin = hasRole(profile, "admin");
  const isSeller = hasRole(profile, "seller");
  const isAccess = hasRole(profile, "access");
  const groups: NavGroup[] = [];

  if (isAdmin) {
    groups.push({
      title: "Administración",
      items: [
        { label: "Usuarios", href: "/(admin)/usuarios" },
        { label: "Eventos", href: "/(admin)/events" },
        { label: "Boletos", href: "/(admin)/boletos" },
        { label: "Ventas", href: "/(admin)/ventas" },
        { label: "Cortesías", href: "/(admin)/cortesias" },
        { label: "Reporte de ventas", href: "/(admin)/reporte" },
        { label: "Meta", href: "/(admin)/ahorro" },
      ],
    });
  }

  // El flujo de venta compartido vive en (seller); el admin también vende.
  if (isAdmin || isSeller) {
    groups.push({
      title: "Ventas",
      items: [
        { label: "Nueva venta", href: "/(seller)/nueva-venta" },
        { label: "Mis ventas", href: "/(seller)/ventas" },
        { label: "Boletos de cortesía", href: "/(seller)/cortesia" },
      ],
    });
  }

  // El vendedor sin admin también tiene sus pantallas de evento y boletos
  // (el admin ya los tiene en Administración, con alcance de comité).
  if (isSeller && !isAdmin) {
    groups.push({
      title: "Eventos y boletos",
      items: [
        { label: "Eventos", href: "/(seller)/events" },
        { label: "Boletos", href: "/(seller)/boletos" },
      ],
    });
  }

  if (isAccess) {
    groups.push({
      title: "Acceso",
      items: [
        // Requiere eventId: el sidebar abre el selector antes de navegar.
        { label: "Lista de puerta", href: "/(access)/lista", action: "pickLista" },
        { label: "Historial", href: "/(access)/historial" },
        { label: "Meta", href: "/(access)/ahorro" },
      ],
    });
  }

  // "Ajustes" y no "Configuración": la barra inferior ya usa "Config. evento"
  // para la lista de eventos y el admin confundía las dos.
  groups.push({
    title: "Ajustes",
    items: [
      { label: "Ajustes", href: configHref(profile) },
      { label: "Cerrar sesión", href: "", action: "signOut" },
    ],
  });

  return groups;
}
