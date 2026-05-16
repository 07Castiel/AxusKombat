import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { fmtMoney, fmtDate, toISODate } from "@/lib/utils";

export const Route = createFileRoute("/_app/pagamentos")({ component: PagamentosPage });

function PagamentosPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const { data: pagamentos = [] } = useQuery({
    queryKey: ["pagamentos", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => (await supabase.from("pagamentos").select("*, alunos(nome_completo)").order("data_vencimento", { ascending: false })).data ?? [],
  });

  const marcarPago = async (id: string, metodo: "pix" | "dinheiro" | "cartao") => {
    const { error } = await supabase.from("pagamentos").update({ status: "pago", data_pagamento: toISODate(new Date()), metodo }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pagamento confirmado");
    qc.invalidateQueries({ queryKey: ["pagamentos"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div>
      <PageHeader title="Pagamentos" description="Controle financeiro de mensalidades" />
      <Card className="gradient-card border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Pago em</TableHead><TableHead>Método</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader>
          <TableBody>
            {pagamentos.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum pagamento</TableCell></TableRow>}
            {pagamentos.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.alunos?.nome_completo}</TableCell>
                <TableCell className="font-semibold">{fmtMoney(Number(p.valor))}</TableCell>
                <TableCell className="text-sm">{fmtDate(p.data_vencimento)}</TableCell>
                <TableCell className="text-sm">{fmtDate(p.data_pagamento)}</TableCell>
                <TableCell className="text-sm uppercase">{p.metodo}</TableCell>
                <TableCell><StatusBadge status={p.status}/></TableCell>
                <TableCell className="text-right">
                  {p.status !== "pago" && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={()=>marcarPago(p.id, "pix")}>PIX</Button>
                      <Button size="sm" variant="ghost" onClick={()=>marcarPago(p.id, "dinheiro")}>$</Button>
                      <Button size="sm" variant="ghost" onClick={()=>marcarPago(p.id, "cartao")}>Cartão</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
