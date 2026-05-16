import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; className: string }> = {
  ativo: { label: "Ativo", className: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", className: "bg-muted text-muted-foreground border-border" },
  pendente: { label: "Pendente", className: "bg-warning/15 text-warning border-warning/30" },
  ativa: { label: "Ativa", className: "bg-success/15 text-success border-success/30" },
  vencida: { label: "Vencida", className: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground border-border" },
  pago: { label: "Pago", className: "bg-success/15 text-success border-success/30" },
  atrasado: { label: "Atrasado", className: "bg-destructive/15 text-destructive border-destructive/30" },
  adulto: { label: "Adulto", className: "bg-primary/15 text-primary border-primary/30" },
  kids: { label: "Kids", className: "bg-warning/15 text-warning border-warning/30" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const cfg = MAP[status] ?? { label: status, className: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={cn("font-medium border", cfg.className)}>{cfg.label}</Badge>;
}
