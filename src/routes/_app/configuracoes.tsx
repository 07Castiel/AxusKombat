import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/configuracoes")({ component: ConfigPage });

function ConfigPage() {
  const { profile, roles } = useAuth();
  return (
    <div>
      <PageHeader title="Configurações" description="Conta e academia" />
      <Card className="p-6 gradient-card border-border max-w-2xl space-y-3">
        <div><p className="text-xs uppercase text-muted-foreground">Nome</p><p className="font-semibold">{profile?.nome_completo}</p></div>
        <div><p className="text-xs uppercase text-muted-foreground">E-mail</p><p className="font-semibold">{profile?.email}</p></div>
        <div><p className="text-xs uppercase text-muted-foreground">Papéis</p><p className="font-semibold">{roles.join(", ")}</p></div>
        <div><p className="text-xs uppercase text-muted-foreground">Academia (tenant)</p><p className="font-mono text-xs">{profile?.tenant_id}</p></div>
      </Card>
    </div>
  );
}
