import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, ClipboardList, CreditCard, Wallet, CalendarDays, Award, BarChart3, Settings, LogOut, Swords } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useState, type ReactNode } from "react";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", adminOnly: false },
  { to: "/alunos", icon: Users, label: "Alunos", adminOnly: false },
  { to: "/matriculas", icon: ClipboardList, label: "Matrículas", adminOnly: false },
  { to: "/pagamentos", icon: CreditCard, label: "Pagamentos", adminOnly: true },
  { to: "/planos", icon: Wallet, label: "Planos", adminOnly: true },
  { to: "/horarios", icon: CalendarDays, label: "Horários", adminOnly: false },
  { to: "/graduacoes", icon: Award, label: "Graduações", adminOnly: false },
  { to: "/relatorios", icon: BarChart3, label: "Relatórios", adminOnly: true },
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
    <div className="dark min-h-screen flex w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-md gradient-primary grid place-items-center shadow-glow">
            <Swords className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight text-sidebar-foreground">CT Aquiles</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Fight Team</p>
          </div>
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
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-md">
            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary grid place-items-center text-xs font-bold">
              {profile?.nome_completo?.charAt(0) ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-sidebar-foreground">{profile?.nome_completo}</p>
              <p className="text-[10px] text-muted-foreground truncate">{isAdmin ? "Admin" : "Professor Kids"}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={handleSignOut} className="h-8 w-8">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col md:ml-64 min-w-0">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur flex items-center justify-between px-4 md:px-8 sticky top-0 z-20">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </Button>
          <div className="hidden md:block text-xs text-muted-foreground uppercase tracking-widest">
            Sistema de Gestão
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>

      <Toaster />
    </div>
  );
}
