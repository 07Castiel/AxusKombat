import { createFileRoute, redirect } from "@tanstack/react-router";

// Stub: rota antiga de cadastro. Mantida para não quebrar bookmarks/links externos.
// Todo o fluxo de criação de conta agora acontece em /precos.
export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    throw redirect({ to: "/precos" });
  },
  component: () => null,
});
