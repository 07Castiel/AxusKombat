import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { AuthProvider } from "@/hooks/use-auth";
import { useVisitorTracking } from "@/hooks/use-visitor-tracking";
import { Toaster } from "@/components/ui/sonner";
import { translateError } from "@/lib/errors";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Axus Kombat — Sistema de Gestão" },
      { name: "description", content: "Sistema de gestão de academias de artes marciais — Axus Kombat" },
      { name: "theme-color", content: "#000000" },
      { property: "og:title", content: "Axus Kombat — Sistema de Gestão" },
      { name: "twitter:title", content: "Axus Kombat — Sistema de Gestão" },
      { property: "og:description", content: "Sistema de gestão de academias de artes marciais — Axus Kombat" },
      { name: "twitter:description", content: "Sistema de gestão de academias de artes marciais — Axus Kombat" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Rajdhani:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorBoundary,
  notFoundComponent: NotFound,
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
        <TrackingBridge />
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function TrackingBridge() {
  useVisitorTracking();
  return null;
}

function RootErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const msg = translateError(error);
  if (typeof console !== "undefined") console.error("[AppError]", error);
  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="max-w-md w-full text-center space-y-4 p-6 border border-border rounded-md bg-card">
        <h1 className="font-display text-xl text-foreground">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground">{msg}</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => { reset(); if (typeof window !== "undefined") window.location.reload(); }}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Tentar novamente
          </button>
          <Link to="/" className="px-4 py-2 rounded-md border border-border text-sm">Ir para o início</Link>
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="max-w-md w-full text-center space-y-4 p-6">
        <h1 className="font-display text-3xl text-foreground">404</h1>
        <p className="text-sm text-muted-foreground">A página que você procura não foi encontrada.</p>
        <Link to="/" className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
