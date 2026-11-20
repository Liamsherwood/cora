"use client";

import { TRACKING_STEPS, type State } from "@/workflow/states";

export function Card({ title, aside, children }: { title?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  busy,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  busy?: boolean;
}) {
  const styles = {
    primary: "bg-brand text-white hover:bg-[#5a2f29]",
    secondary: "border border-line bg-white text-ink hover:bg-paper",
    ghost: "text-muted hover:text-ink",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
}

const STATE_STYLE: Record<string, string> = {
  detected: "bg-amber-50 text-amber-800",
  offer_sent: "bg-blue-50 text-blue-800",
  consent_given: "bg-violet-50 text-violet-800",
  ordered: "bg-violet-50 text-violet-800",
  confirmed: "bg-emerald-50 text-emerald-800",
  active: "bg-emerald-100 text-emerald-900",
  closed: "bg-emerald-100 text-emerald-900",
  declined: "bg-stone-100 text-stone-700",
  rejected: "bg-red-50 text-red-800",
  no_eligible_offer: "bg-stone-100 text-stone-700",
};

export function StateBadge({ state }: { state: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[state] ?? "bg-stone-100"}`}>{state.replace(/_/g, " ")}</span>;
}

/** The "DHL tracking" bar. */
export function Tracking({ state, category }: { state: State; category?: string }) {
  const order = TRACKING_STEPS.map((s) => s.state);
  const reached = state === "closed" ? order.length - 1 : order.indexOf(state);
  const failed = state === "declined" || state === "rejected" || state === "no_eligible_offer";
  return (
    <ol className="flex flex-wrap items-center gap-y-2" aria-label="Progress">
      {TRACKING_STEPS.map((s, i) => {
        const done = !failed && i <= reached;
        const label = s.state === "active" && category === "energy" ? "Supply active" : s.label;
        return (
          <li key={s.state} className="flex items-center">
            <span className={`flex items-center gap-1.5 text-xs ${done ? "text-ink" : "text-muted"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${done ? "bg-brand" : "bg-line"}`} aria-hidden />
              {label}
            </span>
            {i < TRACKING_STEPS.length - 1 && <span className={`mx-2 h-px w-5 ${done && i < reached ? "bg-brand" : "bg-line"}`} aria-hidden />}
          </li>
        );
      })}
      {failed && <li className="ml-2"><StateBadge state={state} /></li>}
    </ol>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="text-sm text-red-700">{children}</p>;
}
