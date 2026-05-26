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
  // CTA principal : noir profond, ombre subtle, hover subtle lift
  primary:
    "bg-zinc-900 text-white shadow-card hover:bg-zinc-800 hover:shadow-card-hover",
  // Secondary : neutre sur fond zinc-50, bordure visible
  secondary:
    "bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 shadow-card",
  // Outline : neutre fond transparent
  outline:
    "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-300",
  // Ghost : texte uniquement, hover bg subtile
  ghost: "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100",
  // Danger : rouge plein avec ombre
  danger:
    "bg-rose-600 text-white shadow-card hover:bg-rose-700 focus-visible:ring-rose-400",
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
  neutral: "bg-zinc-400",
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
  neutral: "text-zinc-700",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-rose-700",
  info: "text-sky-700",
  amber: "text-amber-700",
  violet: "text-violet-700",
  sky: "text-sky-700",
  fuchsia: "text-fuchsia-700",
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
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-zinc-200 text-xs font-medium whitespace-nowrap",
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
  neutral: "bg-zinc-100 text-zinc-700",
  amber: "bg-amber-50 text-amber-800",
  emerald: "bg-emerald-50 text-emerald-800",
  rose: "bg-rose-50 text-rose-800",
  sky: "bg-sky-50 text-sky-800",
  violet: "bg-violet-50 text-violet-800",
  fuchsia: "bg-fuchsia-50 text-fuchsia-800",
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
      className={cn("rounded-xl bg-white border border-zinc-200/80 shadow-card", className)}
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
      className={cn("px-5 py-4 border-b border-zinc-100", className)}
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
        "rounded-xl border border-zinc-200/80 bg-white shadow-card px-6 py-10 text-center space-y-3",
        className
      )}
    >
      {icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 text-zinc-500 mx-auto">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        {description && (
          <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
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
        "rounded-xl bg-white border border-zinc-200/80 shadow-card px-3 py-2.5 flex items-center gap-2 flex-wrap",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ToolbarSeparator() {
  return <div className="h-6 w-px bg-zinc-200 mx-1 shrink-0" />;
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
        "inline-flex items-center px-1.5 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-[10px] text-zinc-500 font-medium tabular-nums",
        className
      )}
    >
      {children}
    </kbd>
  );
}
