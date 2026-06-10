import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { masterGetTenant } from "@/lib/master.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ArrowLeft } from "lucide-react";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const Route = createFileRoute("/admin-master/tenant/$id")({
  head: () => ({ meta: [{ title: "Admin Master · Academia" }, { name: "robots", content: "noindex, nofollow" }] }), component: MasterTenantDetail });

function MasterTenantDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(masterGetTenant);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem("master_token");
    if (!t) { navigate({ to: "/admin-master" }); return; }
    setToken(t);
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["master-tenant", id, token],
    enabled: !!token,
    queryFn: () => get({ data: { token: token!, tenantId: id } }),
  });

  useEffect(() => {
    if (error) {
      sessionStorage.removeItem("master_token");
      navigate({ to: "/admin-master" });
    }
  }, [error, navigate]);

  const t = data?.tenant;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild size="icon" variant="ghost">
              <Link to="/admin-master/dashboard"><ArrowLeft className="h-4 w-4"/></Link>
            </Button>
            <div className="h-9 w-9 rounded-md gradient-primary grid place-items-center shadow-glow">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold">{t?.nome ?? "Carregando..."}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Detalhes da academia</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}

        {t && (
          <Card className="p-6 gradient-card border-border mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Info label="Responsável" value={t.responsavel_nome} />
              <Info label="E-mail" value={t.responsavel_email} />
              <Info label="Telefone" value={t.telefone} />
              <Info label="CNPJ/CPF" value={t.cnpj_cpf} />
              <Info label="Slug" value={t.slug} />
              <Info label="Status" value={t.ativo ? "Ativa" : "Inativa"} />
              <Info label="Cadastro" value={fmtDate(t.created_at)} />
              <Info label="ID" value={t.id} mono />
            </div>
          </Card>
        )}

        <Tabs defaultValue="alunos">
          <TabsList>
            <TabsTrigger value="alunos">Alunos ({data?.alunos.length ?? 0})</TabsTrigger>
            <TabsTrigger value="contratos">Contratos ({data?.contratos.length ?? 0})</TabsTrigger>
            <TabsTrigger value="mensalidades">Mensalidades ({data?.mensalidades.length ?? 0})</TabsTrigger>
            <TabsTrigger value="horarios">Horários ({data?.horarios.length ?? 0})</TabsTrigger>
            <TabsTrigger value="graduacoes">Graduações ({data?.graduacoes.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="alunos">
            <Card className="gradient-card border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Status</TableHead><TableHead>Telefone</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data?.alunos.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.nome_completo}</TableCell>
                      <TableCell className="capitalize">{a.categoria}</TableCell>
                      <TableCell className="capitalize">{a.status}</TableCell>
                      <TableCell>{a.telefone ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="contratos">
            <Card className="gradient-card border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Plano</TableHead><TableHead>Mensalidade</TableHead><TableHead>Dia venc.</TableHead><TableHead>Início</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data?.contratos.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.alunos?.nome_completo}</TableCell>
                      <TableCell>{c.planos?.nome ?? "—"}</TableCell>
                      <TableCell>{fmtMoney(Number(c.valor_mensalidade))}</TableCell>
                      <TableCell>{c.dia_vencimento}</TableCell>
                      <TableCell>{fmtDate(c.data_inicio)}</TableCell>
                      <TableCell className="capitalize">{c.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="mensalidades">
            <Card className="gradient-card border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Competência</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead><TableHead>Pago em</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data?.mensalidades.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.alunos?.nome_completo}</TableCell>
                      <TableCell>{fmtDate(m.competencia)}</TableCell>
                      <TableCell>{fmtDate(m.data_vencimento)}</TableCell>
                      <TableCell>{fmtMoney(Number(m.valor_final ?? m.valor))}</TableCell>
                      <TableCell>{fmtDate(m.data_pagamento)}</TableCell>
                      <TableCell className="capitalize">{m.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="horarios">
            <Card className="gradient-card border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Dia</TableHead><TableHead>Hora</TableHead><TableHead>Modalidade</TableHead><TableHead>Categoria</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data?.horarios.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="capitalize">{h.dia}</TableCell>
                      <TableCell>{String(h.hora).slice(0,5)}{h.hora_fim ? `–${String(h.hora_fim).slice(0,5)}` : ""}</TableCell>
                      <TableCell>{h.modalidades?.nome}</TableCell>
                      <TableCell className="capitalize">{h.categoria}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="graduacoes">
            <Card className="gradient-card border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Ordem</TableHead><TableHead>Cor</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data?.graduacoes.map((g: any) => (
                    <TableRow key={g.id}>
                      <TableCell>{g.nome}</TableCell>
                      <TableCell className="capitalize">{g.categoria}</TableCell>
                      <TableCell>{g.ordem}</TableCell>
                      <TableCell><span className="inline-block h-4 w-8 rounded" style={{ background: g.cor }}/></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}
