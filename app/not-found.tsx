/**
 * Page 404 globale. Remplace la 404 Next.js par defaut (noir + texte blanc),
 * qui apparaissait notamment quand `notFound()` est appele dans un layout
 * ou un page.tsx (slug client introuvable, tracker invalide, etc.).
 *
 * Design coherent avec error.tsx : meme typo, meme palette, dark mode.
 */

import Link from "next/link";
import { FileQuestion, Home, Users } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-zinc-100 dark:bg-white/[0.06]">
          <FileQuestion className="h-7 w-7 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Page introuvable
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            L&apos;adresse demandée n&apos;existe pas (plus). Si tu venais
            de modifier un dossier, retourne à la liste — il y est peut-être
            sous un autre nom.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>
          <Link
            href="/clients"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-zinc-300 dark:border-white/[0.12] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Tous les dossiers
          </Link>
        </div>
      </div>
    </div>
  );
}
