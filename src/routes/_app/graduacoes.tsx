import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/graduacoes")({ component: GraduacoesPage });

function GraduacoesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", cor: "#dc2626", ordem: "0", categoria: "adulto" as "adulto"|"kids" });

  const { data: graduacoes = [] } = useQuery({
    queryKey: ["graduacoes", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => (await supabase.from("graduacoes").select("*").order("ordem")).data ?? [],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id) return;
    const { error } = await supabase.from("graduacoes").insert({
      tenant_id: profile.tenant_id, nome: form.nome, cor: form.cor, ordem: Number(form.ordem), categoria: form.categoria,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Graduação criada");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["graduacoes"] });
  };

  return (
    <div>
      <PageHeader title="Graduações" description="Faixas e prajieds"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2"/>Nova graduação</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova graduação</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Nome</Label><Input required value={form.nome} onChange={(e)=>setForm({...form, nome: e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Cor</Label><Input type="color" value={form.cor} onChange={(e)=>setForm({...form, cor: e.target.value})}/></div>
                  <div><Label>Ordem</Label><Input type="number" value={form.ordem} onChange={(e)=>setForm({...form, ordem: e.target.value})}/></div>
                </div>
                <div><Label>Categoria</Label>
                  <Select value={form.categoria} onValueChange={(v: "adulto"|"kids")=>setForm({...form, categoria: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="adulto">Adulto</SelectItem><SelectItem value="kids">Kids</SelectItem></SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground">Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {graduacoes.length === 0 && <p className="text-sm text-muted-foreground col-span-full">Nenhuma graduação cadastrada.</p>}
        {graduacoes.map((g: any) => (
          <Card key={g.id} className="p-4 gradient-card border-border flex items-center gap-3">
            <div className="h-10 w-3 rounded-full" style={{ background: g.cor }}/>
            <div>
              <p className="font-semibold">{g.nome}</p>
              <p className="text-xs text-muted-foreground capitalize">{g.categoria} · ordem {g.ordem}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
