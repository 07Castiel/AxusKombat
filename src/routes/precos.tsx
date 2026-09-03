import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { createCheckoutSession, getMyTenantStatus } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { translateError } from "@/lib/errors";
import { flagDeBusca } from "@/lib/utils";
import { Check, Loader2, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import logo from "@/assets/axus-kombat-logo.png";

const RED = "#8B0000";
const RED_HOVER = "#6B0000";
const BG = "#0D0D0D";
const CARD = "#111111";

type PlanKey = "start" | "pro" | "elite";
type Period = "monthly" | "annual";

interface PlanDef {
  key: PlanKey;
  name: string;
  monthly: number;
  annual: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: PlanDef[] = [
  {
    key: "start",
    name: "Start",
    monthly: 79,
    annual: 790,
    tagline: "Para começar a digitalizar a sua academia.",
    features: [
      "Até 50 alunos cadastrados",
      "1 usuário (admin)",
      "Gestão de alunos e contratos",
      "Mensalidades automáticas",
      "Controle de pagamentos manual",
      "Relatórios básicos",
      "Suporte por e-mail",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: 99,
    annual: 990,
    tagline: "Tudo que você precisa para crescer sem trabalho manual.",
    highlight: true,
    features: [
      "Até 150 alunos cadastrados",
      "Até 3 usuários (admin + equipe)",
      "Tudo do Start",
      "WhatsApp automático (lembretes e cobranças)",
      "Controle de presenças e check-in",
      "Portal do Aluno",
      "Comunicados em massa",
      "Relatórios avançados e despesas",
      "Suporte prioritário",
    ],
  },
  {
    key: "elite",
    name: "Elite",
    monthly: 149,
    annual: 1490,
    tagline: "Para academias que querem profissionalizar a operação.",
    features: [
      "Alunos ilimitados",
      "Usuários ilimitados",
      "Tudo do Pro",
      "Marca personalizada no Portal do Aluno",
      "Permissões granulares por usuário",
      "Suporte VIP (resposta em até 4h úteis)",
      "Acompanhamento de onboarding",
    ],
  },
];

// Tolerante de propósito: ver flagDeBusca em @/lib/utils. O schema anterior
// exigia a string "true" e derrubava a rota quando o router entregava o
// booleano true.
//
// `?retomar=true` saiu junto com o estado `pending`: não existe mais cadastro
// pela metade esperando pagamento para ser "retomado".
const searchSchema = z.object({
  expirado: z.unknown().optional().transform(flagDeBusca),
});

export const Route = createFileRoute("/precos")({
  validateSearch: searchSchema,
  component: PrecosPage,
  head: () => ({
    meta: [
      { title: "Planos e preços | Axus Kombat" },
      {
        name: "description",
        content: "Escolha o plano ideal para sua academia. Comece grátis por 14 dias no plano Pro.",
      },
      { property: "og:title", content: "Planos e preços | Axus Kombat" },
      {
        property: "og:description",
        content: "Gestão completa para academias de artes marciais. Teste 14 dias grátis.",
      },
    ],
  }),
});

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}

function PrecosPage() {
  const search = useSearch({ from: "/precos" });
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("monthly");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("pro");
  const [modo, setModo] = useState<"trial" | "paid">("paid");
  const [tenantStatus, setTenantStatus] = useState<{
    status: string;
    plan: string | null;
    plan_period: string | null;
    is_trial: boolean;
  } | null>(null);

  const getStatus = useServerFn(getMyTenantStatus);

  // Carrega status do tenant se autenticado
  useEffect(() => {
    if (!user) return;
    getStatus()
      .then((s) => {
        if (s) setTenantStatus(s as typeof tenantStatus);
      })
      .catch(() => {});
  }, [user, getStatus]);

  const openCheckout = (plan: PlanKey, trial = false) => {
    setSelectedPlan(plan);
    setModo(trial ? "trial" : "paid");
    setModalOpen(true);
  };

  const isCurrentPlan = (key: PlanKey) =>
    tenantStatus && tenantStatus.status === "active" && tenantStatus.plan === key;

  return (
    <div
      className="dark min-h-screen"
      style={{ background: BG, color: "#fff", fontFamily: "Rajdhani, system-ui, sans-serif" }}
    >
      {/* Header */}
      <header className="border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Axus Kombat" className="h-9 w-9 object-contain" />
            <span className="font-display text-lg tracking-wide">AXUS KOMBAT</span>
          </Link>
          {user ? (
            <Link to="/" className="text-sm text-white/70 hover:text-white">
              Voltar ao painel
            </Link>
          ) : (
            <Link to="/login" className="text-sm text-white/70 hover:text-white">
              Já sou cliente →
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Banners condicionais */}
        {search.expirado && (
          <div
            className="mb-8 p-4 rounded"
            style={{
              background: "#1a0000",
              border: "1px solid #8B0000",
              color: "#fff",
              fontFamily: "Rajdhani, system-ui, sans-serif",
            }}
          >
            <strong className="font-semibold">Sua assinatura está inativa.</strong> Escolha um plano
            abaixo para retomar o acesso ao sistema.
          </div>
        )}

        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl md:text-5xl tracking-wider mb-3">
            ESCOLHA SEU PLANO
          </h1>
          <p className="text-white/70 max-w-xl mx-auto">
            Cancele quando quiser. Sem fidelidade. Suporte humano em português.
          </p>
        </div>

        {/* Trial CTA — só para quem ainda não tem conta. Quem já está logado
            já nasceu em teste; para esse o caminho é assinar. */}
        {!user && (
          <div
            className="max-w-3xl mx-auto mb-10 p-6 rounded text-center"
            style={{
              background: "#1a0000",
              border: "1px solid #8B0000",
            }}
          >
            <p className="font-display text-xl tracking-wide mb-2">
              TESTE 14 DIAS GRÁTIS NO PLANO PRO
            </p>
            <p className="text-white/80 text-sm mb-4">
              Acesso completo por 14 dias, sem cartão de crédito.
            </p>
            <button
              onClick={() => openCheckout("pro", true)}
              className="px-6 py-3 rounded font-semibold transition-colors"
              style={{ background: RED, color: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = RED_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.background = RED)}
            >
              Começar teste gratuito
            </button>
          </div>
        )}

        {/* Toggle mensal/anual */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <button
            onClick={() => setPeriod("monthly")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors`}
            style={{
              background: period === "monthly" ? RED : "transparent",
              color: "#fff",
              border: `1px solid ${period === "monthly" ? RED : "rgba(255,255,255,0.15)"}`,
            }}
          >
            Mensal
          </button>
          <button
            onClick={() => setPeriod("annual")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors relative`}
            style={{
              background: period === "annual" ? RED : "transparent",
              color: "#fff",
              border: `1px solid ${period === "annual" ? RED : "rgba(255,255,255,0.15)"}`,
            }}
          >
            Anual
            <span
              className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "#fff", color: RED, fontWeight: 700 }}
            >
              2 MESES GRÁTIS
            </span>
          </button>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              period={period}
              onSelect={() => openCheckout(p.key)}
              current={Boolean(isCurrentPlan(p.key))}
            />
          ))}
        </div>

        {/* Rodapé */}
        <footer
          className="mt-16 pt-8 border-t text-center text-sm text-white/50"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <p>
            Dúvidas?{" "}
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noreferrer"
              className="text-white hover:text-white/80"
            >
              Fale conosco no WhatsApp
            </a>
          </p>
          <p className="mt-2 text-xs text-white/40">
            © {new Date().getFullYear()} Axus Kombat · Política de Privacidade · Termos de Uso
          </p>
        </footer>
      </main>

      <CheckoutModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        plan={selectedPlan}
        period={period}
        modo={modo}
      />
    </div>
  );
}

function PlanCard({
  plan,
  period,
  onSelect,
  current,
}: {
  plan: PlanDef;
  period: Period;
  onSelect: () => void;
  current: boolean;
}) {
  const [expanded, setExpanded] = useState(plan.highlight);
  const value = period === "monthly" ? plan.monthly : plan.annual;
  const suffix = period === "monthly" ? "/mês" : "/ano";

  return (
    <div
      className="rounded p-6 relative flex flex-col"
      style={{
        background: CARD,
        border: plan.highlight ? `2px solid ${RED}` : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {plan.highlight && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-[10px] rounded font-bold tracking-wider"
          style={{ background: RED, color: "#fff" }}
        >
          MAIS VENDIDO
        </div>
      )}

      <h3 className="font-display text-2xl tracking-wider">{plan.name.toUpperCase()}</h3>
      <p className="text-white/60 text-sm mt-1 min-h-[40px]">{plan.tagline}</p>

      <div className="my-4">
        <span className="text-4xl font-bold">{formatBRL(value)}</span>
        <span className="text-white/60 text-sm">{suffix}</span>
      </div>

      {/* Mobile: expand */}
      <div className="md:hidden mb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-white/70"
        >
          {expanded ? "Ocultar detalhes" : "Ver detalhes"}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <ul className={`space-y-2 mb-6 flex-1 ${expanded ? "" : "hidden md:block"}`}>
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-white/85">
            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: RED }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={current}
        className="w-full py-3 rounded font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: current ? "transparent" : RED,
          color: "#fff",
          border: current ? "1px solid rgba(255,255,255,0.15)" : "none",
        }}
        onMouseEnter={(e) => {
          if (!current) e.currentTarget.style.background = RED_HOVER;
        }}
        onMouseLeave={(e) => {
          if (!current) e.currentTarget.style.background = RED;
        }}
      >
        {current ? "Plano atual" : "Assinar agora"}
      </button>
    </div>
  );
}

// ─── Modal de Checkout ────────────────────────────────────────────────────────

const stepOneSchema = z
  .object({
    nome: z.string().trim().min(3, "Informe seu nome completo (mín. 3 caracteres)"),
    tenantNome: z.string().trim().min(2, "Informe o nome da academia"),
    email: z.string().trim().email("E-mail inválido"),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

/**
 * `trial` = só criar a conta e entrar no sistema. Nenhuma etapa de pagamento,
 * nenhuma chamada ao Stripe.
 * `paid`  = criar a conta (se necessário), revisar o pedido e ir ao Stripe.
 */
function CheckoutModal({
  open,
  onOpenChange,
  plan,
  period,
  modo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: PlanKey;
  period: Period;
  modo: "trial" | "paid";
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    nome: "",
    tenantNome: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const checkout = useServerFn(createCheckoutSession);

  useEffect(() => {
    if (!open) return;
    // No trial existe uma etapa só. No pago, quem já está logado pula o cadastro.
    setStep(modo === "trial" ? 1 : user ? 2 : 1);
  }, [open, user, modo]);

  const planDef = useMemo(() => PLANS.find((p) => p.key === plan)!, [plan]);
  const value = period === "monthly" ? planDef.monthly : planDef.annual;
  const suffix = period === "monthly" ? "/mês" : "/ano";

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = stepOneSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          // Sem flag de trial aqui: o teste de 14 dias é decidido pelo banco
          // (handle_new_user grava status 'trialing' + trial_ends_at).
          data: {
            nome_completo: form.nome,
            tenant_nome: form.tenantNome,
            plan,
            plan_period: period,
          },
        },
      });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (/registered|already|exists/.test(msg)) {
          toast.error("Este e-mail já está cadastrado. Faça login para continuar.");
        } else {
          toast.error(translateError(error));
        }
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (signInErr) {
        toast.success("Cadastro criado! Faça login para continuar.");
        return;
      }
      if (modo === "trial") {
        // Direto para o sistema. O teste de 14 dias já está valendo.
        onOpenChange(false);
        toast.success("Conta criada! Seu teste de 14 dias começou.");
        navigate({ to: "/" });
        return;
      }
      setStep(2);
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const { url } = await checkout({
        data: { plan, period },
      });
      window.location.href = url;
    } catch (err) {
      toast.error(translateError(err) || "Falha ao iniciar pagamento. Tente novamente.");
      setLoading(false);
    }
  };

  const stepLabel = modo === "trial" ? "Teste gratuito de 14 dias" : `Etapa ${step} de 3`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dark max-w-md p-0 gap-0 border-0"
        style={{ background: CARD, color: "#fff", fontFamily: "Rajdhani, system-ui, sans-serif" }}
      >
        <DialogHeader
          className="p-6 pb-3 border-b"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div className="text-xs text-white/50 mb-1">{stepLabel}</div>
          <DialogTitle className="font-display tracking-wider text-xl">
            {step === 1 && "CRIAR CONTA"}
            {step === 2 && "RESUMO DO PEDIDO"}
            {step === 3 && "PAGAMENTO"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6">
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-3">
              <div>
                <Label className="text-xs text-white/70">Seu nome completo</Label>
                <Input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="mt-1 bg-[#1a1a1a] border-white/10"
                />
              </div>
              <div>
                <Label className="text-xs text-white/70">Nome da academia</Label>
                <Input
                  required
                  value={form.tenantNome}
                  onChange={(e) => setForm({ ...form, tenantNome: e.target.value })}
                  className="mt-1 bg-[#1a1a1a] border-white/10"
                />
              </div>
              <div>
                <Label className="text-xs text-white/70">E-mail (login)</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 bg-[#1a1a1a] border-white/10"
                />
              </div>
              <div>
                <Label className="text-xs text-white/70">Senha (mín. 8 caracteres)</Label>
                <PasswordInput
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="mt-1 bg-[#1a1a1a] border-white/10"
                />
              </div>
              <div>
                <Label className="text-xs text-white/70">Confirmar senha</Label>
                <PasswordInput
                  required
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  className="mt-1 bg-[#1a1a1a] border-white/10"
                />
                {form.confirm && form.confirm !== form.password && (
                  <p className="text-xs mt-1" style={{ color: "#ff6666" }}>
                    As senhas não coincidem.
                  </p>
                )}
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11"
                style={{ background: RED, color: "#fff" }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : modo === "trial" ? (
                  "Criar conta e começar"
                ) : (
                  "Continuar"
                )}
              </Button>
              {modo === "trial" && (
                <p className="text-xs text-center text-white/50">
                  Nenhum dado de pagamento é pedido agora.
                </p>
              )}
              <p className="text-xs text-center text-white/50">
                Já tem conta?{" "}
                <Link to="/login" className="text-white hover:underline">
                  Entrar
                </Link>
              </p>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded p-4" style={{ background: "#1a1a1a" }}>
                <div className="flex justify-between mb-2">
                  <span className="text-white/70 text-sm">Plano</span>
                  <span className="font-semibold">{planDef.name}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-white/70 text-sm">Período</span>
                  <span className="font-semibold">{period === "monthly" ? "Mensal" : "Anual"}</span>
                </div>
                <div
                  className="flex justify-between pt-2 border-t"
                  style={{ borderColor: "rgba(255,255,255,0.06)" }}
                >
                  <span className="text-white/70 text-sm">Valor</span>
                  <span className="font-bold text-lg">
                    {formatBRL(value)}
                    <span className="text-white/60 text-sm font-normal">{suffix}</span>
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (user ? onOpenChange(false) : setStep(1))}
                  className="flex-1 border-white/10 bg-transparent text-white hover:bg-white/5"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 h-11"
                  style={{ background: RED, color: "#fff" }}
                >
                  Ir para pagamento
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-center">
              <p className="text-white/80">
                Você será redirecionado para o ambiente seguro do Stripe para concluir o pagamento.
              </p>
              <Button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full h-12"
                style={{ background: RED, color: "#fff" }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Pagar ${formatBRL(value)}${suffix}`
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(2)}
                className="text-white/60 hover:text-white hover:bg-transparent"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao resumo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
