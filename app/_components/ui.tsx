"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Primitives UI partagées du CRM. Objectif : éviter la duplication de classes
 * Tailwind (Button, Badge, Card, EmptyState, Toolbar) et garantir la
 * cohérence visuelle (espacements, bordures, focus, ombres).
 *
 * Règles design système :
 *   - rounded-md       : boutons / inputs (8px)
 *   - rounded-lg       : cartes (12px) et modales
 *   - rounded-full     : pastilles / pills / chips
 *   - border-zinc-200  : bordures secondaires
 *   - border-zinc-300  : bordures interactives
 *   - focus-visible:ring-2 ring-zinc-400 ring-offset-1  : focus standard
 *   - text-sm sur les boutons standards, text-xs sur les boutons compact
 */

// ============================================================================
//  BUTTON
// ============================================================================

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "xs" | "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800",
  secondary:
    "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border border-zinc-200",
  outline:
    "bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400",
  ghost: "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-400",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: "px-2 py-1 text-xs rounded-md",
  sm: "px-2.5 py-1.5 text-xs rounded-md",
  md: "px-3 py-2 text-sm rounded-md",
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
//  BADGE / CHIP
// ============================================================================

type BadgeTone = "neutral" | "amber" | "emerald" | "rose" | "sky" | "violet" | "fuchsia";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
  amber: "bg-amber-50 text-amber-800 border-amber-300",
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-300",
  rose: "bg-rose-50 text-rose-800 border-rose-300",
  sky: "bg-sky-50 text-sky-800 border-sky-300",
  violet: "bg-violet-50 text-violet-800 border-violet-300",
  fuchsia: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300",
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
        "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap",
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
      className={cn("rounded-lg border bg-card", className)}
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
      className={cn("px-4 py-3 border-b border-zinc-200", className)}
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
    <div className={cn("p-4", className)} {...rest}>
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
        "rounded-lg border bg-card p-8 text-center space-y-3",
        className
      )}
    >
      {icon && (
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-zinc-100 text-zinc-500 mx-auto">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium text-zinc-900">{title}</h3>
        {description && (
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
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
        "rounded-lg border bg-card px-3 py-2 flex items-center gap-2 flex-wrap",
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
