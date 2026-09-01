import { Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { MODULO_DA_TELA, papeisDaTela, type TelaProtegida } from "@/lib/acesso-telas";
import { podeVer } from "@/lib/permissoes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Guarda de papel para as telas restritas (M1).
 *
 * O AppLayout só escondia o item do menu com `adminOnly`. Quem digitasse
 * /financeiro na barra de endereço abria a tela: o RLS barrava os dados, então
 * não vazava nada, mas o usuário recebia uma página vazia ou um erro cru em vez
 * de saber que aquilo não é para ele.
 *
 * Isto é camada de interface, não de segurança — a trava de verdade continua
 * sendo o RLS e os guardas de servidor. Aqui o objetivo é o usuário entender o
 * que aconteceu.
 */
export function RequireRole({
  papeis,
  children,
}: {
  papeis: readonly AppRole[];
  children: React.ReactNode;
}) {
  const { roles, loading } = useAuth();

  if (loading) return null;
  if (roles.some((r) => papeis.includes(r))) return <>{children}</>;

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <Card className="gradient-card border-border max-w-md p-8 text-center">
        <ShieldOff className="text-muted-foreground mx-auto h-10 w-10" />
        <h1 className="font-display mt-4 text-lg tracking-wider uppercase">Área restrita</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Esta tela é exclusiva da administração da academia. Se você precisa de acesso, peça ao
          responsável para ajustar o seu perfil em Equipe.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/">Voltar ao painel</Link>
        </Button>
      </Card>
    </div>
  );
}

/**
 * Guarda pela tabela de acesso, para menu e rota nunca divergirem.
 * Preferir esta forma a listar papéis à mão em cada tela.
 */
export function RequireTela({
  tela,
  children,
}: {
  tela: TelaProtegida;
  children: React.ReactNode;
}) {
  const { permissoes } = useAuth();
  const modulo = MODULO_DA_TELA[tela];
  // Permissao so restringe: se o papel ja barrou, nem chega aqui. Modulo sem
  // marcacao explicita conta como liberado (perfis nascem com `permissions` {}).
  const bloqueadoPorPermissao = modulo ? !podeVer(permissoes, modulo) : false;
  const papeis = bloqueadoPorPermissao ? [] : papeisDaTela(tela);
  return <RequireRole papeis={papeis}>{children}</RequireRole>;
}
