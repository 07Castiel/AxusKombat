import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; className: string }> = {
  ativo:      { label: "Ativo",      className: "bg-[rgba(21,128,61,0.12)] text-[#16a34a] border-[rgba(21,128,61,0.3)]" },
  ativa:      { label: "Ativa",      className: "bg-[rgba(21,128,61,0.12)] text-[#16a34a] border-[rgba(21,128,61,0.3)]" },
  pago:       { label: "Pago",       className: "bg-[rgba(21,128,61,0.12)] text-[#16a34a] border-[rgba(21,128,61,0.3)]" },
  pendente:   { label: "Pendente",   className: "bg-[rgba(180,83,9,0.12)] text-[#d97706] border-[rgba(180,83,9,0.3)]" },
  inativo:    { label: "Inativo",    className: "bg-white/[0.04] text-[#666] border-white/10" },
  cancelada:  { label: "Cancelada",  className: "bg-[rgba(181,0,0,0.12)] text-[#D40000] border-[rgba(181,0,0,0.3)]" },
  vencida:    { label: "Vencida",    className: "bg-[rgba(181,0,0,0.12)] text-[#D40000] border-[rgba(181,0,0,0.3)]" },
  atrasado:   { label: "Atrasado",   className: "bg-[rgba(181,0,0,0.12)] text-[#D40000] border-[rgba(181,0,0,0.3)]" },
  adulto:     { label: "Adulto",     className: "bg-[rgba(181,0,0,0.1)] text-[#D40000] border-[rgba(181,0,0,0.3)]" },
  kids:       { label: "Kids",       className: "bg-[rgba(180,83,9,0.12)] text-[#d97706] border-[rgba(180,83,9,0.3)]" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const cfg = MAP[status] ?? { label: status, className: "bg-white/[0.04] text-[#666] border-white/10" };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-[3px] border font-semibold uppercase tracking-[0.08em] text-[10px]",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}
