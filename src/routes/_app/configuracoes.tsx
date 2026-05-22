import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { translateError, firstZodMessage } from "@/lib/errors";
import { passwordChangeSchema } from "@/lib/validators";
import { Loader2, Lock, User } from "lucide-react";

export const Route = createFileRoute("/_app/configuracoes")({
  component: ConfigPage,
  head: () => ({
    meta: [
      { title: "Configurações | CT Aquiles" },
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
    // valida senha atual via signIn
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: user.email, password: pwd.atual,
    });
    if (signErr) {
      setSavingPwd(false);
      toast.error("Senha atual incorreta");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pwd.nova });
    setSavingPwd(false);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Senha atualizada com sucesso");
    setPwd({ atual: "", nova: "", confirma: "" });
  };

  return (
    <div>
      <PageHeader title="Configurações" description="Conta e academia" />

      <div className="space-y-6 max-w-2xl">
        <Card className="p-6 gradient-card border-border space-y-4">
          <div className="flex items-center gap-2"><User className="h-4 w-4 text-primary"/><h3 className="font-semibold">Perfil</h3></div>
          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <Label>Nome completo</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1.5"/>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={profile?.email ?? ""} disabled className="mt-1.5"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Papéis</Label>
                <Input value={roles.join(", ")} disabled className="mt-1.5"/>
              </div>
              <div>
                <Label>ID da academia</Label>
                <Input value={profile?.tenant_id ?? ""} disabled className="mt-1.5 font-mono text-xs"/>
              </div>
            </div>
            <Button type="submit" className="gradient-primary text-primary-foreground" disabled={savingProfile}>
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin"/> : "Salvar perfil"}
            </Button>
          </form>
        </Card>

        {isAdmin && (
          <Card className="p-6 gradient-card border-border space-y-4">
            <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary"/><h3 className="font-semibold">Alterar senha</h3></div>
            <p className="text-xs text-muted-foreground">Apenas administradores da academia podem alterar a senha.</p>
            <form onSubmit={changePwd} className="space-y-3">
              <div>
                <Label>Senha atual</Label>
                <PasswordInput required value={pwd.atual} onChange={(e)=>setPwd({...pwd, atual: e.target.value})} className="mt-1.5"/>
              </div>
              <div>
                <Label>Nova senha (mín. 8)</Label>
                <PasswordInput required minLength={8} value={pwd.nova} onChange={(e)=>setPwd({...pwd, nova: e.target.value})} className="mt-1.5"/>
              </div>
              <div>
                <Label>Confirmar nova senha</Label>
                <PasswordInput required value={pwd.confirma} onChange={(e)=>setPwd({...pwd, confirma: e.target.value})} className="mt-1.5"/>
              </div>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={savingPwd}>
                {savingPwd ? <Loader2 className="h-4 w-4 animate-spin"/> : "Atualizar senha"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
