import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/horarios")({ component: HorariosPage });

const DIAS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;
const LBL: Record<string, string> = { segunda: "Segunda", terca: "Terça", quarta: "Quarta", quinta: "Quinta", sexta: "Sexta", sabado: "Sábado", domingo: "Domingo" };

function HorariosPage() {
  const { profile } = useAuth();
  const { data: horarios = [] } = useQuery({
    queryKey: ["horarios", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => (await supabase.from("horarios").select("*, modalidades(nome)").order("hora")).data ?? [],
  });

  return (
    <div>
      <PageHeader title="Grade de horários" description="Agenda semanal de aulas" />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {DIAS.map((dia) => {
          const aulas = horarios.filter((h: any) => h.dia === dia);
          return (
            <Card key={dia} className="gradient-card border-border p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">{LBL[dia]}</h3>
              <div className="space-y-2">
                {aulas.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                {aulas.map((a: any) => (
                  <div key={a.id} className={`p-2 rounded-md border-l-2 ${a.categoria === "kids" ? "border-warning bg-warning/5" : "border-primary bg-primary/5"}`}>
                    <p className="text-sm font-semibold">{String(a.hora).slice(0,5)}</p>
                    <p className="text-xs text-muted-foreground">{a.modalidades?.nome} {a.categoria === "kids" ? "Kids" : ""}</p>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
