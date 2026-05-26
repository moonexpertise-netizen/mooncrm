"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Primitives UI premium du CRM (v2 — refonte design).
 *
 * Styles inspirés Linear / Attio / Stripe :
 *   - Boutons : rounded-lg, ombre légère, hover state marqué, active scale
 *   - Cards : rounded-xl, ombre subtile (shadow-card), pas de bordure forte
 *   - Badges : dot + label (style status moderne) ou pill simple
 *   - EmptyState : icône cerclée + texte + CTA
 *   - Toolbar : pill horizontale, padding généreux
 */

// ============================================================================
//  BUTTON
// ============================================================================

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "xs" | "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 active:scale-[0.97]";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // CTA principal : noir profond en light, blanc casse en dark
  primary:
    "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 shadow-card hover:bg-zinc-800 dark:hover:bg-white hover:shadow-card-hover",
  // Secondary : neutre sur fond muted, bordure visible
  secondary:
    "bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.08] hover:border-zinc-300 dark:hover:border-white/[0.16] shadow-card",
  // Outline : neutre fond quasi transparent
  outline:
    "bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-white/[0.16]",
  // Ghost : texte uniquement, hover bg subtile
  ghost:
    "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06]",
  // Danger : rouge plein avec ombre
  danger:
    "bg-rose-600 dark:bg-rose-500 text-white shadow-card hover:bg-rose-700 dark:hover:bg-rose-600 focus-visible:ring-rose-400",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-xs rounded-md",
  sm: "h-8 px-2.5 text-xs rounded-md",
  md: "h-9 px-3.5 text-sm rounded-lg",
  lg: "h-10 px-4 text-sm rounded-lg",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "sm", className, type, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
});

export type LinkButtonProps = React.ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function LinkButton({
  variant = "outline",
  size = "sm",
  className,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      {...rest}
    />
  );
}

// ============================================================================
//  STATUS BADGE (style moderne : dot + label)
// ============================================================================

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "amber" | "violet" | "sky" | "fuchsia";

const STATUS_DOT: Record<StatusTone, string> = {
  neutral: "bg-zinc-400 dark:bg-zinc-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  sky: "bg-sky-500",
  fuchsia: "bg-fuchsia-500",
};

const STATUS_TEXT: Record<StatusTone, string> = {
  neutral: "text-zinc-700 dark:text-zinc-200",
  success: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  danger: "text-rose-700 dark:text-rose-400",
  info: "text-sky-700 dark:text-sky-400",
  amber: "text-amber-700 dark:text-amber-400",
  violet: "text-violet-700 dark:text-violet-400",
  sky: "text-sky-700 dark:text-sky-400",
  fuchsia: "text-fuchsia-700 dark:text-fuchsia-400",
};

/**
 * Status badge moderne : un point coloré + un label.
 * Plus calme que les bg pastels, plus lisible.
 *
 *   <StatusBadge tone="success">LDM signée</StatusBadge>
 */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-xs font-medium whitespace-nowrap",
        STATUS_TEXT[tone],
        className
      )}
    >
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[tone])} />
      {children}
    </span>
  );
}

// ============================================================================
//  BADGE (pill plein — pour étiquettes simples non-statut)
// ============================================================================

type BadgeTone = "neutral" | "amber" | "emerald" | "rose" | "sky" | "violet" | "fuchsia";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200",
  amber: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300",
  emerald: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  rose: "bg-rose-50 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300",
  sky: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300",
  violet: "bg-violet-50 dark:bg-violet-500/15 text-violet-800 dark:text-violet-300",
  fuchsia: "bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap",
        BADGE_TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ============================================================================
//  CARD
// ============================================================================

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white dark:bg-[hsl(var(--card))] border border-zinc-200/80 dark:border-white/[0.08] shadow-card",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-5 py-4 border-b border-zinc-100 dark:border-white/[0.06]", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5", className)} {...rest}>
      {children}
    </div>
  );
}

// ============================================================================
//  EMPTY STATE
// ============================================================================

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card px-6 py-10 text-center space-y-3",
        className
      )}
    >
      {icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400 mx-auto">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        {description && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

// ============================================================================
//  TOOLBAR
// ============================================================================

export function Toolbar({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white dark:bg-[hsl(var(--card))] border border-zinc-200/80 dark:border-white/[0.08] shadow-card px-3 py-2.5 flex items-center gap-2 flex-wrap",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ToolbarSeparator() {
  return <div className="h-6 w-px bg-zinc-200 dark:bg-white/[0.08] mx-1 shrink-0" />;
}

// ============================================================================
//  KBD (raccourci clavier stylé)
// ============================================================================

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.04] text-[10px] text-zinc-500 dark:text-zinc-400 font-medium tabular-nums",
        className
      )}
    >
      {children}
    </kbd>
  );
}
