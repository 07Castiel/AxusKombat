import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PasswordInput } from "@/components/PasswordInput";
import { toast } from "sonner";
import { Swords, Loader2 } from "lucide-react";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "Cadastrar academia | CT Aquiles Fight Team" },
      { name: "description", content: "Crie sua conta no CT Aquiles Fight Team e gerencie alunos, matrículas, pagamentos e graduações da sua academia." },
      { property: "og:title", content: "Cadastrar academia | CT Aquiles Fight Team" },
      { property: "og:description", content: "Crie sua conta e comece a gerenciar sua academia de artes marciais." },
      { property: "og:url", content: "https://ctaquiles.lovable.app/signup" },
    ],
    links: [{ rel: "canonical", href: "https://ctaquiles.lovable.app/signup" }],
  }),
});

const schema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome completo").max(120),
    tenantNome: z.string().trim().min(2, "Informe o nome da academia").max(120),
    email: z.string().trim().email("E-mail inválido").max(255),
    telefone: z.string().trim().min(8, "Telefone inválido").max(20),
    cnpjCpf: z.string().trim().min(11, "CPF/CNPJ inválido").max(20),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Senhas não coincidem", path: ["confirm"] });

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nome: "", tenantNome: "", email: "", telefone: "", cnpjCpf: "", password: "", confirm: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          nome_completo: form.nome,
          tenant_nome: form.tenantNome,
          telefone: form.telefone,
          cnpj_cpf: form.cnpjCpf,
        },
      },
    });
    if (error) {
      setLoading(false);
      if (/registered|exists/i.test(error.message)) {
        toast.error("Este e-mail já está cadastrado");
      } else {
        toast.error(error.message);
      }
      return;
    }
    // tenta login automático (auto-confirm está ativo)
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    setLoading(false);
    if (signInErr) {
      toast.success("Cadastro criado! Faça login para continuar.");
      navigate({ to: "/login" });
      return;
    }
    toast.success("Academia cadastrada com sucesso!");
    navigate({ to: "/" });
  };

  return (
    <div className="dark min-h-screen grid place-items-center bg-background px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,oklch(0.62_0.22_25/0.15),transparent_50%)]" />
      <Card className="relative w-full max-w-lg p-8 gradient-card border-border shadow-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-lg gradient-primary grid place-items-center shadow-glow">
            <Swords className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Cadastrar Academia</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Fight Team SaaS</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="n">Nome completo do responsável *</Label>
            <Input id="n" required value={form.nome} onChange={set("nome")} className="mt-1.5" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="tn">Nome da academia *</Label>
            <Input id="tn" required value={form.tenantNome} onChange={set("tenantNome")} className="mt-1.5" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="e">E-mail (login) *</Label>
            <Input id="e" type="email" required value={form.email} onChange={set("email")} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="tel">Telefone *</Label>
            <Input id="tel" required value={form.telefone} onChange={set("telefone")} className="mt-1.5" placeholder="(11) 99999-9999"/>
          </div>
          <div>
            <Label htmlFor="cc">CNPJ ou CPF *</Label>
            <Input id="cc" required value={form.cnpjCpf} onChange={set("cnpjCpf")} className="mt-1.5"/>
          </div>
          <div>
            <Label htmlFor="p">Senha (mín. 8) *</Label>
            <PasswordInput id="p" required minLength={8} value={form.password} onChange={set("password")} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="pc">Confirmar senha *</Label>
            <PasswordInput id="pc" required value={form.confirm} onChange={set("confirm")} className="mt-1.5" />
          </div>
          <Button type="submit" className="col-span-2 gradient-primary text-primary-foreground shadow-glow" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
          </Button>
        </form>
        <p className="text-sm text-center mt-6 text-muted-foreground">
          Já tem conta? <Link to="/login" className="text-primary hover:underline font-medium">Entrar</Link>
        </p>
      </Card>
    </div>
  );
}
