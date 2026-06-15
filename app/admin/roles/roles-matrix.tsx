"use client";

import { useState, useTransition } from "react";
import { setRolePermission } from "./actions";
import { toastError } from "@/lib/toast-helpers";
import {
  ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  type Role,
  type Permission,
} from "@/lib/permissions";

function key(role: Role, perm: Permission) {
  return `${role}:${perm}`;
}

export default function RolesMatrix({
  rows,
}: {
  rows: { role: string; permission: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [granted, setGranted] = useState<Set<string>>(
    () => new Set(rows.map((r) => `${r.role}:${r.permission}`))
  );

  function isOn(role: Role, perm: Permission) {
    if (role === "admin") return true; // superadmin = toujours tout
    return granted.has(key(role, perm));
  }

  function toggle(role: Role, perm: Permission, next: boolean) {
    if (role === "admin") return;
    const k = key(role, perm);
    // Optimistic
    setGranted((prev) => {
      const s = new Set(prev);
      if (next) s.add(k);
      else s.delete(k);
      return s;
    });
    startTransition(async () => {
      try {
        await setRolePermission(role, perm, next);
      } catch (e) {
        // Revert
        setGranted((prev) => {
          const s = new Set(prev);
          if (next) s.delete(k);
          else s.add(k);
          return s;
        });
        toastError(e, "Modification impossible");
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-zinc-50/60 dark:bg-white/[0.02] border-b border-zinc-200/70 dark:border-white/[0.06]">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-[11px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-zinc-50/60 dark:bg-white/[0.02] min-w-[220px]">
              Permission
            </th>
            {ROLES.map((r) => (
              <th
                key={r}
                className="px-3 py-3 text-center font-medium text-[11px] uppercase tracking-wider text-muted-foreground w-[130px]"
                title={ROLE_DESCRIPTIONS[r]}
              >
                {ROLE_LABELS[r]}
                {r === "admin" && (
                  <span className="block text-[9px] font-normal normal-case text-zinc-400 dark:text-zinc-500">
                    (tout, non modifiable)
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
          {ALL_PERMISSIONS.map((perm) => (
            <tr key={perm} className="hover:bg-zinc-50/60 dark:hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-200 sticky left-0 bg-white dark:bg-[hsl(var(--card))]">
                {PERMISSION_LABELS[perm]}
              </td>
              {ROLES.map((role) => {
                const on = isOn(role, perm);
                const locked = role === "admin";
                return (
                  <td key={role} className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked || isPending}
                      onChange={(e) => toggle(role, perm, e.target.checked)}
                      aria-label={`${PERMISSION_LABELS[perm]} — ${ROLE_LABELS[role]}`}
                      className="h-4 w-4 rounded border-zinc-300 dark:border-white/[0.20] text-[hsl(var(--gold))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed accent-[hsl(var(--gold))]"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
