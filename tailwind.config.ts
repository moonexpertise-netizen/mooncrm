import type { Config } from "tailwindcss";

/**
 * Tailwind configuration MoonCRM.
 *
 * Dark mode : strategie "class" → active quand l'element <html> a la classe
 * `dark`. Cette classe est posee par ThemeProvider (cf. _components/theme).
 * Les tokens de couleur vivent dans app/globals.css (variables CSS HSL) :
 * la palette change selon `.dark` du root, et les classes utilitaires
 * `bg-card`, `text-foreground` etc. heritent automatiquement.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tokens sémantiques principaux (HSL via variables CSS)
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        // Surfaces (utilisables comme bg-surface, bg-surface-muted…)
        surface: "hsl(var(--surface))",
        "surface-muted": "hsl(var(--surface-muted))",
        "surface-elevated": "hsl(var(--surface-elevated))",
      },
    },
  },
  plugins: [],
};

export default config;
