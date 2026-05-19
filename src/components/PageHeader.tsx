import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8 pb-4" style={{ borderBottom: "1px solid rgba(181,0,0,0.2)" }}>
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-[0.08em] uppercase text-metal-light">
          {title}
        </h1>
        {description && (
          <p className="text-xs uppercase tracking-[0.2em] text-metal mt-2 font-semibold">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
