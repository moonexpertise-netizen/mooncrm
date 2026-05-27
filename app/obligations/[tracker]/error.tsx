"use client";

/**
 * Error boundary specifique a un tracker production. Si la query echoue
 * (slug invalide, RLS, timeout), on propose un retour au sommaire au lieu
 * de bloquer la navigation.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, RefreshCw } from "lucide-react";

export default function TrackerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[MoonCRM] Tracker error:", error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-500/15">
          <AlertTriangle className="h-7 w-7 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Impossible de charger ce tracker
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            La query a échoué. Réessaie, ou retourne au sommaire de production.
          </p>
        </div>
        {error.digest && (
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
            Code : {error.digest}
          </div>
        )}
        <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Réessayer
          </button>
          <Link
            href="/obligations"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-zinc-300 dark:border-white/[0.12] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Retour aux trackers
          </Link>
        </div>
      </div>
    </div>
  );
}
