import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, CreditCard, Wallet, CalendarDays, Award, BarChart3, Settings, LogOut, Menu, Swords, UserCog, Bell, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
// Toaster mounted globally in __root.tsx
import { useState, type ReactNode } from "react";
import logo from "@/assets/axus-kombat-logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", adminOnly: false },
  { to: "/alunos", icon: Users, label: "Alunos", adminOnly: false },
  { to: "/financeiro", icon: CreditCard, label: "Financeiro", adminOnly: true },
  { to: "/planos", icon: Wallet, label: "Planos", adminOnly: true },
  { to: "/modalidades", icon: Swords, label: "Modalidades", adminOnly: true },
  { to: "/horarios", icon: CalendarDays, label: "Horários", adminOnly: false },
  { to: "/graduacoes", icon: Award, label: "Graduações", adminOnly: false },
  { to: "/relatorios", icon: BarChart3, label: "Relatórios", adminOnly: true },
  { to: "/notificacoes", icon: Bell, label: "Notificações", adminOnly: true },
  { to: "/equipe", icon: UserCog, label: "Equipe", adminOnly: true },
  { to: "/acessos", icon: Activity, label: "Acessos", adminOnly: true },
  { to: "/configuracoes", icon: Settings, label: "Configurações", adminOnly: true },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar flex flex-col transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ borderRight: "1px solid rgba(181,0,0,0.15)", boxShadow: "inset -1px 0 0 rgba(181,0,0,0.08)" }}
      >
        <div className="px-5 py-5 flex flex-col items-center gap-2 border-b" style={{ borderColor: "rgba(181,0,0,0.2)" }}>
          <img src={logo} alt="Axus Kombat" className="h-20 w-20 object-contain drop-shadow-[0_0_15px_rgba(181,0,0,0.35)]" />
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-metal">Sistema de Gestão</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded text-[12px] font-semibold uppercase tracking-wider transition-all duration-150",
                  active ? "text-foreground" : "text-sidebar-foreground hover:bg-white/[0.03] hover:text-metal-light",
                )}
                style={
                  active
                    ? { background: "rgba(181,0,0,0.08)", borderLeft: "3px solid #B50000", boxShadow: "inset 3px 0 15px rgba(181,0,0,0.1)" }
                    : undefined
                }
              >
                <Icon className={cn("h-4 w-4 transition-colors", active ? "text-primary" : "text-[#555] group-hover:text-metal-light")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: "rgba(181,0,0,0.15)" }}>
          <div className="flex items-center gap-3 px-2 py-2 rounded">
            <div
              className="h-9 w-9 rounded-full grid place-items-center text-xs font-bold text-primary"
              style={{ background: "rgba(181,0,0,0.15)", border: "1px solid rgba(181,0,0,0.35)" }}
            >
              {profile?.nome_completo?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate text-metal-light">{profile?.nome_completo}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{isAdmin ? "Admin" : "Professor"}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={handleSignOut} className="h-8 w-8 text-metal hover:text-primary" aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[9px] text-center mt-2 uppercase tracking-widest text-muted-foreground">Axus Kombat v1.0</p>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/80 z-30 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col md:ml-64 min-w-0">
        <header
          className="h-14 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20 bg-background"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <Button variant="ghost" size="icon" className="md:hidden text-metal" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden md:block text-[10px] font-display uppercase tracking-[0.35em] text-metal">
            Axus Kombat · Painel de Controle
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] uppercase tracking-widest text-metal-light font-semibold hidden sm:block">
              {profile?.nome_completo}
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 noise-bg">{children}</main>
      </div>
    </div>
  );
}
