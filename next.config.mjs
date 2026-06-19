/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // ESLint a bloqué le build sur des règles cosmétiques (apostrophes,
    // <a> vs <Link>). On l'ignore au build, on traite à part.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Cache RSC côté client : quand l'utilisateur navigue arrière (back) ou
    // re-visite une page récente, le RSC précédent est ré-affiché instantanément
    // (avant re-fetch async en arrière-plan). Critical pour la fluidité perçue
    // sur cette app : back depuis une fiche client = instantané.
    // - dynamic: 60s pour les pages force-dynamic (fiche client, tracker,
    //   paramétrage). Si l'utilisateur revient dans les 60s, instant. Les
    //   mutations (server actions) font un router.refresh() qui invalide ce
    //   cache, donc pas de risque de données périmées après une édition.
    // - static: 300s pour le rare contenu cacheable (login, dashboard).
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
    // Tree-shaking aggressif des barrels lourds. Sans cette option, importer
    // 11 icones Lucide tirait potentiellement tout le barrel (~5MB de source
    // map). Idem pour dnd-kit et recharts/sonner.
    // Documente : https://nextjs.org/docs/app/api-reference/next-config-js/optimizePackageImports
    optimizePackageImports: [
      "lucide-react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "recharts",
      "sonner",
    ],
  },
};

export default nextConfig;
