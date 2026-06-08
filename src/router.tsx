import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { translateError } from "@/lib/errors";

function showError(err: unknown) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.error("[GlobalError]", err);
  try { toast.error(translateError(err)); } catch { /* noop */ }
}

let listenersInstalled = false;
function installGlobalListeners() {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  window.addEventListener("unhandledrejection", (e) => showError(e.reason));
  window.addEventListener("error", (e) => showError(e.error ?? e.message));
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
      },
      mutations: {
        onError: (err) => showError(err),
      },
    },
  });

  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action?.type === "error") {
      showError(event.action.error);
    }
  });

  installGlobalListeners();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
