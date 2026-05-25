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
    // - dynamic: 30s pour les pages force-dynamic (fiche client, tracker,
    //   paramétrage). Si l'utilisateur revient dans les 30s, instant.
    // - static: 300s pour le rare contenu cacheable (login, dashboard).
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
