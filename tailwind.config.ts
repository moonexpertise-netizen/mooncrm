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
        // Sémantique (étaient définis en CSS mais jamais exposés en classes) :
        // utilisables en bg-success / text-danger / border-warning…
        success: "hsl(var(--success))",
        "success-soft": "hsl(var(--success-soft))",
        warning: "hsl(var(--warning))",
        "warning-soft": "hsl(var(--warning-soft))",
        danger: "hsl(var(--danger))",
        "danger-soft": "hsl(var(--danger-soft))",
        info: "hsl(var(--info))",
        "info-soft": "hsl(var(--info-soft))",
        // Accent doré MOON
        gold: "hsl(var(--gold))",
        "gold-soft": "hsl(var(--gold-soft))",
        "gold-dark": "hsl(var(--gold-dark))",
        // Focus ring (cf. --ring par thème)
        ring: "hsl(var(--ring))",
        // Sidebar (pour sortir du hardcode #0D1122)
        sidebar: "hsl(var(--sidebar))",
        "sidebar-foreground": "hsl(var(--sidebar-foreground))",
      },
      // Échelle z-index nommée : fini les magic numbers en collision.
      zIndex: {
        base: "0",
        dropdown: "1000",
        sticky: "1100",
        overlay: "1200",
        modal: "1300",
        popover: "1400",
        toast: "1500",
        command: "1600",
        skiplink: "2000",
      },
      // Mouvement : durées + courbes standard (mêmes valeurs que les tokens
      // CSS --dur-* / --ease-* de globals.css).
      transitionDuration: {
        fast: "120ms",
        base: "160ms",
        slow: "240ms",
      },
      transitionTimingFunction: {
        "out-soft": "cubic-bezier(0.16, 1, 0.3, 1)",
        standard: "cubic-bezier(0.4, 0, 0.2, 1)",
        bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      // Tailles fines manquantes (plancher info = 2xs/10px).
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
        label: ["13px", { lineHeight: "18px" }],
      },
      // Ombres calibrées MOON (alias des --shadow-* CSS).
      boxShadow: {
        card: "var(--shadow-sm)",
        "card-hover": "var(--shadow-md)",
        pop: "var(--shadow-lg)",
        modal: "var(--shadow-xl)",
      },
    },
  },
  plugins: [],
};

export default config;
