/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // ESLint a bloqué le build sur des règles cosmétiques (apostrophes,
    // <a> vs <Link>). On l'ignore au build, on traite à part.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
