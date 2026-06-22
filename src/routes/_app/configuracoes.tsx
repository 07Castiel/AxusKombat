import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/PasswordInput";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { translateError, firstZodMessage } from "@/lib/errors";
import { passwordChangeSchema } from "@/lib/validators";
import { Loader2, Lock, User, Building2, Bell } from "lucide-react";
import { getTenantConfig, updateTenantConfig } from "@/lib/tenant.functions";

export const Route = createFileRoute("/_app/configuracoes")({
  component: ConfigPage,
  head: () => ({
    meta: [
      { title: "Configurações | Axus Kombat" },
      { name: "description", content: "Configurações da academia e da conta administrativa." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function ConfigPage() {
  const { profile, roles, isAdmin, refresh, user } = useAuth();
  const [nome, setNome] = useState(profile?.nome_completo ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwd, setPwd] = useState({ atual: "", nova: "", confirma: "" });
  const [savingPwd, setSavingPwd] = useState(false);

  const getConfig = useServerFn(getTenantConfig);
  const saveConfig = useServerFn(updateTenantConfig);
  const { data: tenant, refetch: refetchTenant } = useQuery({
    queryKey: ["tenant-config", profile?.tenant_id],
    enabled: !!profile?.tenant_id && isAdmin,
    queryFn: () => getConfig({}),
  });

  const [academia, setAcademia] = useState({
    nome: "", nome_fantasia: "", cnpj_cpf: "", telefone: "", responsavel_nome: "", responsavel_email: "",
    endereco: "", logo_url: "", pix_chave: "", pix_titular: "", banco: "",
    notif_hora_envio: "09:00", notif_lembretes_ativos: true,
  });
  const [savingAcademia, setSavingAcademia] = useState(false);

  useEffect(() => {
    if (tenant) {
      setAcademia({
        nome: tenant.nome ?? "",
        nome_fantasia: tenant.nome_fantasia ?? "",
        cnpj_cpf: tenant.cnpj_cpf ?? "",
        telefone: tenant.telefone ?? "",
        responsavel_nome: tenant.responsavel_nome ?? "",
        responsavel_email: tenant.responsavel_email ?? "",
        endereco: tenant.endereco ?? "",
        logo_url: tenant.logo_url ?? "",
        pix_chave: tenant.pix_chave ?? "",
        pix_titular: tenant.pix_titular ?? "",
        banco: tenant.banco ?? "",
        notif_hora_envio: tenant.notif_hora_envio ?? "09:00",
        notif_lembretes_ativos: tenant.notif_lembretes_ativos ?? true,
      });
    }
  }, [tenant]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ nome_completo: nome }).eq("id", profile.id);
    setSavingProfile(false);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Perfil atualizado");
    await refresh();
  };

  const changePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordChangeSchema.safeParse(pwd);
    if (!parsed.success) { toast.error(firstZodMessage(parsed.error)); return; }
    if (!user?.email) return;
    setSavingPwd(true);
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwd.atual });
    if (signErr) { setSavingPwd(false); toast.error("Senha atual incorreta"); return; }
    const { error } = await supabase.auth.updateUser({ password: pwd.nova });
    setSavingPwd(false);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Senha atualizada com sucesso");
    setPwd({ atual: "", nova: "", confirma: "" });
  };

  const saveAcademia = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAcademia(true);
    try {
      await saveConfig({ data: academia });
      toast.success("Dados da academia atualizados");
      refetchTenant();
    } catch (err: any) { toast.error(translateError(err)); }
    finally { setSavingAcademia(false); }
  };

  return (
    <div>
      <PageHeader title="Configurações" description="Conta, academia e notificações" />

      <Tabs defaultValue="perfil" className="max-w-3xl">
        <TabsList>
          <TabsTrigger value="perfil"><User className="h-3.5 w-3.5 mr-1.5"/>Perfil</TabsTrigger>
          {isAdmin && <TabsTrigger value="academia"><Building2 className="h-3.5 w-3.5 mr-1.5"/>Academia</TabsTrigger>}
          {isAdmin && <TabsTrigger value="notif"><Bell className="h-3.5 w-3.5 mr-1.5"/>Notificações</TabsTrigger>}
          {isAdmin && <TabsTrigger value="seguranca"><Lock className="h-3.5 w-3.5 mr-1.5"/>Segurança</TabsTrigger>}
        </TabsList>

        <TabsContent value="perfil">
          <Card className="p-6 gradient-card border-border space-y-4">
            <form onSubmit={saveProfile} className="space-y-3">
              <div><Label>Nome completo</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1.5"/></div>
              <div><Label>E-mail</Label><Input value={profile?.email ?? ""} disabled className="mt-1.5"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Papéis</Label><Input value={roles.join(", ")} disabled className="mt-1.5"/></div>
                <div><Label>ID da academia</Label><Input value={profile?.tenant_id ?? ""} disabled className="mt-1.5 font-mono text-xs"/></div>
              </div>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={savingProfile}>
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin"/> : "Salvar perfil"}
              </Button>
            </form>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="academia">
            <Card className="p-6 gradient-card border-border space-y-4">
              <form onSubmit={saveAcademia} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label>Nome (razão social) *</Label><Input required value={academia.nome} onChange={(e) => setAcademia({...academia, nome: e.target.value})}/></div>
                  <div><Label>Nome fantasia</Label><Input value={academia.nome_fantasia} onChange={(e) => setAcademia({...academia, nome_fantasia: e.target.value})}/></div>
                  <div><Label>CNPJ / CPF</Label><Input value={academia.cnpj_cpf} onChange={(e) => setAcademia({...academia, cnpj_cpf: e.target.value})}/></div>
                  <div><Label>Telefone</Label><Input value={academia.telefone} onChange={(e) => setAcademia({...academia, telefone: e.target.value})}/></div>
                  <div><Label>Responsável</Label><Input value={academia.responsavel_nome} onChange={(e) => setAcademia({...academia, responsavel_nome: e.target.value})}/></div>
                  <div><Label>E-mail responsável</Label><Input type="email" value={academia.responsavel_email} onChange={(e) => setAcademia({...academia, responsavel_email: e.target.value})}/></div>
                  <div className="md:col-span-2"><Label>Endereço</Label><Textarea rows={2} value={academia.endereco} onChange={(e) => setAcademia({...academia, endereco: e.target.value})}/></div>
                  <div className="md:col-span-2"><Label>URL do logo</Label><Input value={academia.logo_url} onChange={(e) => setAcademia({...academia, logo_url: e.target.value})}/></div>
                </div>

                <div className="pt-3 border-t border-border">
                  <h4 className="text-xs uppercase tracking-widest text-metal mb-2">Dados bancários / PIX</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><Label>Chave PIX</Label><Input value={academia.pix_chave} onChange={(e) => setAcademia({...academia, pix_chave: e.target.value})}/></div>
                    <div><Label>Titular</Label><Input value={academia.pix_titular} onChange={(e) => setAcademia({...academia, pix_titular: e.target.value})}/></div>
                    <div><Label>Banco</Label><Input value={academia.banco} onChange={(e) => setAcademia({...academia, banco: e.target.value})}/></div>
                  </div>
                </div>

                <Button type="submit" className="gradient-primary text-primary-foreground" disabled={savingAcademia}>
                  {savingAcademia ? <Loader2 className="h-4 w-4 animate-spin"/> : "Salvar dados"}
                </Button>
              </form>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="notif">
            <Card className="p-6 gradient-card border-border space-y-4">
              <form onSubmit={saveAcademia} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Lembretes automáticos de mensalidade</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Envia avisos 7 dias antes, 3 dias antes e no vencimento.</p>
                  </div>
                  <Switch
                    checked={academia.notif_lembretes_ativos}
                    onCheckedChange={(v) => setAcademia({...academia, notif_lembretes_ativos: v})}
                  />
                </div>
                <div>
                  <Label>Horário padrão de envio</Label>
                  <Input type="time" value={academia.notif_hora_envio} onChange={(e) => setAcademia({...academia, notif_hora_envio: e.target.value})} className="mt-1.5 max-w-xs"/>
                  <p className="text-xs text-muted-foreground mt-1">As notificações são enviadas a partir deste horário no fuso da academia.</p>
                </div>
                <Button type="submit" className="gradient-primary text-primary-foreground" disabled={savingAcademia}>
                  {savingAcademia ? <Loader2 className="h-4 w-4 animate-spin"/> : "Salvar"}
                </Button>
              </form>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="seguranca">
            <Card className="p-6 gradient-card border-border space-y-4">
              <form onSubmit={changePwd} className="space-y-3">
                <div><Label>Senha atual</Label><PasswordInput required value={pwd.atual} onChange={(e) => setPwd({...pwd, atual: e.target.value})} className="mt-1.5"/></div>
                <div><Label>Nova senha (mín. 8)</Label><PasswordInput required minLength={8} value={pwd.nova} onChange={(e) => setPwd({...pwd, nova: e.target.value})} className="mt-1.5"/></div>
                <div><Label>Confirmar nova senha</Label><PasswordInput required value={pwd.confirma} onChange={(e) => setPwd({...pwd, confirma: e.target.value})} className="mt-1.5"/></div>
                <Button type="submit" className="gradient-primary text-primary-foreground" disabled={savingPwd}>
                  {savingPwd ? <Loader2 className="h-4 w-4 animate-spin"/> : "Atualizar senha"}
                </Button>
              </form>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
