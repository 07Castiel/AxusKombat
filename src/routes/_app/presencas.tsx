import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/errors";
import { toISODate } from "@/lib/utils";
import { togglePresenca } from "@/lib/presencas.functions";

export const Route = createFileRoute("/_app/presencas")({
  component: PresencasPage,
  head: () => ({
    meta: [
      { title: "Presenças | Axus Kombat" },
      { name: "description", content: "Controle de presença e check-in de alunos." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const DIAS_LABEL: Record<string, string> = {
  segunda: "Segunda", terca: "Terça", quarta: "Quarta", quinta: "Quinta",
  sexta: "Sexta", sabado: "Sábado", domingo: "Domingo",
};
const DOW_TO_DIA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

function PresencasPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toggleFn = useServerFn(togglePresenca);

  const [data, setData] = useState(toISODate(new Date()));
  const [horarioId, setHorarioId] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);

  const diaSelecionado = DOW_TO_DIA[new Date(data + "T00:00:00").getDay()];

  const { data: horarios = [] } = useQuery({
    queryKey: ["horarios-presenca", profile?.tenant_id, diaSelecionado],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("horarios").select("*, modalidades(nome)")
        .eq("ativo", true).eq("dia", diaSelecionado).order("hora");
      if (error) throw error;
      return data ?? [];
    },
  });

  const horarioAtual = useMemo(() => horarios.find((h: any) => h.id === horarioId), [horarios, horarioId]);

  const { data: alunos = [] } = useQuery({
    queryKey: ["alunos-presenca", profile?.tenant_id, horarioAtual?.categoria],
    enabled: !!profile?.tenant_id && !!horarioAtual,
    queryFn: async () => {
      let q = supabase.from("alunos").select("id, nome_completo, categoria").eq("status", "ativo").order("nome_completo");
      if (horarioAtual?.categoria) q = q.eq("categoria", horarioAtual.categoria);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: presencas = [] } = useQuery({
    queryKey: ["presencas", horarioId, data],
    enabled: !!horarioId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("presencas").select("aluno_id, presente")
        .eq("horario_id", horarioId).eq("data", data);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const presencaMap = useMemo(() => {
    const m = new Map<string, boolean>();
    presencas.forEach((p: any) => m.set(p.aluno_id, p.presente));
    return m;
  }, [presencas]);

  const togglePresente = async (alunoId: string, presente: boolean) => {
    if (!horarioId) return;
    setSaving(alunoId);
    try {
      await toggleFn({ data: { horario_id: horarioId, aluno_id: alunoId, data, presente }});
      qc.invalidateQueries({ queryKey: ["presencas", horarioId, data] });
    } catch (err: any) { toast.error(translateError(err)); }
    finally { setSaving(null); }
  };

  const presentes = presencas.filter((p: any) => p.presente).length;
  const ocupacao = horarioAtual?.capacidade_maxima ? Math.round((presentes / horarioAtual.capacidade_maxima) * 100) : null;

  return (
    <div>
      <PageHeader title="Presenças / Check-in" description="Registre presença dos alunos por aula" />

      <Card className="p-4 gradient-card border-border mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => { setData(e.target.value); setHorarioId(""); }} className="mt-1.5"/>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              {DIAS_LABEL[diaSelecionado]}
            </p>
          </div>
          <div>
            <Label>Horário ({horarios.length} disponíveis)</Label>
            <Select value={horarioId} onValueChange={setHorarioId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o horário"/></SelectTrigger>
              <SelectContent>
                {horarios.length === 0 && <SelectItem disabled value="empty">Sem aulas neste dia</SelectItem>}
                {horarios.map((h: any) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.hora?.slice(0,5)} — {h.modalidades?.nome} {h.professor ? `· ${h.professor}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {horarioAtual && (
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <Card className="p-4 gradient-card border-border">
            <p className="text-xs uppercase text-muted-foreground">Presentes</p>
            <p className="text-2xl font-bold text-success mt-1">{presentes} / {alunos.length}</p>
          </Card>
          <Card className="p-4 gradient-card border-border">
            <p className="text-xs uppercase text-muted-foreground">Capacidade</p>
            <p className="text-2xl font-bold mt-1">{horarioAtual.capacidade_maxima ?? "—"}</p>
          </Card>
          <Card className="p-4 gradient-card border-border">
            <p className="text-xs uppercase text-muted-foreground">Ocupação</p>
            <p className={`text-2xl font-bold mt-1 ${ocupacao && ocupacao > 90 ? "text-destructive" : "text-primary"}`}>
              {ocupacao !== null ? `${ocupacao}%` : "—"}
            </p>
          </Card>
        </div>
      )}

      {horarioId && (
        <Card className="gradient-card border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Presente</TableHead>
                <TableHead>Aluno</TableHead>
                <TableHead className="w-24 text-xs uppercase">Categoria</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alunos.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50"/>Nenhum aluno ativo nesta categoria
                </TableCell></TableRow>
              )}
              {alunos.map((a: any) => {
                const isPresent = presencaMap.get(a.id) ?? false;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Checkbox
                        checked={isPresent}
                        disabled={saving === a.id}
                        onCheckedChange={(v) => togglePresente(a.id, !!v)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{a.nome_completo}</TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">{a.categoria}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {!horarioId && (
        <Card className="p-12 gradient-card border-border text-center text-muted-foreground">
          <CalendarCheck className="h-12 w-12 mx-auto mb-3 opacity-40"/>
          <p className="text-sm">Selecione data e horário para iniciar a chamada.</p>
        </Card>
      )}
    </div>
  );
}
