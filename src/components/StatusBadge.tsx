import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "danger" | "muted" | "info";

const MAP: Record<string, { label: string; variant: Variant }> = {
  ativo:     { label: "Ativo",     variant: "success" },
  ativa:     { label: "Ativa",     variant: "success" },
  pago:      { label: "Pago",      variant: "success" },
  pendente:  { label: "Pendente",  variant: "warning" },
  inativo:   { label: "Inativo",   variant: "muted" },
  cancelada: { label: "Cancelada", variant: "danger" },
  vencida:   { label: "Vencida",   variant: "danger" },
  vencido:   { label: "Vencido",   variant: "danger" },
  atrasado:  { label: "Atrasado",  variant: "danger" },
  adulto:    { label: "Adulto",    variant: "danger" },
  kids:      { label: "Kids",      variant: "warning" },
};

const VARIANT_CLASS: Record<Variant, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger:  "bg-destructive/15 text-destructive border-destructive/30",
  muted:   "bg-muted text-muted-foreground border-border",
  info:    "bg-primary/10 text-primary border-primary/30",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const cfg = MAP[status] ?? { label: status, variant: "muted" as Variant };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-[3px] border font-semibold uppercase tracking-[0.08em] text-[10px]",
        VARIANT_CLASS[cfg.variant],
      )}
    >
      {cfg.label}
    </span>
  );
}
