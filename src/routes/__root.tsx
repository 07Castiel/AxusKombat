import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/hooks/use-auth";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CT Aquiles Fight Team — Sistema de Gestão" },
      { name: "description", content: "Sistema de gestão completo para academia de artes marciais — Muay Thai e Boxe" },
      { name: "theme-color", content: "#0a0a0f" },
      { property: "og:title", content: "CT Aquiles Fight Team — Sistema de Gestão" },
      { name: "twitter:title", content: "CT Aquiles Fight Team — Sistema de Gestão" },
      { property: "og:description", content: "Sistema de gestão completo para academia de artes marciais — Muay Thai e Boxe" },
      { name: "twitter:description", content: "Sistema de gestão completo para academia de artes marciais — Muay Thai e Boxe" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9269f213-6c68-4329-b301-53ec4fdb6c56/id-preview-af1cf5bf--d2383d57-e7ae-483e-b1b2-ed98245a523b.lovable.app-1778951701430.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9269f213-6c68-4329-b301-53ec4fdb6c56/id-preview-af1cf5bf--d2383d57-e7ae-483e-b1b2-ed98245a523b.lovable.app-1778951701430.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
