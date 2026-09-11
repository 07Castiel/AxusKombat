import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/$token")({
  beforeLoad: () => { throw redirect({ to: "/portal", replace: true }); },
  component: () => null,
});
