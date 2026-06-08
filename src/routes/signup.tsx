import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { toast } from "sonner";
import { translateError } from "@/lib/errors";
import { Loader2 } from "lucide-react";
import logo from "@/assets/axus-kombat-logo.png";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "Cadastrar academia | Axus Kombat" },
      { name: "description", content: "Crie sua conta no Axus Kombat e gerencie sua academia de artes marciais." },
      { property: "og:title", content: "Cadastrar academia | Axus Kombat" },
      { property: "og:description", content: "Crie sua conta e comece a gerenciar sua academia." },
    ],
  }),
});

const schema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome completo").max(120),
    tenantNome: z.string().trim().min(2, "Informe o nome da academia").max(120),
    email: z.string().trim().email("E-mail inválido").max(255),
    telefone: z.string().trim().min(8, "Telefone inválido").max(20),
    password: z.string().min(6, "Senha deve ter ao menos 6 caracteres").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Senhas não coincidem", path: ["confirm"] });

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nome: "", tenantNome: "", email: "", telefone: "", password: "", confirm: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(translateError(parsed.error)); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { nome_completo: form.nome, tenant_nome: form.tenantNome, telefone: form.telefone },
        },
      });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (/registered|already.*exists|user.*exists/.test(msg)) {
          toast.error("Este e-mail já está cadastrado. Faça login ou recupere sua senha.");
        } else {
          toast.error(translateError(error));
        }
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (signInErr) { toast.success("Cadastro criado! Faça login para continuar."); navigate({ to: "/login" }); return; }
      toast.success("Academia cadastrada com sucesso!");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark min-h-screen relative grid place-items-center bg-background px-4 py-6 overflow-hidden">
      <div className="absolute inset-0 noise-bg pointer-events-none" />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(181,0,0,0.15), transparent 60%)", filter: "blur(40px)" }}
      />
      <div className="relative w-full max-w-xl flex flex-col items-center">
        <img src={logo} alt="Axus Kombat" className="w-40 object-contain drop-shadow-[0_0_30px_rgba(181,0,0,0.35)]" />
        <p className="mt-1 font-display text-[10px] uppercase tracking-[0.4em] text-metal">Cadastrar Academia</p>

        <div
          className="mt-4 w-full p-6"
          style={{
            background: "#0e0e0e",
            border: "1px solid rgba(181,0,0,0.15)",
            borderTop: "2px solid #B50000",
            borderRadius: "6px",
            boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 30px rgba(181,0,0,0.06)",
          }}
        >
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="n" className="uppercase-label text-[11px]">Nome do responsável *</Label>
              <Input id="n" required value={form.nome} onChange={set("nome")} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="tn" className="uppercase-label text-[11px]">Nome da academia *</Label>
              <Input id="tn" required value={form.tenantNome} onChange={set("tenantNome")} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="e" className="uppercase-label text-[11px]">E-mail (login) *</Label>
              <Input id="e" type="email" required value={form.email} onChange={set("email")} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="tel" className="uppercase-label text-[11px]">Telefone *</Label>
              <Input id="tel" required value={form.telefone} onChange={set("telefone")} className="mt-1" placeholder="(11) 99999-9999" />
            </div>
            <div>
              <Label htmlFor="p" className="uppercase-label text-[11px]">Senha (mín. 8) *</Label>
              <PasswordInput id="p" required minLength={8} value={form.password} onChange={set("password")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pc" className="uppercase-label text-[11px]">Confirmar senha *</Label>
              <PasswordInput id="pc" required value={form.confirm} onChange={set("confirm")} className="mt-1" />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="col-span-2 h-11 font-display uppercase tracking-[0.2em] text-sm bg-primary hover:bg-[#D40000] text-primary-foreground shadow-glow"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
            </Button>
          </form>
          <p className="text-xs text-center mt-4 text-metal uppercase tracking-widest">
            Já tem conta?{" "}
            <Link to="/login" className="text-primary hover:text-[#D40000] font-semibold">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
