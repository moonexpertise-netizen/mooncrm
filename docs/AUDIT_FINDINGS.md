# Backlog findings — audit MoonCRM

Score global : **67/100** · 246 findings (9 critical, 57 high, 93 medium, 87 low)

## Fondations / Design System (globals.css, tailwind.config.ts, lib/utils.ts, layout.tsx + couche de compat thèmes)  (62/100)

_Le socle visuel est ambitieux et soigné : 3 thèmes cohérents en luminosité, palette Notion documentée, micro-animations premium, anti-FOUC propre. Mais les fondations reposent sur une stratégie fragile : une couche de compat CSS de ~600 lignes qui réécrit 1621 classes Tailwind hardcodées sur 92 fichiers au lieu de tokens sémantiques, ce qui laisse passer des trous (indigo cassé en dark/navy). Côté tokens, il manque les axes structurants (z-index, motion, focus) ce qui produit du chaos de stacking et zéro support reduced-motion. La dette n'est pas cosmétique, elle est architecturale._

### [critical/color/S] Couleur 'indigo' absente de la couche de compat → illisible en dark ET navy

PIPELINE_COLORS expose `"Z - Perdu dans l'espace": "bg-indigo-100 text-indigo-800 border-indigo-300"` (lib/utils.ts:71, ajouté au dernier commit 53af533). Or globals.css remappe en dark/navy emerald/amber/rose/sky/violet/fuchsia/blue/red/pink mais JAMAIS indigo : aucune règle `.dark .bg-indigo-100` n'existe. En dark/navy, `bg-indigo-100` tombe donc sur le Tailwind natif (#e0e7ff, quasi blanc) avec `text-indigo-800` (#3730a3) → badge clair sur fond sombre, contraste cassé, totalement hors-charte. indigo est aussi utilisé massivement dans finance-dashboard, facturation, tracker-table, mission-exc (badge IR, ARR pondéré) avec des `dark:` explicites là-bas, mais le badge pipeline passe par la classe nue. C'est un bug visuel actif sur 2 des 3 thèmes.

- **Fichiers** : lib/utils.ts:71, app/globals.css:563-589, app/globals.css:746-790
- **Reco** : Ajouter le bloc indigo dans les deux sections de compat de globals.css, aligné sur les autres familles : `.dark .bg-indigo-100 { background-color: hsl(232 30% 24%); }`, `.dark .text-indigo-800 { color: hsl(232 50% 76%); }`, `.dark .border-indigo-300 { border-color: hsl(232 35% 38%); }` (+ variantes /50, -500, -950 utilisées par kanban) et l'équivalent navy `.navy .bg-indigo-100 { background-color: hsl(232 45% 22%); }`. Mieux : faire de PIPELINE_COLORS le seul endroit qui décide, et basculer ces badges sur des tokens (cf. finding tokens sémantiques).

### [high/accessibility/S] Aucune gestion de prefers-reduced-motion (WCAG 2.3.3)

Recherche exhaustive : 0 occurrence de `prefers-reduced-motion`, `motion-reduce:` ou `motion-safe:` dans tout le repo (CSS + composants). Or le design system pousse des animations marquées : achievement-pop avec overshoot bounce sur 0.55s (cubic-bezier 0.34,1.56,0.64,1 = dépassement franc), row-highlight-flash 2.4s, slide-in-right, plus la transition globale sur button/a/select. Pour un utilisateur sensible au mouvement (troubles vestibulaires), c'est inconfortable, et c'est un échec WCAG AA explicite. L'app vise une version 'définitive et parfaite' : c'est une lacune de conformité non négociable.

- **Fichiers** : app/globals.css:799-863, app/globals.css:911-915
- **Reco** : Ajouter en fin de globals.css un bloc global : `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }`. Pour les animations signifiantes (achievement-pop, row-highlight) garder l'apparition mais neutraliser le translate/scale via une variante reduced (fade seul).

### [high/consistency/M] Aucune échelle de z-index : valeurs magiques en collision

248 occurrences de z-index, mélange de `z-10/20/30/40/50` (échelle Tailwind) et d'arbitraires `z-[900] z-[950] z-[999] z-[1000] z-[1500] z-[2000]`. Plusieurs surfaces revendiquent le MÊME niveau sans coordination : `z-[1000]` est utilisé par confirm-modal, form-modal, delete-button, achievement-card, finance-dashboard, mission-exc-table — donc l'ordre d'empilement entre une modale et la carte achievement ou un dropdown de delete dépend de l'ordre DOM, pas de l'intention. La command-palette est à 1500, le skip-link à 2000, le chat à 900/950 : ces nombres ont été choisis isolément. Risque réel de toast/modale/popover passant sous/au-dessus du mauvais élément.

- **Fichiers** : app/_components/confirm-modal.tsx:133, app/_components/form-modal.tsx:96, app/clients/[slug]/achievement-card.tsx:102, app/finance/finance-dashboard.tsx:1185, tailwind.config.ts:19-41
- **Reco** : Définir une échelle nommée dans tailwind.config.ts `extend.zIndex`: `{ base:'0', dropdown:'1000', sticky:'1100', overlay:'1200', modal:'1300', popover:'1400', toast:'1500', command:'1600', skiplink:'2000' }` puis remplacer progressivement les z-[...] par `z-modal`, `z-popover`, etc. Documenter l'ordre dans le commentaire de tête de globals.css. Priorité : aligner modales (1300) > dropdowns (1000) > sticky toolbars (1100).

### [high/consistency/L] Stratégie thèmes fondée sur la réécriture de 1621 classes hardcodées (dette structurelle)

1621 occurrences de bg-white/text-zinc-*/border-zinc-*/bg-zinc-* sur 92 fichiers. Le dark/navy ne marche pas par tokens mais par ~600 lignes de compat CSS qui interceptent ces classes nues (`.dark .bg-zinc-100 {…}`, plus l'override navy de chaque opacité blanche). C'est ingénieux mais intrinsèquement fragile : (1) tout `bg-*-100` non listé casse silencieusement (cf. indigo) ; (2) chaque nouvelle nuance/opacité oblige à éditer 2 blocs (.dark + .navy) ; (3) la cascade repose sur 'la classe explicite dark: gagne' alors que des `!important` navy sont déjà nécessaires (lignes 262-305) — fragile au moindre conflit de spécificité ; (4) impossible de raisonner sur 'la couleur d'une card' sans grep. Le coût marginal de chaque écran augmente.

- **Fichiers** : app/globals.css:405-796, app/_components/ui.tsx:202, tailwind.config.ts:21-39
- **Reco** : Geler la compat (ne plus l'étendre) et router les nouveaux composants sur les tokens déjà exposés : `bg-card`, `bg-surface-muted`, `border-border`, `text-foreground`, `text-muted-foreground`. Ajouter dans tailwind.config.ts les tokens manquants (`muted-foreground` y est, mais pas de `surface-hover`/`overlay`). Cibler en priorité ui.tsx (Card/Toolbar/EmptyState font déjà `bg-white dark:bg-[hsl(var(--card))]` → remplacer par `bg-card` tout court) pour que les primitives cessent de dépendre de la compat.

### [medium/consistency/M] Tokens sémantiques (success/warning/danger/info) et border-strong définis mais jamais consommés

globals.css définit --success/--success-soft/--warning/--danger/--info dans les 3 thèmes (lignes 50-57, 139-146, 211-218) et border-strong est exposé dans tailwind.config.ts:26. Mais grep `bg-success|text-success|bg-danger|border-strong` en classes Tailwind = 0 hit applicatif. Le sémantique est donc redéclaré 'à la main' partout en emerald/amber/rose/sky (cf. STATUT_COLORS, STATUS_TEXT, BADGE_TONE dans ui.tsx, les 40 fichiers avec text-emerald-600…). Conséquence : 3 sources de vérité pour 'succès' (token CSS mort + classe Tailwind + compat dark), d'où l'effort de maintenance et les divergences de teinte entre dark (149 40% 60%) et navy. Ces tokens morts donnent une fausse impression de design system mûr.

- **Fichiers** : app/globals.css:49-57, tailwind.config.ts:26, lib/utils.ts:28-33, app/_components/ui.tsx:111-121
- **Reco** : Soit (A) brancher : ajouter `success/warning/danger/info` + leurs `-soft` dans tailwind.config.ts `colors` (comme surface), exposer `border-strong` réellement, et migrer STATUT_COLORS/STATUS_TEXT vers ces tokens — la compat dark des emerald/amber devient alors inutile pour le sémantique. Soit (B) supprimer les tokens morts pour ne pas induire en erreur. (A) est l'investissement qui réduit la dette du finding précédent.

### [medium/accessibility/M] Focus visible incohérent : outline CSS (thème) vs ring zinc-400 (composants), navy oublié

Deux systèmes de focus coexistent. (1) globals.css:901 `:focus-visible { outline: 2px solid hsl(240 5% 65%) }` avec override `.dark` (hsl 240 5% 75%) mais AUCUN override `.navy` → en navy le focus reste un gris froid posé sur du bleu, peu lisible et hors-charte. (2) Button (ui.tsx:26) ignore cet outline et utilise `focus-visible:ring-2 ring-zinc-400 ring-offset-2` : ring gris fixe identique dans les 3 thèmes, `ring-offset` sans `ring-offset-color` explicite (prend --background, OK en light mais douteux en navy). Résultat : le focus n'est ni cohérent entre éléments, ni à l'identité dorée MOON, ni adapté au navy. Pour une app clavier-first (command palette, raccourcis), c'est un point sensible.

- **Fichiers** : app/globals.css:899-909, app/_components/ui.tsx:26, app/globals.css:176-226
- **Reco** : Unifier sur un token focus : ajouter `--ring: var(--gold)` (ou un zinc clair) par thème + `.navy :focus-visible { outline-color: hsl(226 60% 70%); }`. Dans ui.tsx, remplacer `ring-zinc-400` par `focus-visible:ring-[hsl(var(--gold))]` ou `ring-ring`, et fixer `ring-offset-color` via `focus-visible:ring-offset-background`. Viser un seul style focus (anneau OU outline) sur tous les interactifs.

### [medium/fluidity/S] Pas de tokens de motion : durées/easings dupliqués en dur dans les keyframes et JS

Les durées (0.12s/0.15s/0.16s/0.18s/0.55s/2.4s/80ms/140ms) et 2 courbes (`cubic-bezier(0.16,1,0.3,1)` répétée 4×, `0.4,0,0.2,1`) sont écrites en dur, dispersées dans globals.css et aussi inline dans app-shell.tsx:121 (`ease-[cubic-bezier(0.4,0,0.2,1)]` + duration-300). Aucune variable `--ease-*` / `--duration-*`. Conséquence : impossible de garantir un rythme d'animation homogène, le tuning global (ex. ralentir tout de 10%) implique d'éditer N endroits, et rien ne relie ces valeurs au reduced-motion. C'est exactement le genre d'incohérence subtile qui empêche le 'feel Linear' d'être parfaitement régulier.

- **Fichiers** : app/globals.css:803-859, app/globals.css:911-915, app/_components/app-shell.tsx:121
- **Reco** : Déclarer dans :root `--ease-out: cubic-bezier(0.16,1,0.3,1); --ease-standard: cubic-bezier(0.4,0,0.2,1); --ease-bounce: cubic-bezier(0.34,1.56,0.64,1); --dur-fast:120ms; --dur-base:160ms; --dur-slow:240ms;` et les réutiliser dans les keyframes + exposer en tailwind.config (`transitionTimingFunction`, `transitionDuration`). Remplacer le cubic-bezier inline d'app-shell par le token.

### [medium/consistency/S] Toaster sonner en theme='system' : désynchronisé du toggle in-app et du navy

layout.tsx:66 monte `<Toaster theme="system">`. Mais le ThemeProvider gère un état applicatif (light/dark/navy/system) stocké dans localStorage et indépendant de prefers-color-scheme. Si l'utilisateur force 'Clair' alors que son OS est en sombre, l'app est claire mais les toasts sonner suivent l'OS → toasts sombres sur app claire. Et 'navy' n'existe pas pour sonner (au mieux il rend 'dark'), donc les toasts n'auront jamais la teinte navy. Le commentaire ligne 64 ('suit automatiquement html.dark') est faux : sonner system lit la media query, pas la classe html.

- **Fichiers** : app/layout.tsx:61-77, app/_components/theme-provider.tsx:49-70
- **Reco** : Brancher sonner sur le thème résolu réel : `const { resolvedTheme } = useTheme();` puis `<Toaster theme={resolvedTheme === 'light' ? 'light' : 'dark'} />` (navy → dark). Cela nécessite de remonter le Toaster dans un petit composant client sous ThemeProvider, ou d'exposer resolvedTheme via un wrapper.

### [low/color/S] Gradients de fond non-thémés en dur (bleu nuit) → tache froide en navy/light mal calibrée

body en light a un radial `hsl(230 35% 9% / 0.04)` (lignes 318-320) = une tache navy posée sur fond gris très doux : peu visible mais c'est une couleur hardcodée hors token. En dark, `hsl(220 50% 30% / 0.06)` (ligne 333) introduit une teinte BLEUE dans le thème 'gris pur Notion, saturation 0 partout, interdit le bleu nuit' explicitement spécifié lignes 102-103 → contradiction directe avec la spec du thème dark. La navy redéfinit bien son gradient (232-236) mais le dark garde un voile bleu non voulu.

- **Fichiers** : app/globals.css:316-334, app/globals.css:102-103
- **Reco** : En dark, retirer la teinte bleue du gradient ambient et la passer en neutre gold-only ou gris : `radial-gradient(at 95% 5%, hsl(0 0% 30% / 0.05) …)` pour respecter 'saturation 0'. Sortir les couleurs en variables `--ambient-1/--ambient-2` par thème plutôt qu'en littéraux HSL.

### [low/performance/S] Reset border global * { border-color } : coût et surprises de cascade

globals.css:308 applique `* { border-color: hsl(var(--border)); }` à TOUS les éléments. C'est le pattern shadcn, mais combiné à une app de 1621 classes border-zinc et à la couche de compat, cela signifie que tout élément sans border-color explicite hérite du token — utile, mais (1) ajoute une déclaration au recalcul de style sur chaque nœud, (2) masque les oublis de border (un dev croit voir border-border alors qu'aucune width n'est posée), (3) entre en concurrence implicite avec les centaines de border-zinc remappées. Sur les grandes tables (tracker-table 78 classes border, clients-table) le nombre de nœuds rend ce sélecteur universel non gratuit.

- **Fichiers** : app/globals.css:308
- **Reco** : Restreindre à ce qui a une bordure : viser `*, ::before, ::after { border-color: hsl(var(--border)); }` reste acceptable, mais documenter que la width doit être explicite. Alternative plus saine à terme : supprimer le reset universel une fois les composants migrés sur `border border-border` explicite.

### [low/visual/M] Pas d'échelle d'espacement/radius/typo tokenisée : valeurs arbitraires text-[10px]/[11px]/[13px]/[15px]

tailwind.config.ts n'étend QUE les couleurs : aucun fontSize, spacing, borderRadius custom. Le design réel s'appuie pourtant sur une micro-échelle typographique non standard très présente (text-[10px], text-[11px], text-[13px], text-[15px] visibles dans ui.tsx EmptyState/Badge/Kbd et partout). Ces valeurs en pixels arbitraires court-circuitent l'échelle rem de Tailwind (text-xs=12px, text-sm=14px) : la hiérarchie typo n'est ni nommée ni cohérente d'un écran à l'autre, et chaque dev re-choisit 13 vs sm. Idem radius : rounded-md/lg/xl mélangés sans règle (Card=rounded-lg, popover theme-toggle=rounded-xl, EmptyState=rounded-lg).

- **Fichiers** : tailwind.config.ts:19-41, app/_components/ui.tsx:180, app/_components/ui.tsx:269-271, app/_components/ui.tsx:321
- **Reco** : Ajouter dans tailwind.config.ts `fontSize` nommés alignés sur l'usage réel (`'2xs':['10px',…], 'xs':['11px',…], 'label':['13px',…], 'base':['15px',…]`) et formaliser une règle de radius (cards & boutons = lg ; surfaces flottantes = xl ; pills = md). Documenter l'échelle en tête de globals.css à côté des shadows.

### [low/performance/S] Fraunces chargé (3 poids + italique) mais probablement non utilisé : la display réelle est Funnel_Display

layout.tsx importe et instancie Fraunces (weights 400/500/600 + normal/italic = jusqu'à 6 fichiers de fonte) et l'expose en `--font-fraunces`. Mais globals.css branche `.font-display`, h1-h4 et `--font-display` sur Funnel_Display, jamais sur --font-fraunces. Le mémo projet décrit Fraunces comme la police display des titres, mais le code utilise Funnel_Display. Si --font-fraunces n'est référencé nulle part (à confirmer côté composants), on paie le téléchargement de Fraunces + variabilité italic pour rien — pénalité réseau/CLS sur le chemin critique du layout racine.

- **Fichiers** : app/layout.tsx:2-27, app/globals.css:356-369
- **Reco** : Grep `font-fraunces` dans tout le repo. Si 0 usage : retirer l'import Fraunces du layout (gain net sur le LCP/fonts). Si usage réel mais marginal : réduire à `weight:['400']` sans italic. Sinon, trancher l'intention design (Fraunces vs Funnel_Display pour les titres) et l'appliquer dans globals.css h1-h4 pour cohérence avec le brief.

### [low/color/S] Style des <option> de select non couvert en navy (et hover natif non fiable)

globals.css:888-897 force le fond des `<option>`/`optgroup` en dark à `hsl(0 0% 14.5%)` gris. Mais (1) aucune règle `.navy select option` → en navy les dropdowns natifs retombent sur le gris dark (incohérent avec le bleu de toute l'app) ou sur le rendu OS ; (2) `option:hover` n'est de toute façon pas stylable de façon fiable en Chromium (le hover des options natives ignore largement le CSS auteur), donc la règle ligne 894 donne un faux sentiment de contrôle. Sur une app dense avec beaucoup de selects (47 fichiers avec des selects), le dropdown qui jure casse la perception premium.

- **Fichiers** : app/globals.css:875-897, app/_components/picker.tsx
- **Reco** : Ajouter `.navy select option, .navy select optgroup { background-color: hsl(226 47% 19%); color: hsl(0 0% 94.5%); }`. Pour un rendu réellement maîtrisé (hover, teinte), envisager de remplacer les selects critiques par le composant Picker maison (déjà présent dans _components/picker.tsx) plutôt que de lutter contre le natif.

## Navigation : shell + sidebar + thème + palette  (63/100)

_La navigation est riche et soignée (collapse persistant, drag-reorder, badges, flyout Production, palette Cmd+K) mais plusieurs défauts cassent l'expérience définitive visée. Bug bloquant : en mode replié, les tooltips et le sous-menu Production sont clippés par `overflow-x-hidden` du `<nav>`, rendant la sidebar collapse quasi inutilisable. Côté thèmes, le ClientSwitcher et le ruban supérieur reposent sur du blanc/zinc hardcodé corrigé partiellement par la couche de compat, avec un focus-ring quasi-invisible en navy et un état highlight peu lisible. Aucune prise en charge de `prefers-reduced-motion` sur des animations pourtant nombreuses._

### [critical/fluidity/M] Tooltips et flyout Production clippés en mode replié

Le conteneur `<nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">` (sidebar.tsx:492) crée un contexte de scroll qui clippe l'axe X. Or, en mode replié (md:w-14), la SEULE façon de connaître le label d'une rubrique est le tooltip `absolute left-full ml-2` (sidebar.tsx:582-583) et le sous-menu Production complet (sidebar.tsx:586-606) — tous deux positionnés au-delà du bord droit du nav. `overflow-x-hidden` les coupe net : ils ne s'affichent jamais. La sidebar repliée devient une colonne d'icônes muettes sans aucune découvrabilité des sous-trackers. C'est le défaut le plus grave de la surface.

- **Fichiers** : app/_components/sidebar.tsx:492, app/_components/sidebar.tsx:582, app/_components/sidebar.tsx:586
- **Reco** : Ne pas clipper X sur le conteneur qui héberge des popovers. Option A (simple) : retirer `overflow-x-hidden` et garder `overflow-y-auto` uniquement sur un wrapper interne, en laissant les tooltips dans un parent non-clippé. Option B (robuste) : rendre les tooltips/flyout via un portail (createPortal) positionné en `fixed` calculé depuis le rect de l'item, comme la CommandPalette. Vérifier ensuite que l'indicateur actif `-left-2` (sidebar.tsx:526) et la poignée drag `-translate-x-2` (sidebar.tsx:783) restent visibles.

### [high/fluidity/M] Largeur main désynchronisée de la sidebar pendant le collapse

Le collapse pilote DEUX états React séparés : `collapsed` dans Sidebar (qui anime sa propre width via classes Tailwind, sidebar.tsx:430) et `collapsed` dans AppShell (qui anime `marginLeft` du main via style inline, app-shell.tsx:125), synchronisés par un CustomEvent. Les deux transitions sont déclarées indépendamment (`transition-[width,transform]` 300ms cubic-bezier vs `transition-[margin] duration-300 ease-[cubic-bezier...]`). Elles partent au même tick mais sur des propriétés/éléments distincts : tout micro-écart de courbe ou de déclenchement crée un décalage perceptible (un liseré de fond apparaît/disparaît entre la sidebar et le contenu pendant les 300ms). Sur une app premium type Linear, le rail et le contenu doivent bouger comme un seul bloc.

- **Fichiers** : app/_components/app-shell.tsx:119, app/_components/sidebar.tsx:419, app/_components/sidebar.tsx:139
- **Reco** : Piloter la largeur par une seule variable CSS sur un ancêtre commun : `--sidebar-w` (56px/240px) sur `<html>` ou `<body>`, consommée par `width` de l'aside ET `margin-left` du main. Une seule transition, une seule source de vérité, plus de CustomEvent inter-composant. Met aussi fin au risque de désynchro localStorage/event. Conserver le fallback 240 avant mount.

### [high/accessibility/S] Aucune prise en charge de prefers-reduced-motion

Aucune règle `@media (prefers-reduced-motion: reduce)` dans tout app/ (grep = 0 résultat). Or la surface anime beaucoup : slide de la sidebar 300ms, slide-up-fade des popovers, achievement-pop avec overshoot bounce (globals.css:826), row-highlight 2.4s, la rotation+halo du bouton Jarvis, le `animate-pulse` de l'enregistrement vocal. Pour un utilisateur sensible au mouvement (WCAG 2.3.3 Animation from Interactions), c'est inconfortable voire bloquant. La transition global sur `button, a, select` (globals.css:911) s'applique aussi sans garde-fou.

- **Fichiers** : app/globals.css:826, app/globals.css:911, app/_components/sidebar.tsx:424
- **Reco** : Ajouter en fin de globals.css : `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }`. Affiner si besoin pour garder les fondus d'opacité (acceptables) mais supprimer translate/scale/bounce. Vérifier que le collapse reste fonctionnel (juste instantané).

### [high/consistency/M] ClientSwitcher : couleurs hardcodées, incohérent avec la palette de commandes

Le ClientSwitcher n'a quasiment aucune variante `dark:` explicite : input `border-zinc-300 bg-white` (client-switcher.tsx:123), panneau `border bg-white shadow-xl` (l.131), footer `bg-zinc-50/60` (l.183), kbd `bg-zinc-100 border-zinc-200` (l.126). Il ne tient en dark/navy QUE grâce à la couche de compat globale (`.dark .bg-white`, etc.). À l'inverse, la CommandPalette voisine fait tout proprement avec `dark:bg-[hsl(var(--surface-elevated))]`, `shadow-modal`, bordures token. Résultat : deux surfaces de recherche jumelles au rendu et aux ombres différents (`shadow-xl` brut vs `shadow-modal`, `bg-white` remappé en `--card` vs `--surface-elevated` pour un popover). Sur navy, le panneau hérite de `--card` au lieu de `--surface-elevated`, donc une élévation incohérente avec les autres popovers.

- **Fichiers** : app/_components/client-switcher.tsx:123, app/_components/client-switcher.tsx:131, app/_components/client-switcher.tsx:183
- **Reco** : Aligner le ClientSwitcher sur la CommandPalette : panneau `bg-white dark:bg-[hsl(var(--surface-elevated))] border-zinc-200/70 dark:border-white/[0.08] shadow-modal`, input `dark:bg-white/[0.04] dark:border-white/[0.08]`, footer `dark:bg-white/[0.03]`, kbd `dark:bg-white/[0.04] dark:border-white/[0.08]`. Ne plus dépendre de la couche de compat pour un composant aussi central.

### [high/efficiency/L] Deux raccourcis de recherche concurrents et redondants (Cmd+K vs Ctrl+F)

La surface expose DEUX recherches qui se recouvrent largement : CommandPalette (Cmd/Ctrl+K, routes + trackers + clients) et ClientSwitcher (Ctrl/Cmd+F, clients seuls), affichés côte à côte dans le ruban (app-shell.tsx:147-148). Pour un expert-comptable rapide, c'est de la charge cognitive : deux champs, deux raccourcis, deux comportements clavier subtilement différents (la palette a un focus-trap, pas le switcher ; la palette groupe par section, le switcher montre une pastille pipeline). Ctrl+F surcharge en plus le 'rechercher dans la page' natif (désactivé ici sur desktop non-touch), ce qui peut surprendre. Le switcher fait doublon avec la section Clients de la palette.

- **Fichiers** : app/_components/app-shell.tsx:146, app/_components/client-switcher.tsx:45, app/_components/command-palette.tsx:111
- **Reco** : Décider d'une primitive unique. Recommandé : supprimer le ClientSwitcher du ruban et enrichir la CommandPalette (qui sait déjà chercher les clients) — gagner la pastille pipeline dans ItemRow via PIPELINE_COLORS. Si Benjamin tient au champ visible 'Aller au dossier', garder le champ mais le faire ouvrir la palette pré-filtrée plutôt que dupliquer la logique. Réserver Ctrl+F au natif.

### [high/color/S] Focus-ring du ClientSwitcher quasi invisible en navy

L'input ClientSwitcher utilise `focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60` (client-switcher.tsx:123). En navy, `--gold` est 38 55% 68% (or clair chaud) mais à 30% d'opacité sur un fond `--card` bleu très sombre, le halo est extrêmement ténu. Surtout, c'est le SEUL focus visible : il n'y a pas de fallback `:focus-visible` outline ici car `focus:outline-none` est posé. Combiné au champ qui pilote la navigation principale au clavier, l'utilisateur clavier perd le repère de focus en navy. Le reste de l'app utilise un outline zinc neutre `:focus-visible` (globals.css:901) plus lisible.

- **Fichiers** : app/_components/client-switcher.tsx:123, app/globals.css:901
- **Reco** : Monter l'opacité du ring (`/40` voire `/50`) et l'épaissir, OU s'aligner sur le pattern global `:focus-visible` en retirant `focus:outline-none`. Idéalement utiliser le même ring 4px que le textarea Jarvis (`focus:ring-4 focus:ring-[hsl(var(--gold))]/15 focus:border-[hsl(var(--gold))]/60`, chat-bubble.tsx:715) pour cohérence inter-surfaces, mais en remontant la saturation perçue en navy.

### [medium/color/S] Backdrop de la CommandPalette teinté zinc, pas token — incohérent en navy

Le backdrop de la palette est `bg-zinc-900/40 backdrop-blur-md` en dur (command-palette.tsx:214), tandis que celui du drawer sidebar mobile est `bg-black/40` (sidebar.tsx:414) et le ChatBubble n'en a pas. Trois overlays modaux, trois valeurs. En navy, un voile zinc-900 (gris neutre) au-dessus d'un fond bleuté jure légèrement et casse la teinte MOON. Détail mais visible sur une surface qui se veut définitive.

- **Fichiers** : app/_components/command-palette.tsx:214, app/_components/sidebar.tsx:414
- **Reco** : Unifier les backdrops modaux sur un token, p.ex. `bg-[hsl(var(--foreground))]/40` ou un `--overlay` dédié (navy: bleu très sombre/50). Aligner palette + drawer mobile sur la même valeur et la même intensité de blur.

### [medium/color/M] Sidebar : texte des items en zinc-300/400 figé, ignore --sidebar-foreground

L'aside fixe sa couleur de texte à `text-zinc-300` (sidebar.tsx:421) et les items inactifs à `text-zinc-400` (l.522), valeurs zinc en dur. Le design system définit pourtant un token `--sidebar-foreground` qui varie par thème (light 240 5% 84%, dark 0 0% 81%, navy 226 22% 82% — bleuté). Comme la sidebar est toujours sombre, `text-zinc-400` est de plus remappé par la compat layer `.dark .text-zinc-400 -> 66%` quand le thème dark/navy est actif, mais PAS en thème clair (où la sidebar reste sombre mais zinc-400 garde sa valeur claire d'origine ~64%). Les contrastes des labels inactifs varient donc d'un thème à l'autre sans intention, et la teinte bleutée navy prévue par le token n'est jamais appliquée.

- **Fichiers** : app/_components/sidebar.tsx:421, app/_components/sidebar.tsx:519, app/globals.css:41
- **Reco** : Faire consommer `--sidebar-foreground` aux items (`text-[hsl(var(--sidebar-foreground))]`) et un `--sidebar-foreground-muted` pour les inactifs, plutôt que des classes zinc soumises aux aléas de la compat layer. Garantit un contraste constant et la teinte navy voulue. Vérifier le ratio des inactifs ≥ 4.5:1 sur `--sidebar`.

### [medium/performance/M] CommandPaletteHint déclenche un faux KeyboardEvent au lieu d'un état partagé

Le bouton 'Rechercher…' du ruban synthétise un `new KeyboardEvent('keydown', {key:'k', metaKey...})` dispatché sur window (app-shell.tsx:178-184) pour que le listener de CommandPalette l'attrape et toggle. C'est fragile : couplage par effet de bord clavier, dépend du parsing `e.key.toLowerCase()==='k'` (command-palette.tsx:111), et un clic re-déclenche un TOGGLE (pas un open) — recliquer le Hint pendant que la palette est ouverte la referme, ce qui n'est pas le mental model d'un bouton 'ouvrir'. Aucune raison de passer par le clavier alors que les deux composants sont rendus par AppShell.

- **Fichiers** : app/_components/app-shell.tsx:173, app/_components/command-palette.tsx:109
- **Reco** : Remonter l'état d'ouverture de la palette dans un petit contexte (ou un store zustand/event typé `moon:open-palette`) exposant `open()`. Le Hint appelle `open()` (idempotent), la touche Cmd+K toggle. Supprime la synthèse d'événement clavier et le comportement toggle accidentel.

### [medium/performance/M] console.log de debug laissés sur le chemin de rendu (badges sidebar)

À chaque changement de route, l'effet badges loggue `console.log('[sidebar-badges]', b)` (sidebar.tsx:296) et la loader logge aussi côté serveur. Sur une app de prod 'définitive', c'est du bruit console à chaque navigation (et `loadSidebarBadges` lance 9 requêtes Supabase en parallèle à CHAQUE route — cf. sidebar-badges-loader.ts:43). Le coût réseau est masqué mais réel : naviguer entre deux trackers re-tire 9 counts dont aucun n'a changé.

- **Fichiers** : app/_components/sidebar.tsx:289, app/_components/sidebar-badges-loader.ts:43
- **Reco** : Retirer le console.log (et le console.error verbeux en prod, garder un report silencieux). Pour les badges : ne pas re-fetcher sur chaque pathname — déclencher un refetch ciblé seulement après une mutation (event `moon:badges-refresh` émis par les pages qui changent un statut, ou router.refresh + cache court). Réduit la pression Supabase de la navigation.

### [medium/visual/M] Hiérarchie des rubriques plate : 13 items de même poids, pas de groupes

NAV_ITEMS aligne 13 entrées de niveau 1 strictement équivalentes (sidebar.tsx:96-131) : Dashboard, Clients, Pipeline, Onboarding, Paramétrage, Missions exc., Échéances, Créations, IR+IFI, CAA, Pilotage, Facturation, Finance. Aucun séparateur ni libellé de section, alors que ces items relèvent de familles distinctes (Pilotage commercial / Production récurrente / Missions ponctuelles / Finance & facturation). Le module Production a, lui, une riche hiérarchie interne (headers de groupes), ce qui crée un déséquilibre : tout est plat sauf un bloc. Pour scanner vite, l'œil n'a aucun point d'ancrage. Le drag-reorder atténue mais ne remplace pas une structure.

- **Fichiers** : app/_components/sidebar.tsx:96, app/_components/sidebar.tsx:498
- **Reco** : Introduire 3-4 sections avec micro-eyebrows (`text-[10px] uppercase tracking-wider text-zinc-500 px-3 pt-3`) : 'Pilotage', 'Production', 'Missions', 'Finance'. Garder le drag DANS chaque section. En mode replié, remplacer les eyebrows par un fin séparateur `border-white/[0.06]`. Aligne la sidebar sur le pattern Linear (sections + items).

### [medium/accessibility/S] Cibles tactiles desktop sous le minimum sur les contrôles secondaires

Plusieurs cibles cliquables font < 44px et même < 32px : le chevron replier/déplier Production est `h-8 px-1.5` (sidebar.tsx:569) soit ~28×32, la poignée drag `w-4 h-6` (sidebar.tsx:784) soit 16×24, le dot chevron du rail `w-5 h-10` (sidebar.tsx:447). Le toggle de thème est `w-9 h-9` (36px, ok desktop mais < 44). Sur desktop précis ça passe, mais le chevron Production et la poignée drag sont vraiment petits pour un usage répété et rapide, et la poignée n'apparaît qu'au hover (pas de focus-visible persistant pour découverte clavier au-delà de `focus:opacity-100`).

- **Fichiers** : app/_components/sidebar.tsx:565, app/_components/sidebar.tsx:784, app/_components/sidebar.tsx:445
- **Reco** : Élargir les zones de hit sans changer le visuel : chevron Production `h-8 w-8` min, poignée drag étendre la hit-zone à `w-6 h-8` avec l'icône centrée. Vérifier que la poignée est atteignable au clavier (elle l'est via dnd KeyboardSensor mais le bouton lui-même devrait montrer un focus-ring). Cibles ruban ≥ 36px conservées, ok desktop.

### [medium/consistency/M] Indicateur actif incohérent entre niveau 1, sous-trackers et footer

Trois traitements de l'état actif coexistent : items niveau 1 = barre gold `-left-2 w-[3px]` + `bg-white/[0.08] text-white` (sidebar.tsx:524-526) ; sous-trackers = dot gold `w-1 h-1` + `text-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10` (sidebar.tsx:657,662) ; lien Admin footer = `bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))]` SANS barre ni dot (sidebar.tsx:700). Le texte actif est tantôt blanc (niveau 1), tantôt gold (sous-items, admin). L'œil reçoit trois langages pour la même information 'tu es ici'.

- **Fichiers** : app/_components/sidebar.tsx:524, app/_components/sidebar.tsx:656, app/_components/sidebar.tsx:699
- **Reco** : Définir une règle unique : barre gold à gauche = 'page active' à tous les niveaux (avec indentation pour les enfants), texte actif toujours `text-white`/`--sidebar-foreground` renforcé, fond `bg-white/[0.08]`. Réserver le gold au liseré et aux accents, pas au texte des items (le texte gold sur fond gold/10 est l'option la moins lisible en clair). Appliquer aussi au lien Admin.

### [medium/accessibility/M] Drawer mobile sans focus-trap ni gestion clavier/Esc

La CommandPalette utilise useFocusTrap + Esc proprement (command-palette.tsx:106,182), mais le drawer mobile de la sidebar (aside translaté, sidebar.tsx:419-431) n'a aucun piège de focus, pas d'Esc pour fermer, et l'overlay (sidebar.tsx:408) est un `<div onClick>` non focusable sans `role`. Quand le drawer est ouvert, le focus clavier peut sortir derrière l'overlay. L'aside n'a pas non plus de `role="dialog"`/`aria-modal` ni d'`aria-hidden` sur le contenu sous-jacent. Sur mobile c'est surtout tactile, mais un clavier Bluetooth ou un lecteur d'écran reste piégé incorrectement.

- **Fichiers** : app/_components/sidebar.tsx:408, app/_components/sidebar.tsx:419, app/_components/sidebar.tsx:266
- **Reco** : Quand `mobileOpen`, appliquer useFocusTrap sur l'aside, ajouter `role="dialog" aria-modal="true"` + un handler Esc qui ferme, et `inert`/`aria-hidden` sur le main. Réutiliser le hook existant pour cohérence avec la palette.

### [low/efficiency/S] withYear() applique ?year= au lien parent 'Échéances' et brouille l'URL

`withYear` ajoute `?year=` à tout href commençant par /obligations (sidebar.tsx:398-403), y compris le lien parent `/obligations` (le hub Échéances) et tous les sous-trackers. Cliquer 'Échéances' depuis une page production amène sur `/obligations?year=2025` même si l'utilisateur voulait la vue d'ensemble. C'est défendable (mémoriser l'année) mais l'année est aussi persistée en localStorage : le query param sur le hub est redondant et pollue l'historique/partage d'URL. Par ailleurs `persistedObligationsYear` peut figer une année passée longtemps après.

- **Fichiers** : app/_components/sidebar.tsx:398, app/_components/sidebar.tsx:530
- **Reco** : N'appliquer withYear qu'aux sous-trackers (`/obligations/<slug>`), pas au hub `/obligations`. Le hub lira l'année depuis localStorage côté page. Optionnel : borner persistedObligationsYear à l'année courante par défaut au-delà d'un certain âge.

### [low/fluidity/M] Palette : index global vs filtrage par section désynchronisé, scroll-into-view fragile

La CommandPalette calcule `items` à plat puis re-filtre par kind dans le rendu en recalculant l'index global via `.map((it,i)=>({it,i})).filter(...)` répété 3 fois (command-palette.tsx:253-308). `selectedIdx` indexe la liste à plat, mais l'ordre visuel (routes, puis trackers, puis clients) suppose que `items` est déjà dans cet ordre — c'est le cas, mais le couplage est implicite et casse au moindre changement d'ordre des sections. Le scroll-into-view cible `[data-idx]` (l.177) ; si deux sections partagent une valeur d'idx par erreur de refacto, la nav clavier saute. C'est correct aujourd'hui mais fragile pour une base 'définitive'.

- **Fichiers** : app/_components/command-palette.tsx:248, app/_components/command-palette.tsx:173
- **Reco** : Construire un seul tableau ordonné avec un champ `section`, mapper une fois en gardant l'index, et insérer les SectionHeader par détection de changement de section dans la boucle unique. Élimine la triple itération et rend l'index/scroll robustes.

### [low/visual/S] Palette : pas d'état de chargement clients, le footer 'X clients indexés' clignote

À l'ouverture, les clients sont fetchés async (command-palette.tsx:122-124). Tant qu'ils n'arrivent pas, taper un nom de client ne renvoie 'Aucun résultat' (l.243) alors que les données arrivent juste après — faux négatif perçu. Le footer n'affiche le compteur que si `clients.length>0` (l.327), donc il apparaît d'un coup. Aucun skeleton ni 'Chargement des dossiers…'. Pour un utilisateur rapide qui ouvre Cmd+K et tape immédiatement, l'impression est 'la recherche client ne marche pas'.

- **Fichiers** : app/_components/command-palette.tsx:121, app/_components/command-palette.tsx:243
- **Reco** : Afficher un état transitoire 'Recherche des dossiers…' quand `query` cible des clients mais `clients` est encore vide, et précharger le cache clients au mount de l'AppShell (pas à l'ouverture) pour que la première frappe trouve déjà les dossiers. Le cache 30s existe déjà côté module.

## Dashboard d'accueil + BI (app/page.tsx, app/_dashboard/*)  (62/100)

_Surface dense et bien structurée (4 KPI + 4 blocs en grille 2x2), avec des intentions soignées (toggle Nb/€, drill-down, labels FR compacts). Mais elle pèche sur trois axes décisifs pour une « version définitive » : (1) les charts Recharts ne sont PAS theme-aware — couleurs d'axes/labels/curseur en hex codé en dur qui restent gris-sombre-sur-sombre en dark/navy, alors que le dashboard Finance voisin a déjà résolu le problème proprement ; (2) l'interaction phare « clique sur une barre pour filtrer » est cassée (le param ?pipeline= n'est jamais lu par la table clients) ; (3) zéro prise en charge de l'accessibilité (pas de reduced-motion, toggles et barres cliquables sans sémantique clavier/aria). Le fond business est solide, mais le rendu multi-thèmes et la fiabilité des drill-downs ne sont pas au niveau Linear/Stripe visé._

### [critical/efficiency/M] Le clic sur le funnel Pipeline ne filtre rien (param ignoré)

Le bloc Pipeline affiche la promesse « Clique sur une barre pour filtrer les clients » et navigue vers /clients?pipeline=${full} (dashboard-charts.tsx:200). Or la table clients ne lit JAMAIS le paramètre `pipeline` : clients-table.tsx ne consomme que q, bucket, forme, activite, categorie (lignes 100-124). Résultat : un clic sur n'importe quelle barre atterrit sur la liste clients avec le filtre silencieusement ignoré, qui retombe sur le bucket `clients` par défaut. L'interaction la plus mise en avant du dashboard est donc trompeuse et non fonctionnelle pour la majorité des étapes (Tally, PC, LDM envoyée, perdus...). Pour un expert-comptable qui veut « voir les 3 PC à préparer » d'un clic, c'est un cul-de-sac.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:197-201, app/clients/clients-table.tsx:100-124
- **Reco** : Aligner sur le mécanisme réellement géré par la table. Soit (a) ajouter la lecture d'un param `?statut=` dans clients-table.tsx qui filtre sur pipeline_statut exact, et faire pointer onBarClick dessus ; soit (b) mapper chaque statut vers le `bucket` existant et naviguer vers /clients?bucket=... . Vérifier aussi la cohérence du libellé de statut encodé (avec accents) avec la valeur stockée. Ajouter un test e2e simple sur ce drill-down.

### [high/color/M] Axes/labels/curseur de charts en hex codé en dur → illisibles en dark & navy

Tous les éléments de « chrome » Recharts sont des hex fixes : ticks XAxis/YAxis fill:"#71717a" et "#a3a3a3" (dashboard-charts.tsx:231,234,326,333,342), LabelList fill:"#52525b" (266,380), curseur de tooltip fill:"rgba(0,0,0,0.04)" (241). Le thème est piloté par les classes .dark/.navy sur <html> (theme-provider.tsx) et n'est jamais transmis à Recharts. En dark (#191919) et navy (#0b1124), ces gris foncés passent sous le seuil de contraste WCAG (le #52525b sur #202020 est ~2:1, illisible) et le curseur noir 4% est invisible. Le dashboard Finance voisin a déjà la bonne solution et crée une incohérence flagrante entre deux écrans BI du même produit.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:231-234, app/_dashboard/dashboard-charts.tsx:266, app/_dashboard/dashboard-charts.tsx:326-342, app/_dashboard/dashboard-charts.tsx:380, app/finance/finance-dashboard.tsx:445-465
- **Reco** : Copier le pattern de finance-dashboard.tsx:445-465 : sur chaque XAxis/YAxis, utiliser tick={{ fontSize: 10, fill: "currentColor" }} + className="text-zinc-500 dark:text-zinc-400" (la couche compat globals.css remappe text-zinc-* en dark/navy). Idem LabelList : passer par un <text> stylé via currentColor ou fill={"hsl(var(--muted-foreground))"}. Curseur tooltip : cursor={{ fill: "hsl(var(--foreground) / 0.06)" }}.

### [high/accessibility/S] Aucune prise en charge de prefers-reduced-motion

Le dashboard anime : hover -translate-y-px sur les KPI (dashboard-charts.tsx:169), skeleton animate-pulse (dashboard-charts-loader.tsx:18), transitions de barres, et globalement toute la couche d'animations CSS (globals.css:799-863 : slide-up-fade, achievement-pop avec overshoot, row-highlight). Une recherche sur tout le repo ne trouve AUCUN `prefers-reduced-motion`/`motion-reduce`. C'est un manquement WCAG 2.3.3 et un inconfort réel pour les utilisateurs sensibles au mouvement, sur un outil de production quotidien.

- **Fichiers** : app/globals.css:798-863, app/_dashboard/dashboard-charts.tsx:169, app/_dashboard/dashboard-charts-loader.tsx:18
- **Reco** : Ajouter un bloc global dans globals.css : @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } } puis neutraliser explicitement achievement-pop/row-highlight. Pour le hover translate, l'envelopper en motion-safe:hover:-translate-y-px.

### [high/accessibility/M] Barres et lignes cliquables sans équivalent clavier ni sémantique

Le funnel Pipeline est navigable uniquement à la souris (onClick sur <Bar>, dashboard-charts.tsx:257-261) : aucun rôle, aucun focus, aucune cible clavier. Recharts 3 active accessibilityLayer par défaut (navigation flèches dans le graphe) mais cela ne déclenche pas la navigation au clic ni n'annonce l'action « ouvrir la liste filtrée ». Les rangées Top clients / Mix activité sont des <Link> (ok clavier) mais les barres de chart ne le sont pas. Un utilisateur au clavier ou lecteur d'écran ne peut pas atteindre l'action principale.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:257-276
- **Reco** : Doubler l'affordance : sous chaque chart cliquable, ou en alternative, exposer la même action via les listes déjà cliquables. À minima, ajouter aria-label sur le conteneur du chart décrivant l'interaction, et fournir un fallback clavier (ex. liste de boutons cachés visuellement mais focusables, ou rendre les segments focusables avec role=button + onKeyDown Enter/Espace réutilisant onBarClick).

### [medium/accessibility/S] SegToggle Nb/€ sans sémantique de groupe ni état annoncé

Le toggle segmenté (dashboard-charts.tsx:565-592) est une paire de <button> « Nb » / « € » sans role=group, sans aria-label sur le groupe, et sans aria-pressed sur le bouton actif. L'état sélectionné n'est porté que visuellement (bg-white + shadow). Un lecteur d'écran entend « Nb, bouton » / « €, bouton » sans contexte (« basculer l'unité ») ni indication de l'option active. C'est le contrôle interactif principal de deux blocs sur quatre.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:565-592
- **Reco** : Envelopper dans un div role="group" aria-label="Unité d'affichage". Sur chaque bouton ajouter aria-pressed={value === o.value} et un aria-label explicite (ex. « Afficher en nombre » / « Afficher en euros »). Conserver le style actif visuel. Optionnel : gérer flèches gauche/droite pour un vrai pattern tablist/segmented.

### [medium/visual/S] Aucune grille de lecture sur les charts (valeurs difficiles à situer)

Ni le funnel Pipeline ni le ComposedChart Signatures n'ont de <CartesianGrid> : aucune ligne horizontale de référence pour relier une barre à une graduation de l'axe Y. Avec deux axes Y sur Signatures (gauche = mois, droite = cumul) c'est d'autant plus dur de lire les valeurs. Le dashboard Finance, lui, met systématiquement une grille (finance-dashboard.tsx:445 : CartesianGrid strokeDasharray="3 3"), créant une incohérence et un dashboard d'accueil moins lisible que la page Finance.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:225, app/_dashboard/dashboard-charts.tsx:323, app/finance/finance-dashboard.tsx:445
- **Reco** : Ajouter <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-white/[0.06]" /> dans les deux charts (BarChart pipeline et ComposedChart signatures), exactement comme finance-dashboard.tsx:445. vertical={false} pour ne garder que les lignes horizontales utiles à la lecture des hauteurs.

### [medium/consistency/S] États vides ad-hoc au lieu du composant EmptyState partagé

Top clients et Mix activité affichent des vides minimalistes « Aucun client actif. » / « Pas de données. » via un simple <div className="text-xs text-zinc-400 text-center py-8"> (dashboard-charts.tsx:417-418, 488-491). Le design system fournit pourtant un <EmptyState icon title description action> soigné (ui.tsx:243-279, icône cerclée + hiérarchie + CTA) utilisé ailleurs. Les charts Pipeline et Signatures n'ont eux AUCUN état vide : si tout est à 0, on affiche des axes vides sans message. Incohérent et peu premium pour une « version définitive ».

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:417-419, app/_dashboard/dashboard-charts.tsx:488-492, app/_components/ui.tsx:243-279
- **Reco** : Remplacer les deux vides texte par <EmptyState> (ui.tsx) avec une icône lucide cohérente (Users / PieChart) et idéalement une action (ex. « Ajouter un client »). Ajouter un garde-fou état vide sur Pipeline et Signatures (ex. si total === 0, afficher EmptyState à la place du chart). Uniformiser les libellés.

### [medium/performance/M] Tout le dashboard est ssr:false → KPI au-dessus de la ligne de flottaison flashent un skeleton inutile

DashboardCharts entier (KPI compris) est chargé en dynamic({ ssr: false }) pour exclure Recharts du bundle initial (dashboard-charts-loader.tsx:11-14). Conséquence : même les 4 KPI cards et les listes Top/Mix — qui n'utilisent PAS Recharts et dont les données sont déjà résolues côté serveur (page.tsx) — attendent l'hydratation client et s'affichent d'abord en skeleton pulsé. Sur la page d'accueil, c'est précisément le contenu prioritaire (chiffres clés) qu'on retarde. Latence perçue dégradée à chaque navigation vers l'accueil.

- **Fichiers** : app/_dashboard/dashboard-charts-loader.tsx:11-43, app/page.tsx:7-18, app/_dashboard/dashboard-charts.tsx:40-56
- **Reco** : Scinder : rendre KpiCards + TopClients + MixActivite en composants serveur (ou client mais sans Recharts) rendus immédiatement dans page.tsx, et ne lazy-charger en ssr:false QUE les deux blocs Recharts (PipelineFunnel, SignaturesParMois). Les KPI s'affichent instantanément, seuls les graphes montrent un skeleton ciblé.

### [medium/fluidity/S] Skeleton de chargement ne correspond pas au layout réel (CLS)

Le DashboardSkeleton dessine : 4 KPI, PUIS un grand bloc pleine largeur h-72 (« Pipeline funnel »), puis 2 charts, puis 2 blocs h-64 (commentaire « Mix activité + risque ») — soit 5 zones de chart dont une pleine largeur (dashboard-charts-loader.tsx:16-39). Or le vrai layout est : 4 KPI puis DEUX grilles 2x2 (Pipeline+Signatures, puis TopClients+Mix), aucun bloc pleine largeur, et le « risque » n'existe plus dans cette surface. Le squelette ment sur la structure → saut de mise en page (CLS) et hauteurs incohérentes au moment où le contenu réel apparaît.

- **Fichiers** : app/_dashboard/dashboard-charts-loader.tsx:16-39, app/_dashboard/dashboard-charts.tsx:42-54
- **Reco** : Réécrire le skeleton pour refléter exactement la structure de DashboardCharts : grid-cols-2 lg:grid-cols-4 pour les KPI (h ~112px), puis deux fois grid lg:grid-cols-2 gap-4 avec des blocs h-[368px] (5 px-5 py-5 + h-72 interne). Supprimer le bloc pleine largeur et le bloc « risque » obsolète. Réutiliser les mêmes classes de carte (rounded-2xl border-zinc-200/70) pour matcher pixel-près.

### [medium/efficiency/M] Mix activité : libellé « clic pour voir les dossiers » contredit la donnée et risque des résultats vides

Le sous-titre annonce « Répartition par secteur métier · clic pour voir les dossiers » et chaque rangée est un <Link href=/clients?categorie=${name}> (dashboard-charts.tsx:484-501). Mais le commentaire du loader précise explicitement que ces noms de catégorie « ne sont pas des filtres exploitables côté /clients : affichage statistique seul, pas de lien cliquable » (dashboard-data.ts:42 et bloc 245-256, ainsi que le commentaire en tête de MixActivite:461-465). Il y a donc contradiction interne. Le filtre `categorie` EST lu par la table (clients-table.tsx:122-124,259) et compare categorieActivite(activite) à la valeur — ça peut marcher, mais le commentaire affirme le contraire, signe d'un état instable et d'un risque de divergence (ex. catégorie « Services divers » sur clients non-LDM filtrés différemment).

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:461-501, app/_dashboard/dashboard-data.ts:245-256, app/clients/clients-table.tsx:122-124
- **Reco** : Trancher et aligner code + commentaires : si le drill-down par catégorie est voulu (et il fonctionne via ?categorie=), supprimer les commentaires « pas cliquable » obsolètes. Vérifier que le set de clients de la table (bucket clients) produit les mêmes comptes que le dashboard (mêmes critères LDM) pour éviter qu'un clic sur « 5 dossiers » affiche 3 lignes. Garder le libellé seulement si la cohérence des comptes est garantie.

### [low/color/S] Couleurs sémantiques dupliquées : cumul vert = LDM signée vert, palette Mix arbitraire

La ligne « Cumul YTD » des Signatures est en #10b981 (dashboard-charts.tsx:392), exactement la couleur de l'étape « 7 - LDM signée » du funnel (dashboard-data.ts:68) et de la sémantique success. Comme la barre « Mois » est en gold (hsl(34 32% 52%)), le lecteur peut associer à tort le vert à un statut plutôt qu'à un cumul. Par ailleurs la palette BAR_TONES de Mix activité (dashboard-charts.tsx:468-478) attribue des couleurs vives par index d'ordre (gold, emerald, sky, violet...) sans signification : la couleur n'encode rien, ce qui ajoute du bruit chromatique sur un écran déjà dense et entre en tension avec la sobriété « calme » visée.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:388-396, app/_dashboard/dashboard-charts.tsx:466-478, app/_dashboard/dashboard-data.ts:61-74
- **Reco** : Pour le cumul, utiliser une couleur neutre distincte du vert statut (ex. sky #0ea5e9 comme finance-dashboard COLORS.cumul, ou un gris foncé) afin de réserver le vert au sens « signé/succès ». Pour Mix activité, soit monochromatiser en dégradé de gold (cohérent identité MOON, la couleur n'encode pas d'info), soit assumer une palette catégorielle stable mappée à la catégorie (pas à l'index) pour que la couleur reste constante d'un chargement à l'autre.

### [low/visual/M] « Pipeline » nommé funnel mais rendu en bar chart + labels à -25° qui rognent l'espace

Le composant s'appelle PipelineFunnel et la doc parle de « funnel » (dashboard-charts.tsx:30-39, 178), mais le rendu est un BarChart vertical classique sans décroissance visuelle d'entonnoir — la lecture « combien tombe d'une étape à la suivante » n'est pas servie. De plus, les libellés d'axe X sont inclinés à -25° avec interval=0 (lignes 226-232 et 324-330) ce qui mange 30px de bas de chart (margin bottom 30), réduit la hauteur utile des barres et nuit à la lisibilité fine sur 12 entrées. shortLabel ne retire que le préfixe « N - » ; des libellés comme « Perdu dans l'espace » restent longs.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:182-282, app/_dashboard/dashboard-charts.tsx:535-538
- **Reco** : Soit assumer le bar chart et renommer (« Pipeline par étape ») pour ne pas promettre un entonnoir ; soit, si l'entonnoir est voulu, passer à un FunnelChart Recharts ou des barres horizontales triées décroissantes (plus lisibles pour des libellés longs, pas de rotation). Si on garde la verticale, réduire l'angle (-15°) ou abréger davantage les libellés, et réévaluer margin.bottom.

### [low/visual/S] KPI : valeur 32px en leading-none + sous-titre truncate masquent silencieusement l'info

La valeur KPI est en font-display text-3xl md:text-[32px] leading-none (dashboard-charts.tsx:155) : avec Fraunces et leading-none, le risque de rognage des jambages (g, p, €) est réel selon le rendu. Surtout, le sous-titre est en truncate (ligne 159) : sur la carte MRR, le sous-titre « ARR 1 234 567 € » peut être tronqué en colonne étroite (grid-cols-2 en mobile), faisant disparaître l'ARR sans recours. Pour un dirigeant qui lit le MRR/ARR d'un coup d'œil, perdre l'ARR silencieusement est dommageable.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:155-160, app/_dashboard/dashboard-charts.tsx:73-79
- **Reco** : Passer la valeur en leading-tight (ou pb-px) pour sécuriser les jambages. Sur le sous-titre, remplacer truncate par un retour sur 2 lignes maîtrisé (line-clamp-2) ou afficher l'ARR sur sa propre ligne avec un title attribute en repli. Vérifier le rendu mobile grid-cols-2 sur la carte MRR avec un gros ARR.

### [low/performance/S] Re-calculs non mémoïsés à chaque toggle + absence d'animation de chiffres

À chaque bascule Nb/€, PipelineFunnel et SignaturesParMois re-mappent intégralement leurs tableaux (dashboard-charts.tsx:190-195, 295-299) et Math.max sur Top/Mix est recalculé à chaque render (409, 466) sans useMemo. Volumes faibles (~12 points) donc impact mesuré minime, mais c'est sous le standard d'un composant client « définitif » et chaque setState relance tout l'arbre du bloc. Côté ressenti, les valeurs changent instantanément sans transition (pas de count-up, pas de morph de barres au switch d'unité), ce qui rend le toggle un peu sec pour une UI premium.

- **Fichiers** : app/_dashboard/dashboard-charts.tsx:190-195, app/_dashboard/dashboard-charts.tsx:295-299, app/_dashboard/dashboard-charts.tsx:409, app/_dashboard/dashboard-charts.tsx:466
- **Reco** : Envelopper les dérivations (data mappé, max) dans useMemo([mode, source]). Optionnel premium : activer isAnimationActive sur les <Bar>/<Line> avec une durée courte (~250ms) pour un morph fluide au changement d'unité, et envisager un count-up léger sur les KPI (en respectant prefers-reduced-motion).

## Pipeline kanban (app/pipeline)  (68/100)

_Surface visuellement aboutie et techniquement soignée : memoization fine des colonnes/cartes, optimistic update propre avec rollback, et la zone « Perdu dans l'espace » est un vrai moment de marque. Mais deux défauts bloquants pour une version « définitive » : le drag-drop est 100% inaccessible au clavier (alors que la sidebar du même projet a déjà KeyboardSensor) et aucune règle prefers-reduced-motion n'existe (confettis + achievement-pop ignorent l'OS). S'ajoutent des fuites de thème sur le picker mobile (bg-white en dur), un layout de colonnes fragile en auto-fit, et du payload mort transféré pour 79 lignes._

### [critical/accessibility/M] Drag-drop totalement inaccessible au clavier

Les sensors ne déclarent que PointerSensor + TouchSensor (kanban.tsx:139-142). Aucun KeyboardSensor. Conséquence : impossible de déplacer une carte au clavier — la seule action métier de la page (changer de statut en desktop) est inatteignable sans souris (WCAG 2.1.1 Keyboard, échec). C'est d'autant plus anormal que la sidebar du MÊME projet le fait déjà correctement (app/_components/sidebar.tsx:31,41,361 : KeyboardSensor + sortableKeyboardCoordinates). Le grip est un <button> focusable (kanban.tsx:983) mais l'activation clavier ne déclenche aucun drag. Il n'existe pas non plus de fallback (pas de menu « déplacer vers » en desktop, contrairement au mobile qui a MobileStatutPicker).

- **Fichiers** : app/pipeline/kanban.tsx:139-142, app/pipeline/kanban.tsx:983-996, app/_components/sidebar.tsx:361
- **Reco** : Ajouter useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }) comme dans sidebar.tsx, et fournir des announcements dnd-kit (accessibility.announcements sur DndContext) en français (« KARL SAS déplacé vers PC envoyée »). À défaut d'un drag clavier fiable, exposer le MobileStatutPicker aussi en desktop via un menu sur le grip (Enter ouvre le picker) — réutilise du code existant et garantit l'accès clavier.

### [high/accessibility/M] Aucun prefers-reduced-motion : confettis et pop ignorent l'OS

Grep sur globals.css : zéro occurrence de prefers-reduced-motion. À chaque LDM signée le kanban lance fireConfetti() (2,5 s d'animation plein écran, use-ldm-celebration.tsx:57-99) puis une achievement card avec overshoot bounce (achievement-pop, globals.css:826-833) — sans aucun garde-fou. Toutes les transitions globales (boutons/liens 140ms, globals.css:911-915), slide-up-fade, scale-in, row-highlight tournent aussi inconditionnellement. Pour un utilisateur sensible au mouvement (WCAG 2.3.3 Animation from Interactions / 2.2.2), c'est non conforme et potentiellement nauséabond sur une action répétée plusieurs fois par semaine.

- **Fichiers** : app/globals.css:798-863, app/globals.css:911-915, app/clients/[slug]/use-ldm-celebration.tsx:57-99
- **Reco** : Ajouter dans globals.css un bloc @media (prefers-reduced-motion: reduce) qui neutralise les keyframes (animation: none ou durée 1ms) sur .animate-achievement-pop, .animate-slide-up-fade, .animate-fade-in, .row-highlight, et réduit la transition globale. Dans use-ldm-celebration.tsx, garder un court-circuit JS : if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) ne pas appeler confetti() (canvas-confetti ne lit pas la media query). Afficher quand même l'achievement card sans le bounce.

### [high/color/S] Picker mobile et bandeau collé en blanc dur sur thèmes dark/navy

MobileStatutPicker rend un panneau fixed avec bg-white + sticky top bg-white + text-zinc-900 écrits en dur, sans variante dark (kanban.tsx:553,555,560). La couche de compat globals.css remappe bien .dark .bg-white des cards (ligne 418) mais ce panneau plein écran est l'écran de choix de statut sur mobile : si la règle .dark .bg-white:not(...) ne matche pas (ou que la handle bg-zinc-300 ligne 556, le bouton Annuler border-t ligne 651), on obtient un drawer blanc éblouissant en dark/navy. Idem la handle « grip » w-10 h-1 bg-zinc-300 reste claire. Le risque concret : incohérence forte avec le reste de l'app qui a des dark: explicites, et un flash blanc plein écran sur tactile la nuit.

- **Fichiers** : app/pipeline/kanban.tsx:553-563, app/pipeline/kanban.tsx:648-654
- **Reco** : Remplacer les couleurs en dur du drawer par les tokens : bg-white -> bg-[hsl(var(--surface-elevated))], text-zinc-900 -> text-foreground, border-t -> border-[hsl(var(--border))], la poignée bg-zinc-300 -> bg-[hsl(var(--border))]. Aligner sur le pattern déjà utilisé dans la DragOverlay (dark:bg-[hsl(var(--surface-elevated))], kanban.tsx:317).

### [high/visual/M] Layout 6 colonnes en auto-fit : wrap imprévisible et colonnes orphelines

La rangée pré-signature utilise grid auto-fit minmax(220px, 1fr) pour 6 colonnes fixes (kanban.tsx:242-256). auto-fit place AUTANT de colonnes de >=220px que la largeur le permet : sur une zone de contenu ~1200-1280px (sidebar déduite), 6×220=1320 ne tient pas -> on tombe à 5 colonnes, et la 6e (« LDM envoyée ») saute seule sur une 2e ligne, cassant la lecture du funnel 1->6. À l'inverse sur très grand écran, auto-fit ne dépassera jamais 6 (pas de cards de plus), donc les colonnes s'étirent jusqu'à des largeurs molles. Le funnel d'un pipeline DOIT rester sur une ligne, dans l'ordre, sinon la métaphore tombe.

- **Fichiers** : app/pipeline/kanban.tsx:242-256, app/pipeline/kanban.tsx:872
- **Reco** : Pour une rangée funnel à nombre fixe, remplacer auto-fit par un nombre de colonnes maîtrisé : grid-template-columns: repeat(6, minmax(0, 1fr)) et autoriser un scroll horizontal sous un breakpoint (overflow-x-auto + min-w sur les colonnes) plutôt qu'un wrap. Le code a déjà l'infra de scroll/snap (min-w-[85vw] md:min-w-0 snap-start sur Column, kanban.tsx:872) mais elle n'est jamais activée en desktop faute de conteneur scrollable.

### [medium/performance/S] Payload mort : siren / forme / activite transférés mais jamais affichés

page.tsx sélectionne et mappe siren, forme, activite pour chaque client (page.tsx:32,67-70) et PipelineCard les type (kanban.tsx:30-33... champs siren/forme/activite). Or grep dans kanban.tsx : aucune lecture de card.siren / card.forme / card.activite. Les 4 surfaces (Card, SpaceCard, MobilePipelineList, DragOverlay) n'affichent que denomination + arr. C'est du payload réseau et de la sérialisation RSC inutiles sur 79 lignes, et ça gonfle le type sans raison. Comme ces objets sont recréés à chaque setLocalCards, c'est aussi du poids mémoire mort.

- **Fichiers** : app/pipeline/page.tsx:32, app/pipeline/page.tsx:64-75, app/pipeline/kanban.tsx:25-40
- **Reco** : Retirer siren, forme, activite de la sélection Supabase (baseCols, page.tsx:32), du mapping (page.tsx:67-70) et du type PipelineCard (kanban.tsx). Garder uniquement id, slug, denomination, arr, pipeline_statut, pipeline_changed_at, mois_signature. Si une preview au survol est prévue plus tard, la charger à la demande.

### [medium/performance/S] router.refresh() systématique : re-fetch des 79 lignes après chaque move optimiste

Après chaque déplacement, moveCardOptimistic appelle router.refresh() (kanban.tsx:198) dans la transition. La page étant force-dynamic (page.tsx:6), refresh relance la requête Supabase complète + re-render RSC de toute la liste, alors que l'état optimiste local est DÉJÀ correct et que movePipeline ne renvoie rien d'autre que signature. Sur un usage rapide (l'utilisateur enchaîne les bascules), c'est un aller-retour serveur complet à chaque carte, qui peut faire « re-sauter » la liste si le tri serveur diffère légèrement du tri optimiste (ex. pipeline_changed_at arrondi). Le commentaire d'actions.ts revendique « pas de revalidatePath pour la perf » — mais router.refresh() annule ce bénéfice.

- **Fichiers** : app/pipeline/kanban.tsx:192-198, app/pipeline/actions.ts:27-32
- **Reco** : Supprimer router.refresh() du chemin nominal : l'optimistic update + le revalidate des pages downstream suffisent (c'est l'intention documentée dans actions.ts:33-37). Au pire, ne rafraîchir que si le serveur signale une divergence. Conserver le rollback en cas d'erreur. Cela rend la bascule instantanée et supprime le risque de re-sort visuel.

### [medium/visual/M] Colonne LDM signée à largeur fixe 620px : ne respire pas, scroll interne sur ~48 dossiers

La rangée signée fixe w-[620px] shrink-0 (kanban.tsx:266) avec un Column en columnCount=2 (CSS columns) plafonné à max-h-[560px] (kanban.tsx:873). Avec la cinquantaine de LDM signées attendue (cf. mémoire projet), 2 sous-colonnes × ~24 cartes de 28px + gaps dépassent 560px -> scroll interne dans une colonne déjà large et fixe, pendant que la zone espace voisine (flex-1) s'étire. Sur un écran 1366px, 620px figés + la zone espace laissent peu de marge ; sur 2560px, la colonne reste à 620px et paraît étriquée à côté d'une zone espace géante. Le CSS multi-column casse aussi l'ordre de lecture attendu (col1 = 1->24, col2 = 25->48) ce qui surprend si on cherche « le dernier signé » censé être en haut.

- **Fichiers** : app/pipeline/kanban.tsx:265-273, app/pipeline/kanban.tsx:873, app/pipeline/kanban.tsx:898-904
- **Reco** : Rendre la largeur fluide avec borne : remplacer w-[620px] shrink-0 par un basis clamp (ex. flex-[0_1_620px] min-w-[420px]) ou basculer la sous-colonne en CSS grid 2 colonnes (grid-cols-2) qui ordonne gauche->droite ligne par ligne (plus intuitif que columns top-to-bottom). Relever max-h sur cette colonne précise (les signés sont la fierté : autoriser plus de hauteur, ex. max-h-[640px]).

### [medium/accessibility/S] Cible tactile du grip sous le minimum, et conflit drag/clic latent

Le drag handle desktop fait px-1.5 py-2 autour d'un icône h-3.5 w-3.5 (kanban.tsx:989-995) -> zone effective ~24×24px, et le grip de SpaceCard px-1 py-2 sur h-3 w-3 (kanban.tsx:821-824) encore plus petit. C'est sous la cible WCAG 2.5.8 (24×24 minimum, 44×44 recommandé tactile). En dessous d'une seule poignée par carte, sur 79 cartes denses, viser au doigt est difficile. Le TouchSensor a delay 220ms tolerance 6 (kanban.tsx:141) : le delay aide, mais comme le drag ne part QUE du grip minuscule, l'utilisateur tactile vise mal. Le onClick={(e)=>e.preventDefault()} sur le grip (kanban.tsx:993) neutralise le clic mais pas le focus.

- **Fichiers** : app/pipeline/kanban.tsx:989-996, app/pipeline/kanban.tsx:816-825, app/pipeline/kanban.tsx:418-426
- **Reco** : Agrandir la zone tactile sans grossir l'icône : sur le bouton grip, ajouter min-h-[44px] min-w-[32px] flex items-center justify-center (en gardant les marges négatives pour ne pas pousser la card). Sur mobile, le drag desktop n'existe pas (vue liste), donc surtout viser le bouton ArrowRightLeft mobile qui est déjà w-8 h-8 (32px, kanban.tsx:421) -> le passer à w-9 h-9 / 36px minimum.

### [medium/visual/S] États vides incohérents et pauvres sur les colonnes

Trois traitements coexistent : colonnes desktop -> « (vide) » zinc-400 italic py-10 (kanban.tsx:888-890), zone espace -> deux lignes poétiques soignées (kanban.tsx:748-752), mobile -> « (vide) » py-3 (kanban.tsx:402-404). Le « (vide) » entre parenthèses fait debug/placeholder, pas produit fini, et le py-10 sur des colonnes terminales déjà courtes (max-h-280px) gaspille la moitié de la hauteur. Pour une version « définitive » au niveau Linear/Stripe, un état vide doit guider, pas afficher un mot technique entre parenthèses.

- **Fichiers** : app/pipeline/kanban.tsx:888-890, app/pipeline/kanban.tsx:402-404
- **Reco** : Unifier : remplacer « (vide) » par un micro-état cohérent (ex. un trait + « Aucun dossier » en text-muted-foreground text-[11px], sans parenthèses ni italic), réduire le padding à py-6. Optionnel premium : sur les colonnes droppables, afficher au survol-drag un libellé « Déposer ici » (déjà signalé par le ring gold isOver kanban.tsx:874).

### [low/visual/S] Sémantique du dollar/ARR sans repère : montant brut, pas de hiérarchie de valeur

Chaque carte affiche l'ARR via fmtEuro en text-[11px] font-semibold zinc-700 (kanban.tsx:1005-1007), et l'entête de colonne répète count · total (kanban.tsx:883-885). Mais rien ne distingue un dossier à 800€ d'un à 25 000€ : même graisse, même couleur. Pour un dirigeant qui pilote un pipeline commercial, la valeur est le signal n°1. Aucune accentuation des gros tickets, aucune tonalité dorée (l'accent --gold du DS, pourtant identité MOON, n'est utilisé que sur le hover du nom et les rings de drop). Le doré est sous-exploité comme signal de valeur.

- **Fichiers** : app/pipeline/kanban.tsx:1005-1007, app/pipeline/kanban.tsx:883-885
- **Reco** : Soit garder neutre mais alléger (text-zinc-500 font-medium) pour ne pas concurrencer le nom ; soit, plus ambitieux, teinter l'ARR en doré au-delà d'un seuil (text-[hsl(var(--gold-dark))] font-semibold) pour faire ressortir les dossiers à fort enjeu. Le total de colonne pourrait aussi passer en font-semibold foreground pour ancrer la lecture pipeline = somme de valeur.

### [low/color/S] Lisibilité limite des textes dimmés indigo dans la zone espace

Dans « Perdu dans l'espace », plusieurs textes sont très atténués sur le gradient sombre : montant text-indigo-200/50 (kanban.tsx:498,832), libellé « zone de derive » text-indigo-200/40 (kanban.tsx:736), état vide text-indigo-200/40 (kanban.tsx:482,748). À 40-50% d'opacité d'un indigo clair sur un fond #0b1024, on est probablement sous le ratio AA 4.5:1 pour du texte de 10-12px. Ces cartes restent des données métier (dénomination + ARR de dossiers réels), pas pure déco : il faut pouvoir les lire. Le grip à text-indigo-300/30 (kanban.tsx:821) est quasi invisible au repos.

- **Fichiers** : app/pipeline/kanban.tsx:498, app/pipeline/kanban.tsx:736, app/pipeline/kanban.tsx:821, app/pipeline/kanban.tsx:832
- **Reco** : Remonter les opacités des textes porteurs d'info : montant -> text-indigo-200/70, libellés contextuels -> /60, et le grip au repos -> /50 (il révèle au hover de toute façon). Vérifier au contraste-checker que dénomination (indigo-100/90) et ARR atteignent 4.5:1 sur #0b1024. Garder le /40 uniquement pour du texte purement décoratif non informatif.

### [low/fluidity/M] Pas de feedback de chargement pendant la bascule (transition silencieuse)

useTransition est appelé mais isPending est ignoré : const [, startTransition] (kanban.tsx:112). L'optimistic update affiche le résultat immédiatement, mais si movePipeline est lent ou échoue tard, l'utilisateur n'a aucun indice qu'une écriture est en vol — il voit la carte bougée puis, en cas d'erreur réseau, un rollback brutal + toast (kanban.tsx:200-213). Pour une signature LDM (chemin lourd : init onboarding + stats MRR côté serveur, cf. actions.ts:14-20), le délai avant confettis peut surprendre.

- **Fichiers** : app/pipeline/kanban.tsx:112, app/pipeline/kanban.tsx:192-216
- **Reco** : Capturer isPending et l'exploiter discrètement : légère opacité/curseur progress sur la carte en cours d'écriture, ou désactiver un re-drag de la même carte tant que pending. Pour la signature, déclencher les confettis de façon optimiste (dès le drop vers « 7 - LDM signée ») et seulement afficher l'achievement card au retour serveur — la latence perçue de la célébration disparaît.

### [low/consistency/S] Incohérence d'overlay : deux composants ghost distincts pour le même geste

Le composant Card prévoit explicitement un mode isOverlay (props + styles dédiés ring-[hsl(var(--gold))]/50 scale-[1.02] shadow-modal, kanban.tsx:947-980) mais la DragOverlay ne l'utilise PAS : elle réimplémente à la main un ghost différent (rounded border bg-white px-2 py-1 ring-2 ring-[hsl(var(--gold))]/40, kanban.tsx:316-325). Résultat : le rendu pendant le drag (radius, padding, opacité du ring 40 vs 50, échelle) ne correspond ni à la carte au repos ni au mode isOverlay prévu. Du code mort (le chemin isOverlay de Card n'est jamais emprunté) + une micro-incohérence visuelle.

- **Fichiers** : app/pipeline/kanban.tsx:315-326, app/pipeline/kanban.tsx:947-980
- **Reco** : Soit rendre <Card card={activeCard} isOverlay /> dans la DragOverlay (réutilise le style déjà conçu, supprime le ghost ad hoc et le code mort), soit, si le ghost compact est voulu, supprimer la branche isOverlay de Card pour ne pas laisser de chemin mort. Aligner l'opacité du ring sur une seule valeur (/50, cohérent avec le reste).

## Liste clients (app/clients/page.tsx, app/clients/clients-table.tsx, app/clients/nouveau/*)  (68/100)

_Surface solide et déjà pensée (buckets métier, resize colonnes persisté, URL sync, highlight au retour, cards mobile). Mais c'est la seule grande table qui n'utilise PAS les primitives partagées (StatusFilterChip/Picker) ni les variantes dark: explicites — elle survit en dark/navy uniquement grâce à la couche de compat globals.css, ce qui la fragilise et la rend incohérente. Côté perf, tout le pipeline (filtre+tri+écriture URL+reconstruction d'URL par ligne) se re-exécute à chaque frappe. Côté finition, des glyphes texte (▲▼▾✓×↵⏳) tiennent lieu d'icônes, les lignes paraissent cliquables mais ne le sont pas, aucun garde prefers-reduced-motion, et le header n'est pas sticky._

### [high/efficiency/M] Les lignes paraissent cliquables mais ne le sont pas (cursor-pointer mensonger + 6 <Link> imbriqués par ligne)

Le <tr> porte className="... cursor-pointer group/row" (clients-table.tsx:423) mais n'a AUCUN onClick. La navigation ne se déclenche que via 6 <Link> distincts, un dans chaque <td> (lignes 427-471). Conséquences concrètes pour un EC qui clique vite : (1) cliquer dans le padding/gap entre deux cellules, ou sur les badges Pappers/INPI, ne fait rien alors que le curseur promet un clic ; (2) le DOM porte 6 liens vers la même URL par ligne (≈480 <a> pour 79 clients) → tab order pollué (6 stops par ligne au clavier), surcoût hydration ; (3) la zone ARR/Forme/Activité a chacune son <Link className="block"> ce qui marche mais multiplie inutilement les nœuds.

- **Fichiers** : app/clients/clients-table.tsx:420-472
- **Reco** : Passer à UNE seule cible de navigation par ligne : soit un onClick sur le <tr> (router.push(href), avec role="link" + tabIndex={0} + onKeyDown Enter/Espace), soit garder UN <Link> qui enveloppe la cellule "Client" et rendre le reste non-interactif. Sur les badges Pappers/INPI conserver le e.stopPropagation() déjà présent. Supprimer les <Link className="block"> redondants des cellules Forme/Groupe/Activité/Pipeline/ARR. Garde cursor-pointer UNIQUEMENT si le clic ligne marche réellement.

### [high/performance/M] Tout le pipeline se relance + une écriture URL part à chaque frappe de recherche

search est dans le même composant que la table. À chaque caractère : re-render complet, recomputation de filtered (useMemo dep search), sorted (dep filtered), totalArr (recalculé hors useMemo ligne 288), ET un router.replace() debouncé 200ms (writeParams, lignes 175-197) qui touche l'URL Next à chaque pause de frappe → re-render de l'arbre + travail App Router. Sur 79 lignes c'est tolérable, mais l'archi ne tient pas si la base grossit et le ressenti "premium/Linear" exige un filtrage instantané sans jank. De plus filtered ne profite d'aucun déphasage : pas de useDeferredValue.

- **Fichiers** : app/clients/clients-table.tsx:107-130, app/clients/clients-table.tsx:244-288
- **Reco** : 1) Découpler la frappe du filtrage avec useDeferredValue : const deferredSearch = useDeferredValue(search); utiliser deferredSearch dans le useMemo filtered. 2) Sortir totalArr dans un useMemo (dep sorted). 3) L'écriture URL est déjà debouncée — OK, mais ne l'inclure que pour q/bucket/forme, pas re-render-sensible. 4) Optionnel : extraire la toolbar (search+buckets) dans un composant séparé de <ClientsTable> pour que la frappe ne re-render pas les 79 <tr>.

### [high/consistency/L] Filtres réinventés au lieu des primitives partagées (StatusFilterChip / Picker / filter-multi-select)

L'app a des composants canoniques : StatusFilterChip (_components/status-filter-chip.tsx, déjà avec dot accent + count pill + dark: corrects), Picker (_components/picker.tsx, popover en portal qui échappe l'overflow des tables, openUp auto, Escape), et toggleFilterKey/filter-multi-select utilisés par pilotage/tracker. Or clients-table recode BucketBtn (753-800), MultiSelect (653-751) et FilterChip (802-828) à la main. Résultats : le MultiSelect Forme utilise un popover absolute (z-30) NON-portal → risque de clipping si un jour le conteneur a overflow-hidden (le wrapper table l'a déjà), pas de openUp, pas de fermeture Escape (seulement click-outside), et un style légèrement différent des chips du reste de l'app (rayon, couleurs, badge gold vs pill grise). C'est la dette de cohérence n°1 de la surface.

- **Fichiers** : app/clients/clients-table.tsx:653-828, app/_components/status-filter-chip.tsx, app/_components/picker.tsx
- **Reco** : Remplacer BucketBtn par <StatusFilterChip label count active onClick accent={...}> (mapper amber/emerald/sky/rose déjà supportés). Remplacer MultiSelect "Forme" par le pattern filter-multi-select + Picker (popover portal). FilterChip → réutiliser le chip de status-filter ou un composant Tag partagé. Bénéfice immédiat : dark/navy + Escape + portal gérés gratuitement et identité visuelle alignée.

### [medium/performance/S] Reconstruction d'un URLSearchParams + href DANS le .map() de chaque ligne, à chaque render

Pour CHAQUE ligne et à CHAQUE render, on instancie new URLSearchParams(), on set 5 params (nav-q, nav-bucket, nav-forme, nav-activite, from) puis .toString() — lignes 408-418 (desktop) et dupliqué 509-516 (mobile). Ces params ne dépendent QUE de search/bucket/formeFilter/activiteFilter/fromUrl, pas de la ligne (sauf r.slug). On recalcule donc 79× la même querystring à chaque frappe. C'est du gaspillage GC pur.

- **Fichiers** : app/clients/clients-table.tsx:408-418, app/clients/clients-table.tsx:509-516
- **Reco** : Calculer le suffixe de query UNE fois dans un useMemo : const navQs = useMemo(() => { const p = new URLSearchParams(); if (search) p.set('nav-q', search); ...; p.set('from', fromUrl); return p.toString(); }, [search, bucket, formeFilter, activiteFilter, fromUrl]); puis dans le map href = `/clients/${r.slug}${navQs ? `?${navQs}` : ''}`. Factoriser desktop+mobile sur le même navQs.

### [medium/color/M] Seule grande table qui ne pose pas de variantes dark: explicites — survit par la couche de compat

pilotage-table / tracker-table écrivent des classes dark: explicites (ex. thead bg-zinc-50/50 dark:bg-white/[0.02], sticky bg avec dark:bg-[hsl(var(--card))]). clients-table, elle, écrit bg-white / bg-zinc-50/60 / text-zinc-900 / hover:bg-zinc-50/50 / border-zinc-200 SANS dark:, et ne fonctionne en dark/navy QUE parce que globals.css remappe ces classes hardcodées (vérifié : .dark .bg-white, .dark .bg-zinc-50, .dark .text-zinc-700, .dark .border-zinc-300, etc.). Problème : (1) tout ce que la compat n'atteint pas casse — ex. focus:ring-zinc-400 (input ligne 329, Th ligne 629) n'a PAS de remap navy → halo de focus gris terne sur fond bleu ; le badge gold du MultiSelect (bg-[hsl(var(--gold))] text-white) est OK mais isolé ; (2) fragile : toute classe future oubliée par la compat rendra mal. C'est un risque de régression silencieuse sur la surface la plus consultée.

- **Fichiers** : app/clients/clients-table.tsx:329, app/clients/clients-table.tsx:629, app/clients/clients-table.tsx:389-391
- **Reco** : Aligner sur le pattern des autres tables : ring de focus tokenisé (focus-visible:ring-[hsl(var(--gold))]/40 ou ring-ring) au lieu de ring-zinc-400 ; thead et lignes avec dark: explicites (dark:bg-white/[0.02], dark:hover:bg-white/[0.04], dark:border-white/[0.06]) plutôt que de compter sur la compat. À défaut d'un refactor complet, corriger au minimum les focus rings (3 occurrences) qui n'ont aucun fallback navy.

### [medium/accessibility/S] Aucun garde prefers-reduced-motion dans tout le design system

globals.css définit slide-up-fade, fade-in, scale-in, slide-in-right, achievement-pop et surtout row-highlight-flash (2.4s, déclenché au retour depuis une fiche via useHighlightRow) — mais il n'existe AUCUN @media (prefers-reduced-motion: reduce) dans le fichier (vérifié par grep). Pour un utilisateur sensible au mouvement, le flash doré de 2,4s + le scrollIntoView smooth (use-highlight-row.ts:36) s'imposent quand même. WCAG 2.3.3 (Animation from Interactions, AAA) et bonne pratique premium.

- **Fichiers** : app/globals.css:803-861, app/_hooks/use-highlight-row.ts:33-39
- **Reco** : Ajouter dans globals.css : @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } } et dans use-highlight-row.ts, conditionner block:'center'/behavior:'smooth' à un check window.matchMedia('(prefers-reduced-motion: reduce)') pour passer en behavior:'auto'.

### [medium/accessibility/M] Redimensionnement de colonnes inaccessible : souris uniquement, pas de clavier ni tactile

startResize n'écoute que onMouseDown + document mousemove/mouseup (clients-table.tsx:581-604). La poignée est un <span aria-hidden> (646) : invisible aux lecteurs d'écran ET non focusable, donc aucun moyen de redimensionner au clavier. Aucun PointerEvent / touch listener non plus → sur tablette/écran tactile (un EC en RDV peut être sur iPad) le resize est mort. Le double-clic reset n'a pas d'équivalent clavier. La cible de drag (w-1.5 = 6px) est aussi très fine pour la souris.

- **Fichiers** : app/clients/clients-table.tsx:581-648
- **Reco** : Migrer onMouseDown→onPointerDown + setPointerCapture + pointermove/pointerup (gère souris ET tactile d'un coup). Rendre la poignée focusable (role="separator" aria-orientation="vertical" tabIndex={0} aria-label=`Redimensionner colonne ${label}`) et gérer onKeyDown ArrowLeft/ArrowRight (±16px) + Home pour reset. Élargir la zone tactile à w-2/w-2.5. Retirer aria-hidden une fois focusable.

### [medium/visual/S] Header de table non sticky — les colonnes disparaissent au scroll d'une longue liste

Le <thead> (clients-table.tsx:391) n'est pas sticky. Sur "Tous" (79 lignes, et plus à l'avenir) on perd rapidement le contexte des colonnes (notamment quelle colonne est ARR à droite). La sibling tracker-table le fait déjà (thead ... sticky left-0, td sticky left-0). Pour une table dense "style Attio/Linear" revendiquée en commentaire (388), le header collant est attendu.

- **Fichiers** : app/clients/clients-table.tsx:389-406
- **Reco** : Ajouter sur <thead> ou les <th> : sticky top-0 z-10 avec un fond opaque (bg-white dark:bg-[hsl(var(--card))], pas le bg-zinc-50/60 semi-transparent actuel sinon le contenu transparaît) et une border-b. Si le conteneur scrolle dans la page plutôt que dans la div, sticky top-0 suffit ; sinon donner une max-h + overflow-y-auto au wrapper (389).

### [medium/visual/M] Glyphes texte en guise d'icônes (▲ ▼ ▾ ✓ × ↵ ⏳) — incohérent avec lucide-react et peu premium

L'app utilise lucide-react partout, mais cette surface (+ le form nouveau) emploie des caractères Unicode bruts : tri ▲/▼ en text-[9px] (clients-table.tsx:635), chevron ▾ du MultiSelect (704), check ✓ (725), croix × du FilterChip (824), ↵ des suggestions (form.tsx:454) et surtout ⏳ comme spinner de chargement (form.tsx:410). Rendu : alignement vertical instable selon la police, taille/poids non maîtrisés, et l'emoji ⏳ détonne franchement dans une UI "SaaS premium calme". Le triangle de tri à 9px est par ailleurs quasi illisible → l'état trié se voit mal.

- **Fichiers** : app/clients/clients-table.tsx:634-636, app/clients/clients-table.tsx:704, app/clients/clients-table.tsx:824, app/clients/nouveau/form.tsx:408-411
- **Reco** : Remplacer par lucide : ChevronUp/ChevronDown (ou ArrowUp/ArrowDown) h-3.5 pour le tri, ChevronDown pour le MultiSelect, Check h-3 pour la checkbox, X h-3 pour FilterChip, CornerDownLeft pour ↵, et Loader2 className="h-4 w-4 animate-spin" pour le chargement (au lieu de ⏳). Le tri actif gagnera fortement en lisibilité.

### [medium/efficiency/S] Recherche sous-équipée pour un utilisateur rapide : pas de raccourci focus, pas de bouton clear, pas de type=search/aria-label

L'input recherche (clients-table.tsx:324-330) est un type="text" sans aria-label (le placeholder n'en tient pas lieu pour l'a11y), sans bouton × pour vider (il faut tout sélectionner+supprimer), et sans raccourci de focus. Il existe Ctrl/Cmd+Shift+L pour défiltrer (200-213) mais aucun "/" ou Cmd+K-like pour sauter dans la recherche — or un EC qui veut trouver un dossier tape "/" par réflexe (Linear/GitHub) ou s'attend à focus auto. La command-palette gère déjà la nav clients globale, mais la recherche in-page reste l'outil de filtrage de la liste.

- **Fichiers** : app/clients/clients-table.tsx:323-330, app/clients/clients-table.tsx:199-213
- **Reco** : 1) type="search" + aria-label="Rechercher un client". 2) Bouton X (lucide) à droite quand search!=='' qui reset + refocus l'input. 3) Raccourci : useEffect keydown, si e.key==='/' et pas déjà dans un input/textarea → e.preventDefault() + inputRef.focus(). 4) Bonus : autoFocus de l'input au mount de la page (un EC arrive souvent pour chercher).

### [low/efficiency/S] Le reset de l'état vide (desktop) oublie categorieFilter et diverge du bouton Réinitialiser principal

Trois resets coexistent et ne sont pas synchrones : le bouton "Réinitialiser" principal (337-350) ET le raccourci Cmd+Shift+L (203-209) remettent search/bucket/forme/activite/categorie ; MAIS le reset de l'état vide desktop (482-489) OUBLIE setCategorieFilter(""). Donc si l'utilisateur arrive via le dashboard "Mix activité" (categorie en URL) et tombe sur 0 résultat, cliquer "Réinitialiser les filtres" dans la table laisse le filtre Secteur actif → toujours 0 résultat, effet "le bouton ne marche pas". Côté mobile, l'état vide (503-506) n'offre aucun reset du tout.

- **Fichiers** : app/clients/clients-table.tsx:482-489, app/clients/clients-table.tsx:503-506, app/clients/clients-table.tsx:337-350
- **Reco** : Extraire une seule fonction const resetFilters = useCallback(() => { setSearch(''); setBucket('all'); setFormeFilter(new Set()); setActiviteFilter(''); setCategorieFilter(''); }, []) et l'utiliser aux 4 endroits (bouton principal, Cmd+Shift+L, empty desktop, empty mobile). Ajouter le bouton reset dans l'empty-state mobile.

### [low/visual/S] État vide pauvre et placeholders « - » quasi invisibles (text-zinc-300)

(1) L'état "aucun résultat" est un simple texte centré (476-496) : pas d'icône, pas de hiérarchie, là où le reste de l'app vise un rendu soigné. Il manque aussi le cas "liste réellement vide" (0 client en base) distinct de "0 résultat filtré" — le message parle toujours de filtres. (2) Les cellules vides affichent <span className="text-zinc-300">-</span> (445, 451, 456, 465) : sur fond blanc c'est à la limite de l'invisible et casse l'alignement (un "-" cadré à gauche au lieu d'un placeholder neutre). En dark la compat remappe text-zinc-300 mais reste très pâle.

- **Fichiers** : app/clients/clients-table.tsx:476-496, app/clients/clients-table.tsx:445-465
- **Reco** : Empty-state : ajouter une icône lucide (Users/SearchX) en text-zinc-300, un titre semibold + la phrase d'aide, et distinguer rows.length===0 (CTA "Créer le premier client" → /clients/nouveau) du cas filtré (bouton reset). Placeholders : remplacer text-zinc-300 par text-muted-foreground et centrer le tiret avec une largeur cohérente, ou utiliser une vraie em-dash "—" alignée.

### [low/color/S] Accent doré (identité MOON) quasi absent de la surface la plus vue

Le doré --gold est l'ADN de marque, mais sur la Liste clients il n'apparaît que sur le badge compteur du MultiSelect (700) et la poignée de resize au hover (644). Les buckets, l'état actif de tri, le total ARR, le focus des inputs (qui utilise ring-zinc-400) sont tous gris/neutres. Résultat : la page phare semble générique, pas "MOON". À l'inverse le form /nouveau utilise le gold partout (focus ring gold, SectionTitle gold, RadioChips gold) → incohérence d'intensité de marque entre deux surfaces voisines.

- **Fichiers** : app/clients/clients-table.tsx:380-384, app/clients/clients-table.tsx:301-307, app/clients/clients-table.tsx:329
- **Reco** : Introduire le doré avec parcimonie mais à des points clés : focus-visible:ring-[hsl(var(--gold))]/40 sur search + th (remplace ring-zinc-400, règle aussi le souci navy), souligner le bucket actif d'un liseré doré, et mettre le montant "ARR cumulé" en text-gold ou avec un soulignement doré pour en faire un point focal. Garder le reste neutre pour ne pas surcharger.

### [low/fluidity/S] Largeurs de colonnes : lecture localStorage au mount provoque un saut visuel (FOUC de layout)

columnWidths démarre à {} (clients-table.tsx:134) puis un useEffect lit localStorage au mount et fait setColumnWidths (137-144). La table rend donc d'abord en table-auto (auto-fit), PUIS saute aux largeurs persistées → flash de réagencement visible à chaque chargement pour un utilisateur qui a personnalisé ses colonnes. C'est exactement le genre de micro-jank qui trahit le "définitif et parfait" visé.

- **Fichiers** : app/clients/clients-table.tsx:134-144
- **Reco** : Initialiser l'état en lazy depuis localStorage : useState(() => { try { const s = localStorage.getItem(WIDTHS_STORAGE_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; } }). Comme la page est dynamique/CSR (le composant est 'use client' et la page force-dynamic), il n'y a pas de risque de mismatch SSR ici. Supprimer le useEffect de lecture. Garder l'écriture dans setColumnWidth.

### [low/efficiency/M] Persistance asymétrique : largeurs colonnes en localStorage, mais tri ni bucket par défaut mémorisés

Le tri (sort, 126-129) repart toujours sur denomination asc à chaque visite, et n'est pas reflété dans l'URL (contrairement à q/bucket/forme/activite/categorie qui sont sync). Un EC qui trie systématiquement par ARR desc doit le refaire à chaque fois et ne peut pas partager/bookmarker une vue triée. Les largeurs de colonnes, elles, sont persistées — asymétrie d'ergonomie. Le filtre Forme est multi mais n'est pas non plus dans le titre de la vue.

- **Fichiers** : app/clients/clients-table.tsx:126-129, app/clients/clients-table.tsx:175-189
- **Reco** : Soit persister sort dans l'URL (params sort=arr&dir=desc, lus à l'init comme bucket) pour partage+F5, soit a minima dans localStorage (clé moon.clients-table.sort) comme les largeurs. Cohérent avec le pattern useLocalStorage déjà utilisé ailleurs (use-local-storage-pref).

## Fiche client (principale) — onglet Identité + layout/header + onglets + édition inline + cards d'info  (72/100)

_Surface globalement très soignée et premium : hero dense et lisible, édition inline optimiste partout, sections numérotées élégantes, et un découpage en sous-routes propre avec loaders mémoïsés. Mais la « version définitive » est trahie par trois familles de problèmes : (1) latence perçue — la navigation prev/next force un reload document complet et aucune frontière Suspense ne stream le contenu ; (2) cohérence/thèmes — plusieurs composants (ContactsCard, pills, EditableHeading, ClotureSplit/TextArea) re-codent des styles hardcodés au lieu de réutiliser Card/fieldInputClass, et reposent entièrement sur la couche de compat dark/navy au lieu de variants explicites ; (3) accessibilité — aucun prefers-reduced-motion, focus-visible absent sur les pills/chips, et un fichier paramétrage entier est du code mort._

### [critical/performance/S] Prev/next force un reload document complet (window.location.href)

NavButtons intercepte le clic et fait `e.preventDefault()` puis `window.location.href = buildHref(...)` (nav-buttons.tsx:46-49). C'est une navigation document classique : tout le JS/CSS est re-parsé, l'app repart de zéro avec un flash blanc, et le prefetch Next du <Link> est gâché. Pour Benjamin qui enchaîne les fiches au clavier/souris, c'est LA latence la plus visible de la surface — chaque saut coûte ~500ms-1s au lieu d'une transition SPA quasi instantanée. Ironie : le href Next est déjà calculé et passé au <Link>, on l'écrase juste avec un reload.

- **Fichiers** : app/clients/[slug]/nav-buttons.tsx:43-49
- **Reco** : Supprimer le handler onClick et laisser le <Link> Next faire la navigation. Pour conserver le sous-onglet + ?year + nav-params, calculer le href côté client une fois (useEffect/usePathname+useSearchParams) et le passer en `href`, avec `prefetch`. Si la conservation du sous-segment impose un calcul au clic, utiliser `router.push(buildHref(...))` (next/navigation) au lieu de window.location — on garde le client-side routing et le streaming.

### [high/performance/M] Aucune frontière Suspense : toute la fiche attend la requête la plus lente

layout.tsx et page.tsx sont des Server Components qui `await` séquentiellement loadClient → loadContactsLink → la liste clients de nav (jusqu'à 79 lignes filtrées en JS) → groupes → tva_tags, le tout avant le premier byte. Il n'existe aucun <Suspense> dans toute la surface (grep: 0 résultat). Résultat : le header (dispo dès loadClient) est bloqué par la requête de navigation et par les options TVA/groupes qui ne servent qu'à des selects secondaires. Le streaming React 19 / App Router est inexploité alors que l'archi en sous-routes s'y prête parfaitement.

- **Fichiers** : app/clients/[slug]/layout.tsx:99-160, app/clients/[slug]/page.tsx:47-62
- **Reco** : Streamer le secondaire : envelopper NavButtons dans <Suspense> avec un composant async dédié (la liste de nav n'a pas à bloquer le hero). Idem, déplacer le fetch groupes/tva_tags de page.tsx dans des sous-composants <Suspense fallback={skeleton}>. Le hero (loadClient) s'affiche immédiatement, le reste hydrate en flux. Bonus perf : lancer loadContactsLink et la liste nav en parallèle via Promise.all plutôt qu'en await successifs.

### [high/consistency/M] ContactsCard ré-implémente la Card sans aucune variante dark/navy

ContactsCard recopie à la main le shell de <Card> (rounded-2xl, header bg-zinc-50/40, p-5) mais en pur hardcodé clair : `bg-white`, `border-zinc-200/70`, `border-zinc-100`, `bg-zinc-50/40`, `text-zinc-900` — zéro `dark:`. Sur les 3 thèmes, ça ne tient QUE grâce à la couche de compat globals.css qui remappe bg-white→card, etc. Mais <Card> (_components.tsx) a, lui, des `dark:` explicites (dark:bg-[hsl(var(--card))], dark:border-white/[0.08]). On a donc deux cartes côte à côte sur la même page rendues par deux mécanismes différents : risque de micro-décalages de teinte (la compat utilise hsl(0 0% 12.5%), Card utilise --card) et fragilité si la compat évolue. Même problème, à moindre échelle, pour le titre du dossier.

- **Fichiers** : app/clients/[slug]/contacts-card.tsx:35-56, app/clients/[slug]/_components.tsx:25-49
- **Reco** : Faire consommer <Card> par ContactsCard : `<Card title="Contacts" subtitle={...} action={!adding && <AddButton/>}>`. Supprime ~20 lignes de shell dupliqué et garantit l'alignement parfait avec toutes les autres cards de la page dans les 3 thèmes. Idem migrer le NewContactForm pour réutiliser fieldInputClass.

### [high/visual/M] État vide des champs incohérent : ambre vs gris selon le composant

La direction design documentée dans editable.tsx (fieldInputClass) dit explicitement « Plus aucun fond ambre/saturé, le champ vide est un creux gris discret ». EditableText/Number/Date/Select/Groupe respectent ça (bg-zinc-50/70). MAIS ClotureSplit (editable-extras.tsx:66), EditableTextArea (:163), EditableGestionTns (:228) et les InlineField/CivilitePicker de ContactsCard (:338, :257) utilisent encore `bg-amber-50/40 border-amber-200` pour le vide. Sur la même fiche, certains champs vides sont gris et d'autres jaunes — incohérence visuelle directement visible, et contradiction avec la doc du code. La carte 'Dates de gestion' (Clôture jaune + Reprise grise + Signature grise + TNS jaune) est l'exemple le plus criant.

- **Fichiers** : app/clients/[slug]/editable-extras.tsx:66,163,228, app/clients/[slug]/contacts-card.tsx:257,338, app/clients/[slug]/editable.tsx:40-53
- **Reco** : Exporter fieldInputClass depuis editable.tsx et l'utiliser dans ClotureSplit, EditableTextArea, EditableGestionTns. Pour les champs « obligatoires LDM » qui justifiaient l'ambre, remplacer par un indicateur sémantique discret (astérisque doré, ou border-l-2 border-[hsl(var(--gold))]) plutôt qu'un fond jaune généralisé. Choisir UNE convention vide unique sur toute la fiche.

### [high/accessibility/S] Aucun prefers-reduced-motion : animations non désactivables

Recherche `prefers-reduced-motion` sur tout le repo → 0 résultat (les 10 'reduce' trouvés sont des Array.reduce). Pourtant la surface multiplie le mouvement : achievement-pop (bounce cubic-bezier overshoot, 0.55s) au passage en LDM signée, confettis (useLdmCelebration), slide-up-fade du NewContactForm, active:scale-95 sur les pills pipeline, row-highlight. Pour un utilisateur sensible au mouvement (WCAG 2.3.3 Animation from Interactions), rien n'est respecté. La célébration plein écran est particulièrement à risque.

- **Fichiers** : app/globals.css:826-845, app/clients/[slug]/pipeline-picker.tsx:85, app/clients/[slug]/contacts-card.tsx:395
- **Reco** : Ajouter dans globals.css un bloc `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }` et, pour la célébration/confettis, court-circuiter le déclenchement JS si `window.matchMedia('(prefers-reduced-motion: reduce)').matches` (afficher juste la carte sans pop ni confettis).

### [high/accessibility/M] Pills/chips sans focus-visible : navigation clavier invisible

Les pills pipeline (pipeline-picker.tsx:84), les RadioPill/TogglePill (parametrage-card si réactivé), le CivilitePicker chip et son dropdown (contacts-card.tsx:250-294), le bouton '+ Ajouter' et le bouton civilité du NewContactForm n'ont aucun `focus-visible:` — uniquement des états hover/active. Un expert-comptable rapide au clavier (Tab entre les statuts pipeline) ne voit pas où il est. Le dropdown civilité custom n'a pas non plus de gestion clavier (pas de role, pas de flèches, pas d'Échap pour fermer — seul un mousedown outside ferme). Les <select>/<input> natifs, eux, sont OK (fieldInputClass a focus:ring).

- **Fichiers** : app/clients/[slug]/pipeline-picker.tsx:84-94, app/clients/[slug]/contacts-card.tsx:250-298, app/clients/[slug]/parametrage-card.tsx:303-356
- **Reco** : Ajouter `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] dark:focus-visible:ring-white/40 focus-visible:ring-offset-1` sur tous ces boutons. Pour le menu civilité : role="menu"/role="menuitem", gestion ArrowUp/Down + Escape + focus piégé, ou le remplacer carrément par un <select> natif (déjà utilisé ailleurs pour la civilité — cohérence avec EditableContactCivilite).

### [medium/consistency/S] parametrage-card.tsx est du code mort (jamais importé)

ParametrageCard (293 lignes, avec RadioPill/TogglePill/Section, le mapping TYPE_LABEL complet, la logique reconduire/régime/TVA) n'est importé nulle part dans le repo (grep `ParametrageCard|parametrage-card` sur tout *.tsx/ts → seule la définition). La surface paramétrage réelle vit dans obligations-matrix.tsx + pilotage-card.tsx (cf. obligations/page.tsx). Pour une 'version définitive', ce fichier crée un doublon de vérité dangereux : PIPELINE_VALUES y diffère même de pipeline-picker.tsx (il manque 'Z - Sous-traitance'), donc un futur dev qui le réactive réintroduirait un bug. C'est aussi l'un des 4 fichiers de référence de cette revue — il ne devrait pas être orphelin.

- **Fichiers** : app/clients/[slug]/parametrage-card.tsx:1-359, app/clients/[slug]/pipeline-picker.tsx:10-23
- **Reco** : Supprimer parametrage-card.tsx (et ses helpers RadioPill/TogglePill non partagés). Si une partie est encore voulue, extraire la liste PIPELINE_VALUES dans actions.ts comme source unique et la réimporter partout (pipeline-picker, matrix) pour tuer la divergence.

### [medium/color/S] EditableHeading : pas de couleur texte ni hover en dark/navy

Le bouton du titre (mode lecture) est `text-zinc-900 hover:bg-zinc-100/70` sans variante dark (editable.tsx:629). En mode édition l'input a bien des dark: (ligne 622) mais pas le bouton. Le titre survit en dark uniquement via la compat (.dark .text-zinc-900→#F1F1F1, .dark .hover:bg-zinc-100/70). C'est le H1 de la page, l'élément le plus important : il ne devrait pas dépendre d'un filet de sécurité CSS global. De plus le hover bg-zinc-100/70 sur le hero (qui a déjà un gradient) peut créer un rectangle gris peu élégant au survol du titre.

- **Fichiers** : app/clients/[slug]/editable.tsx:626-633
- **Reco** : Ajouter explicitement `dark:text-zinc-50` (ou text-foreground) et `dark:hover:bg-white/[0.06]` sur le bouton ; envisager hover:bg-white/60 dark:hover:bg-white/[0.06] pour rester cohérent avec les hovers du hero. Idéalement remplacer text-zinc-900 par `text-foreground` (token) pour ne plus dépendre de la compat.

### [medium/color/S] Pills pipeline inactives hardcodées bg-white/zinc, dépendantes de la compat en dark

Pour une pastille non active, pipeline-picker (:93) et RadioPill (:310) écrivent `bg-white text-zinc-700 border-zinc-300` sans dark:. En dark/navy, bg-white→card et text-zinc-700→#D6D6D6 via compat, donc des pastilles 'pleines couleur card' avec bordure peu contrastée — l'affordance bouton se perd un peu sur fond card identique. Le fallback actif sans couleur (`bg-zinc-900 text-white`) passe lui par .dark .bg-zinc-900→foreground+inversion, ce qui est correct mais, là encore, implicite. C'est cohérent fonctionnellement mais c'est beaucoup de magie CSS pour un composant aussi central que le sélecteur de statut.

- **Fichiers** : app/clients/[slug]/pipeline-picker.tsx:90-94, app/clients/[slug]/parametrage-card.tsx:307-311
- **Reco** : Donner aux pills inactives des classes explicites multi-thème : `bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground` (tokens) au lieu de bg-white/zinc hardcodés. La pastille devient lisible et autonome dans les 3 thèmes sans s'appuyer sur la couche de compat.

### [medium/fluidity/M] Skeleton de chargement ne ressemble pas à la fiche réelle (et light-only)

loading.tsx affiche une barre + 2 blocs 64 et une grille 2 colonnes (bg-zinc-100/40, bg-zinc-200) — qui ne correspond ni au hero MRR, ni aux onglets, ni à l'empilement réel de cards de l'onglet Identité (1 colonne large + grille 2 col plus bas). Le saut visuel skeleton→contenu est donc marqué (layout shift perçu). De plus tout est en bg-zinc-200/100 sans dark: : en dark/navy le squelette s'appuie encore sur la compat et rend des gris ternes peu raccord avec le hero gradient. Aucune animation respectant reduced-motion (animate-pulse non conditionné).

- **Fichiers** : app/clients/[slug]/loading.tsx:1-16
- **Reco** : Refaire le skeleton pour mimer le vrai layout : barre back/nav, hero rounded-2xl pleine largeur avec bloc MRR à droite, rangée d'onglets, puis Card pipeline + cards. Utiliser des tokens (bg-muted) au lieu de bg-zinc-200 pour le multi-thème. C'est ce qui donne la sensation 'instantané' façon Linear.

### [medium/efficiency/M] extractDirigeant prend contactsLink[0] : 'dirigeant' = contact arbitraire

extractDirigeant (_data.ts:66-70) retourne `contactsLink[0].contacts` — le PREMIER lien, sans tri ni filtre sur role. La carte 'Identité du dossier' édite donc la civilité/prénom/nom de ce contact-là, et les boutons LDM/Signature du hero s'en servent pour pré-remplir le signataire. Si l'ordre Postgres change ou si un contact 'Comptable' est rattaché avant le dirigeant, on édite/signe avec la mauvaise personne — sans aucun signal visuel. Pour un cabinet, signer une LDM au nom du mauvais contact est une vraie erreur métier.

- **Fichiers** : app/clients/[slug]/_data.ts:66-71, app/clients/[slug]/page.tsx:80-100, app/clients/[slug]/layout.tsx:251-292
- **Reco** : Ordonner explicitement la requête loadContactsLink (ex. role='Dirigeant'/'Président' en premier, sinon ordre de création stable via .order('created_at')) et faire d'extractDirigeant une vraie sélection du dirigeant (filtre sur role connu, fallback documenté). Afficher dans la carte le rôle du contact édité (« dirigeant : Jean X · Président ») pour lever toute ambiguïté.

### [low/fluidity/S] EditableNumber : valeur brute non formatée pendant la saisie, reformat au blur

Au focus, EditableNumber remplace le draft par `String(display)` (editable.tsx:266), donc on perd le format euro (« 1 200 € » devient « 1200 »), ce qui est correct pour éditer ; mais aucun feedback d'unité pendant la frappe (pas de suffixe €) alors que le label dit juste '↳ Montant'. Au blur, fmtEuro reformate. Pour des décimales (forfait_pilotage équivalent mensuel), String(1234.5) s'affiche '1234.5' avec un point alors que le commit accepte la virgule — petite dissonance FR. Mineur mais perceptible sur une fiche où Benjamin tape beaucoup de montants.

- **Fichiers** : app/clients/[slug]/editable.tsx:259-283
- **Reco** : Afficher un suffixe '€' persistant dans le champ (span absolu à droite, padding-right) plutôt que dans la valeur, pour garder l'unité visible en édition. Normaliser l'affichage focus en locale FR (remplacer le point par une virgule à l'affichage). Optionnel : sélectionner tout le texte au focus (e.target.select()) pour réécriture rapide.

### [low/fluidity/S] fiche-tabs : onglet actif non scrollé en vue sur mobile + transition-all

La barre d'onglets est `overflow-x-auto` (fiche-tabs.tsx:31) avec 5 onglets. Sur écran étroit, si l'utilisateur arrive sur 'Historique' (dernier), l'onglet actif peut être hors viewport sans scroll auto — il faut scroller manuellement pour voir où on est. Par ailleurs les liens utilisent `transition-all` (:43) qui anime aussi des propriétés non voulues (layout) ; à privilégier transition-colors pour la perf et éviter tout jank sur le changement de bordure/shadow de l'onglet actif.

- **Fichiers** : app/clients/[slug]/fiche-tabs.tsx:29-47
- **Reco** : Ajouter un ref sur le lien actif + useEffect `activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })` au changement de pathname. Remplacer `transition-all` par `transition-colors` (ou transition-[color,background-color,border-color]). Bonus : un soulignement gold animé sous l'onglet actif renforcerait l'identité MOON vs le simple fond blanc/bordure actuel.

### [low/efficiency/M] Hero : densité d'actions élevée sans hiérarchie, pas de raccourcis clavier

Le hero aligne 5 boutons d'action (Annuaire, Tally, LDM, Signature, Supprimer) côte à côte, tous au même poids visuel, avec 'Supprimer' (destructif) juste à côté de 'Signature' (action engageante) — risque de clic accidentel, et aucune hiérarchie primaire/secondaire. Pour un power-user qui répète le flux Tally→LDM→Signature 50x/jour, aucun raccourci clavier n'est exposé (ni sur les actions hero, ni pour prev/next fiche, alors que NavButtons existe). Le bloc MRR/ARR et les actions partagent la même colonne droite, ce qui tasse l'ensemble sur lg.

- **Fichiers** : app/clients/[slug]/layout.tsx:239-294
- **Reco** : Hiérarchiser : LDM/Signature en boutons primaires (fond gold ou navy), Annuaire/Tally en secondaires (ghost), et isoler 'Supprimer' dans un menu kebab (…) ou le séparer par un gap + couleur danger au survol seulement. Ajouter des raccourcis (ex. flèches gauche/droite ou j/k pour prev/next via NavButtons, lettre dédiée pour LDM) avec aria-keyshortcuts et un tooltip rappelant la touche.

## Fiche client : sous-onglets (Historique, Onboarding, Obligations, Échéances)  (68/100)

_Les quatre sous-onglets sont fonctionnels et la logique métier est solide, mais ils parlent deux langages visuels distincts : Onboarding utilise la Card premium (rounded-2xl, header teinté, tokens dark/navy), tandis qu'Obligations et Échéances reposent sur du markup brut « rounded-lg border bg-card » avec des titres h2 plats — cassure de cohérence immédiatement visible. Côté fluidité, la matrice obligations fait des aller-retours serveur sans optimistic UI (alors que Pilotage, juste en dessous, en a un), et aucune sous-route n'a de skeleton malgré le force-dynamic. Accessibilité en retrait : zéro prefers-reduced-motion dans tout le projet, un window.confirm() résiduel, et plusieurs cibles cliquables sans focus-visible. La sémantique couleur tient dans les 3 thèmes (navy hérite de .dark), mais les surfaces ambre restent brun-chaud en navy au lieu d'être bleutées._

### [critical/consistency/M] Deux langages de Card entre les sous-onglets d'une même fiche

Onboarding rend ses blocs via le composant premium Card (rounded-2xl, border-zinc-200/70, shadow-card, header sur fond bg-zinc-50/40, titre text-sm font-semibold tracking-tight, dark/navy-aware). Obligations (echeancier-card, pilotage-card) et Échéances utilisent du markup brut « rounded-lg border bg-card » avec un header maison « <h2 className='text-sm font-medium'> » sans la pastille de header teintée ni le rayon 2xl. Résultat : en passant d'un onglet à l'autre dans la MÊME fiche, le rayon des coins (lg vs 2xl), l'épaisseur/teinte de bordure, le style de titre et l'ombre changent. C'est la rupture la plus visible de la surface et elle trahit l'ambition « définitive/parfaite » niveau Linear/Attio.

- **Fichiers** : app/clients/[slug]/echeancier-card.tsx:162-170, app/clients/[slug]/pilotage-card.tsx:112-127, app/clients/[slug]/obligations-matrix.tsx:299-306, app/clients/[slug]/_components.tsx:10-50, app/clients/[slug]/onboarding/page.tsx:133-165
- **Reco** : Faire passer echeancier-card.tsx, pilotage-card.tsx et obligations-matrix.tsx par le composant Card de _components.tsx (title="Échéancier 2026" / "Pilotage / Dashboard" / "Obligations", subtitle pour la phrase d'aide, action pour les boutons de mode). Supprimer les wrappers « rounded-lg border bg-card p-4 » et les <h2 text-sm font-medium> au profit du header standard. Bénéfice immédiat : rounded-2xl, shadow-card, header teinté et dark/navy cohérents partout sans réécrire la logique.

### [high/accessibility/S] Aucun prefers-reduced-motion sur des animations marquées

grep sur tout le repo : zéro occurrence de prefers-reduced-motion. Or la surface enchaîne des mouvements appuyés : achievement-pop (translateY 40px + overshoot scale 1.02, déclenché à la signature LDM = fin du parcours onboarding), le compteur MRR animé sur 1800ms en requestAnimationFrame (achievement-card.tsx:43-58), la barre de progression duration-[1800ms], slide-up-fade sur les popover/draftbar, active:scale-95 sur chaque toggle de matrice. Un utilisateur avec « réduire les animations » activé (vestibulaire, fatigue) subit tout. WCAG 2.3.3 (AAA) mais surtout confort réel pour un usage quotidien intensif.

- **Fichiers** : app/globals.css:798-829, app/clients/[slug]/achievement-card.tsx:43-58, app/clients/[slug]/achievement-card.tsx:245-253
- **Reco** : Ajouter un bloc global dans globals.css : « @media (prefers-reduced-motion: reduce) { .animate-slide-up-fade, .animate-fade-in, .animate-scale-in, .animate-slide-in-right, .animate-achievement-pop { animation: none !important; } *, *::before, *::after { transition-duration: 0.01ms !important; } } ». Et dans achievement-card.tsx, court-circuiter la boucle rAF du compteur si window.matchMedia('(prefers-reduced-motion: reduce)').matches → setAnimatedMrr(data.mrrAfter) directement.

### [high/fluidity/M] Matrice obligations sans optimistic UI alors que Pilotage en a un

Dans obligations-matrix.tsx, onToggle/onTva/onRegime/onDebutChange font « await action(); router.refresh() » sans toucher l'état local : le seul retour visuel est un opacity-80 global sur tout le tableau (ligne 304) pendant la transition. Le ✓ ne s'allume qu'au retour serveur → latence perçue nette à chaque clic, et tout le tableau « grise ». Juste en dessous, pilotage-card.tsx applique un setLocalActive optimiste AVANT le serveur et rollback en cas d'erreur (lignes 62-76). Deux cartes empilées dans le même onglet ont donc deux ressentis de latence opposés — incohérence flagrante pour un expert-comptable qui coche vite.

- **Fichiers** : app/clients/[slug]/obligations-matrix.tsx:162-224, app/clients/[slug]/obligations-matrix.tsx:304, app/clients/[slug]/pilotage-card.tsx:59-77
- **Reco** : Reprendre le pattern de pilotage-card dans la matrice : un état local des subs (déjà presque là via `display`) muté optimistiquement dans onToggle, rollback sur erreur. Au minimum, remplacer le opacity-80 global par un état pending par cellule (ex. ring doré sur la seule cellule en cours) pour ne pas faire clignoter toute la grille. Le composant a déjà useState/useMemo pour les drafts, l'extension est naturelle.

### [high/performance/M] Pas de skeleton par sous-onglet : zone de contenu qui bloque à la navigation

Chaque sous-route est export const dynamic = 'force-dynamic' et await plusieurs requêtes Supabase (obligations/page.tsx fait jusqu'à 4 requêtes dont une séquentielle dans le try pilotage ; exercice/page.tsx 3 ; onboarding 3 en parallèle). Or il n'y a qu'un seul loading.tsx au niveau parent (segment layout), qui ne se déclenche QUE pour la page identité, pas pour les sous-segments. Conséquence : en cliquant Échéances/Obligations/Historique, la zone <div className='mt-6'> reste figée sur l'onglet précédent jusqu'à résolution serveur, sans skeleton — l'inverse de la promesse « navigation quasi-instantanée » du commentaire de fiche-tabs.tsx.

- **Fichiers** : app/clients/[slug]/loading.tsx:1-17, app/clients/[slug]/obligations/page.tsx:48-99, app/clients/[slug]/exercice/page.tsx:33-47, app/clients/[slug]/fiche-tabs.tsx:15
- **Reco** : Ajouter un loading.tsx dans chaque dossier de sous-onglet (historique/, onboarding/, obligations/, exercice/) avec un skeleton adapté (ex. pour la matrice : un bloc rounded-2xl h-80 animate-pulse ; pour historique : 6 lignes grid). Réutiliser le style animate-pulse du loading.tsx parent. Bonus perf : dans obligations/page.tsx, fusionner les requêtes pilotage_obligations + client_year_config en un Promise.all au lieu de l'await séquentiel lignes 56-87.

### [medium/consistency/S] window.confirm() natif pour supprimer un libellé d'onboarding

onboarding-editor.tsx OptionRow.onDelete utilise « if (!confirm('Supprimer le libellé …')) return; » — boîte système du navigateur, alors que toute l'app a un système de confirmation premium (useConfirm/useAlert de _components/confirm-modal, utilisé dans historique-list.tsx, obligations-matrix.tsx, parametrage-card.tsx). Le dialog natif casse la direction artistique (police système, pas de thème dark/navy, pas de variant danger doré) en plein cœur d'un popover soigné, et bloque le thread.

- **Fichiers** : app/clients/[slug]/onboarding/onboarding-editor.tsx:477-489, app/clients/[slug]/historique/historique-list.tsx:103-110
- **Reco** : Injecter useConfirm() dans OptionRow (ou remonter la suppression d'un cran) et remplacer le confirm() natif par await confirm({ title: `Supprimer « ${opt.libelle} » ?`, description: 'Les tâches qui l'utilisent reviendront à « À faire ».', variant: 'danger', confirmLabel: 'Supprimer' }), comme dans historique-list.tsx:104.

### [medium/accessibility/S] Cibles toggle/segmented sans focus-visible exploitable au clavier

Plusieurs contrôles interactifs n'ont aucun anneau de focus : les cases à cocher de la matrice (obligations-matrix.tsx:440-451, classes w-7 h-7 sans focus-visible:ring), les boutons de mode de l'échéancier (echeancier-card.tsx ModeBtn:311-334, aucun focus state), les boutons reconduire/draft (ChevronRight th, lignes 335-342), les toggles Pilotage (pilotage-card.tsx:198-220). À la tabulation, l'utilisateur ne voit pas où il est. Le projet a pourtant un token dédié (focus-visible:ring-[hsl(var(--gold))]) déjà appliqué dans onboarding-editor.tsx:229 et start-onboarding-button.tsx — donc c'est une omission, pas une absence de standard.

- **Fichiers** : app/clients/[slug]/obligations-matrix.tsx:440-451, app/clients/[slug]/echeancier-card.tsx:323-333, app/clients/[slug]/pilotage-card.tsx:198-209, app/clients/[slug]/onboarding/onboarding-editor.tsx:229
- **Reco** : Ajouter « focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-1 » sur les boutons toggle de la matrice, les Toggle de pilotage, les ModeBtn et les chevrons de reconduction. Aligner sur le pattern déjà présent dans onboarding-editor.tsx:229.

### [medium/visual/M] « Timeline » Historique sans spine ni regroupement par jour

La page se décrit comme une timeline chronologique mais historique-list.tsx rend une simple liste divide-y dans une carte : aucune colonne-spine, aucun connecteur, aucun point d'ancrage temporel. Chaque ligne répète la date+heure complète en toutes lettres via Intl « 15 juin 2026, 14:30 » dans une colonne de seulement 180px (Entry:184) → wrap fréquent sur deux lignes et bruit visuel quand 10 modifs tombent le même jour. La densité est plate, sans rythme : rien ne distingue « aujourd'hui » d'« il y a 3 mois ».

- **Fichiers** : app/clients/[slug]/historique/historique-list.tsx:156-187, app/clients/[slug]/historique/historique-list.tsx:63-72
- **Reco** : Soit assumer la table dense (renommer mentalement, et raccourcir : date relative type « auj. 14:30 » / « 12 juin 14:30 » via une fonction qui omet l'année si année courante), soit faire une vraie timeline : grouper par jour (en-tête de groupe sticky « Aujourd'hui » / « 12 juin 2026 »), une fine ligne verticale border-l à gauche avec un dot par entrée. Élargir la colonne date à ~96px fixes et tabular-nums déjà présent. Réutiliser le pattern de groupes collapsibles de echeancier-card.tsx:206-228 pour la cohérence.

### [medium/efficiency/M] Historique : filtre non persistant et 500 lignes non virtualisées

Deux points pour un usage quotidien rapide. (1) Le filtre Tous/Pipeline/Honoraires/Autres est un useState local (historique-list.tsx:83) : il saute à chaque router.refresh / re-navigation, et n'est pas partageable par URL. (2) page.tsx charge .limit(500) et historique-list mappe tout dans un seul divide-y sans virtualisation ni pagination ni « charger plus » → sur un gros dossier ancien, 500 nœuds DOM montés d'un coup + tri/filtre en mémoire à chaque render. Pas dramatique mais à l'opposé du « parfait ».

- **Fichiers** : app/clients/[slug]/historique/historique-list.tsx:83-101, app/clients/[slug]/historique/page.tsx:30-35
- **Reco** : Persister le filtre dans l'URL (?f=honoraires) via useSearchParams + router.replace (scroll:false), comme le year-switcher persiste l'exercice. Pour la liste, soit afficher 100 par défaut avec un bouton « Voir tout (n) », soit virtualiser (la lib n'est pas présente, donc privilégier le paginate-on-scroll simple). Au minimum baisser limit à 200 et indiquer si tronqué.

### [medium/visual/M] États vides plats, sans icône ni hiérarchie

Les empty states sont des phrases grises centrées sans illustration ni structure : Historique « Aucune modification enregistrée » dans un simple p-10 (historique-list.tsx:149-154) ; Échéancier « Coche d'abord des obligations… » en p-4 text-sm (echeancier-card.tsx:194-199) ; Onboarding non-billable affiche un paragraphe seul sans CTA. Pour une app premium c'est le moment-clé du « premier contact » avec un dossier vide et il tombe à plat. Aucune iconographie lucide-react (pourtant utilisée partout : Filter, Sparkles, Trophy…).

- **Fichiers** : app/clients/[slug]/historique/historique-list.tsx:149-154, app/clients/[slug]/echeancier-card.tsx:194-199, app/clients/[slug]/onboarding/page.tsx:134-142
- **Reco** : Créer un petit composant EmptyState partagé (icône lucide en cercle bg-zinc-100 dark:bg-white/[0.05], titre text-sm font-medium, sous-texte text-muted-foreground, CTA optionnel) et l'utiliser dans les 4 onglets. Ex. Historique → icône History ; Échéancier → CalendarClock + lien vers Obligations ; Onboarding vide non-billable → ListChecks. Cohérent avec le ton Linear (états vides soignés).

### [medium/consistency/S] Barre de progression onboarding hors langage du design system

onboarding/page.tsx:151-156 dessine une barre « h-2 bg-zinc-100 / fill bg-emerald-500 » en dur, transition-all, sans aucune variante dark/navy explicite (le track bg-zinc-100 passe par la compat layer, mais le fill emerald-500 plein est un peu cru). C'est la métrique de progression la plus importante de l'onglet (done/total + pct) et elle est rendue avec un composant ad hoc différent des autres indicateurs de complétion (echeancier affiche done/total en texte, achievement-card a une barre gradient gold→emerald soignée). Manque aussi un aria-progressbar.

- **Fichiers** : app/clients/[slug]/onboarding/page.tsx:143-158, app/clients/[slug]/achievement-card.tsx:239-254
- **Reco** : Harmoniser : barre arrondie rounded-full avec fill en gradient discret (from-emerald-500 to-emerald-400) ou accent gold selon la sémantique « réussite », transition-[width] duration-500, et ajouter role='progressbar' aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}. S'inspirer de la barre de achievement-card.tsx:239-254 pour le style de fill.

### [low/color/S] Surfaces ambre non bleutées en thème navy

Le thème navy applique .dark + .navy, et .navy n'override QUE les fonds/bordures zinc → bleu (globals.css:740-795) ; les classes ambre héritent donc du remap .dark (bg-amber-50 → hsl(36 36% 18%), brun chaud). Dans la matrice obligations qui peint massivement en ambre (lignes Régime/TVA bg-amber-50/30, hover bg-amber-50/70, cellule label group-hover bg-amber-100, selects vides border-amber-200 bg-amber-50 text-amber-700), le navy affiche donc des bandes brun-chaud au milieu d'une UI bleu marine. C'est lisible (contraste OK) mais ça jure avec l'identité bleue du thème — défaut de finition, pas de bug.

- **Fichiers** : app/globals.css:566-582, app/globals.css:740-795, app/clients/[slug]/obligations-matrix.tsx:351-352, app/clients/[slug]/obligations-matrix.tsx:415-424
- **Reco** : Ajouter dans le bloc .navy de globals.css des overrides ambre teintés bleu-doré, p.ex. « .navy .bg-amber-50\/30 { background-color: hsl(40 30% 20% / 0.25); } » ou basculer ces lignes de paramétrage sur l'accent gold du thème (hsl(var(--gold)) à faible opacité) plutôt que l'ambre Tailwind, pour rester dans la palette MOON. Cibler les 4 variantes utilisées par la matrice.

### [low/performance/S] Échéancier : navigation par exercice en router.push plein + clés d'index

year-switcher.tsx go() fait router.push(pathname+search) à chaque clic d'année → re-render serveur complet de la sous-route force-dynamic (3 requêtes Supabase) sans aucun feedback intermédiaire hormis l'opacity-60 du switcher ; combiné à l'absence de loading.tsx (finding séparé), changer d'exercice « gèle » la carte. Par ailleurs l'état collapsed des groupes (echeancier-card.tsx:82) est local et perdu à chaque changement d'année/refresh, et les <li key={i}> utilisent l'index de boucle (ligne 282) — fragile si l'ordre change.

- **Fichiers** : app/clients/[slug]/year-switcher.tsx:20-31, app/clients/[slug]/echeancier-card.tsx:82-91, app/clients/[slug]/echeancier-card.tsx:282
- **Reco** : Conserver router.push pour l'URL partageable mais ajouter un skeleton (cf. loading.tsx par onglet) pour masquer le blocage. Remplacer key={i} par une clé stable key={`${o.type}_${o.periode}`}. Optionnel : mémoriser l'état collapsed par année dans un Record pour ne pas le perdre en changeant d'exercice.

### [low/visual/S] Barre flottante de drafts en sticky top-16 : risque de chevauchement

obligations-matrix.tsx:269 positionne la barre de reconductions en attente en « sticky top-16 z-20 ». Le 16 (=4rem) est une valeur magique qui suppose la hauteur du header global ; or la fiche a un hero header + des tabs scrollables au-dessus du contenu (layout.tsx). Selon le scroll, la barre draft peut se coller sous/au-dessus de l'en-tête de table lui-même sticky (thead top-0 z-20, ligne 307) — même z-index, ordre DOM décide — et donner un empilement ambigu. À valider visuellement dans les 3 thèmes.

- **Fichiers** : app/clients/[slug]/obligations-matrix.tsx:267-297, app/clients/[slug]/obligations-matrix.tsx:307
- **Reco** : Vérifier la valeur de top par rapport au header réel (utiliser une CSS var --header-h plutôt qu'un 16 codé en dur) et donner à la draft-bar un z-index strictement supérieur au thead (ex. z-30 sur la barre, z-20 sur le thead) pour un empilement déterministe. Tester avec plusieurs lignes de matrice et en scroll.

## Trackers de production (obligations) — /obligations/[tracker]  (68/100)

_Surface dense et ambitieuse (picker Notion, sélection Excel multi-cellules, copier/coller, commentaires latéraux, vue 3m/12m TVA, filtres persistés) avec un vrai souci du détail métier. Mais elle est portée par un unique client component de 2651 lignes où toute la logique se re-render à chaque patch, plusieurs lookups O(n²) tournent au tri et au render, le header de colonnes n'est pas sticky verticalement, le picker se ferme au moindre scroll, et le hover de ligne casse en thèmes dark/navy. Le polish visuel est là ; la fluidité perçue et la robustesse multi-thèmes ne sont pas encore au niveau « définitif »._

### [high/efficiency/M] Header de colonnes non sticky : on perd les en-têtes au scroll vertical

Seule la colonne client (left) est sticky. Le <thead> (bg-zinc-50, lignes 1552-1610) n'a aucun position:sticky top-0. Sur tva-mensuelle vue 12m (12 colonnes + ~79 clients) ou tout tracker à 70+ lignes, dès qu'on scrolle pour atteindre un client en bas, on perd les labels de mois ET le compteur done/total (%) de chaque colonne. Pour un expert-comptable qui pointe une cellule de juillet sur le 60e dossier, impossible de savoir dans quelle colonne il est. C'est l'attente n°1 d'un tableau de suivi dense (cf. Attio/Linear : header toujours figé).

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:1537, app/obligations/[tracker]/tracker-table.tsx:1552
- **Reco** : Rendre le <thead> sticky : sur le <th> (et les td de la 1ère colonne déjà sticky) ajouter `sticky top-0 z-20` au thead/th, et bump la sticky col à z-30 pour le coin. Le conteneur scroll est déjà `overflow-x-auto` ; ajouter `max-h-[calc(100vh-220px)] overflow-y-auto` sur la div ligne 1549 pour que le sticky vertical morde. Garder le coin top-left (client) à z le plus haut.

### [high/fluidity/M] Le picker statut se ferme dès qu'on scrolle (capture true)

StatusCell attache window 'scroll' en capture et appelle onClose() à la moindre molette/swipe (lignes 2172-2179). Idem InlineTvaTagPicker / FacturationMiniPill ne se repositionnent pas. Conséquence : on ouvre une pastille en bas de viewport → le navigateur auto-scrolle un poil, ou l'inertie du trackpad bouge de 2px → le popover se ferme instantanément. Sur iOS le momentum scroll rend le picker quasi inutilisable près des bords. C'est un popover en position:fixed ancré une seule fois (useEffect [isOpen], ligne 2153) : tout scroll le désaligne, d'où le choix de fermer — mais l'UX en pâtit lourdement.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:2172, app/obligations/[tracker]/tracker-table.tsx:2153
- **Reco** : Repositionner au lieu de fermer : sortir le calcul de pos dans une fn `place()` et l'appeler sur scroll/resize (rAF-throttlé) tant que isOpen. Fermer uniquement si l'ancre sort du viewport. Alternative plus simple et robuste : ancrer le popover dans le flux via un wrapper relatif + Floating UI (`autoUpdate`) plutôt que fixed+rect manuel, ce qui réglerait les 3 pickers d'un coup (StatusCell, InlineTvaTagPicker, FacturationMiniPill, CommentsPopover).

### [high/performance/M] computeNextEcheance : O(n² log n) au tri + recalcul au render

Sur les trackers cloture-based, `filtered` trie par échéance via computeNextEcheance(a)/computeNextEcheance(b) DANS le comparateur (lignes 464-468). Chaque appel boucle sur r.cells et fait `cols.find(co => co.key === c.colKey)` (ligne 394) — donc chaque comparaison de tri est O(cells × cols), et le sort fait O(n log n) comparaisons → O(n² · cols · log n). La même fonction est rappelée non-mémoïsée par row pendant le render de la colonne Échéance (ligne 1669), et l'IIFE `urgency` refait un `cols.find` par cellule visible (lignes 1715-1725). Sur 79 dossiers × ~3 cols c'est encore tolérable, mais ça recalcule tout à CHAQUE keystroke de recherche et à chaque patch optimiste (localRows change → filtered recompute).

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:386, app/obligations/[tracker]/tracker-table.tsx:462, app/obligations/[tracker]/tracker-table.tsx:1669, app/obligations/[tracker]/tracker-table.tsx:1716
- **Reco** : 1) Pré-calculer une `Map<colKey, col>` mémoïsée (au lieu de cols.find répétés). 2) Pré-calculer une `Map<clientId, nextEcheanceTs>` mémoïsée sur [localRows, cols] et l'utiliser dans le comparateur ET la colonne Échéance. 3) Mémoïser l'urgence par cellule dans la même passe. Ça transforme le tri en O(n log n) avec clés pré-calculées.

### [high/color/M] Hover de ligne cassé en dark/navy + invisible sous la colonne sticky

La <tr> utilise `hover:bg-zinc-50/50` (ligne 1613). La couche de compat globals.css ne remappe QUE les classes opaques (`.dark .bg-zinc-50`, et `bg-white:not([class*=bg-white/])`) : les variantes à opacité comme `bg-zinc-50/50` passent à travers → en dark/navy le survol peint un zinc-50 quasi-blanc à 50%, soit un flash clair très laid sur fond sombre. Pire : la cellule client sticky a un fond OPAQUE `bg-white` (ligne 1619, remappé en --card) qui se superpose au hover de la <tr> → la colonne nom NE reçoit jamais la teinte de survol. Donc même en thème clair, l'affordance « ligne survolée » disparaît précisément sous le curseur quand on lit le nom du dossier.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:1613, app/obligations/[tracker]/tracker-table.tsx:1619, app/globals.css:424
- **Reco** : Remplacer `hover:bg-zinc-50/50` par un token thémé : `hover:bg-muted/60` (muted est défini en HSL pour les 3 thèmes) ou créer une classe `.row-hover` dans globals.css avec les 3 variantes. Et faire suivre le fond de hover sur la cellule sticky : utiliser `group/row` (déjà présent) + `group-hover/row:bg-[hsl(var(--muted))]` sur le <td> sticky au lieu d'un `bg-white` fixe, pour que la colonne nom s'éclaire avec la ligne.

### [medium/performance/L] Tout est un seul client component de 2651 lignes

tracker-table.tsx est 'use client' en tête (ligne 1) et embarque toolbar, chips, sélection Excel, clipboard TSV, navigation clavier, persistance localStorage, les 3 pickers et l'orchestration commentaires. Tout ce JS est hydraté côté client même si l'écran de départ ne montre qu'un tableau statique. Le state (search, selectedIds, localRows, clipboard, openCellId…) vit au top : un changement de `search` ou de `selectedIds` re-render le composant entier de 2651 lignes — seul StatusCell est memo, mais la fonction parent ré-exécute tous les useMemo (filtered, colStats, selectedCoords, tvaTagCounts…) à chaque frappe. La barre de sélection multi-cellules + le clipboard ne servent à rien sur mobile mais sont toujours montés.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:1, app/obligations/[tracker]/tracker-table.tsx:84
- **Reco** : Extraire des sous-composants client ciblés : <TrackerToolbar/> (search+chips+filtres), <SelectionBar/> (barre bulk sticky), et idéalement un <TrackerBody/> qui ne dépend pas de `search`. Garder le state de sélection/clipboard dans un hook séparé. But : qu'une frappe dans le filtre ne re-exécute pas selectedCoords/buildClipboard. Gros fichier = aussi un coût de maintenance/risque sur la version définitive.

### [medium/consistency/M] Couleurs de statut light-only : dépendance totale à la couche compat

statutColorClass renvoie des classes 100% light (`bg-amber-100 text-amber-800 border-amber-200`, lib/utils.ts:28-56) ; le rendu dark/navy repose entièrement sur ~600 lignes de remaps !important dans globals.css. Ça marche aujourd'hui mais c'est fragile : toute nouvelle `color` ajoutée dans status_options (CUSTOM_STATUS_COLORS n'a que red/amber/blue/emerald/violet/zinc) ou tout libellé qui sort de cette palette s'affichera en clair sur fond sombre, sans variante. Idem les pastilles facturation (FACT_PILL_OPTIONS, lignes 2103-2107) et tags TVA (TVA_TAG_BG_COLORS) ont, eux, des variantes dark explicites — donc deux conventions cohabitent (tokens dark inline vs compat globale), ce qui est incohérent et piégeux.

- **Fichiers** : lib/utils.ts:28, app/obligations/[tracker]/tracker-table.tsx:2103, app/obligations/[tracker]/tracker-table.tsx:1935
- **Reco** : Unifier : soit étendre STATUT_COLORS/CUSTOM_STATUS_COLORS avec les variantes `dark:` inline (comme FACT_PILL_OPTIONS et TVA_TAG_BG_COLORS le font déjà), soit documenter que la palette statut DOIT rester dans le set couvert par la compat et ajouter un garde-fou (fallback zinc) si `color` inconnu. Au minimum, aligner les 3 sources de couleurs de pastilles sur la même stratégie.

### [medium/visual/S] État vide pauvre et non différencié

Quand aucun client ne matche, on affiche une seule ligne de texte gris centrée dans un <td> (lignes 1799-1808) : « Aucun client ne correspond à ce filtre. ». Pas d'icône, pas de bouton « Réinitialiser les filtres » (alors que Cmd+Shift+L existe mais n'est pas découvrable), et surtout aucune distinction entre (a) le tracker n'a aucune souscription cette année (vide structurel) et (b) les filtres excluent tout (vide transitoire). Sur une surface premium type Linear/Notion, l'empty state est une occasion de guider, pas un cul-de-sac.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:1799
- **Reco** : Créer un empty state riche dans le tbody : icône (lucide Inbox/FilterX), titre, sous-texte contextuel selon `localRows.length === 0` (aucune obligation) vs `filtered.length === 0` (filtres trop restrictifs), + bouton secondaire « Réinitialiser les filtres » qui appelle le même reset que Cmd+Shift+L. Réutiliser le pattern d'empty state des autres surfaces si existant.

### [medium/accessibility/M] Picker statut sans navigation clavier interne (a11y)

Le popover statut Notion-like (lignes 2329-2436) s'ouvre via bouton mais n'expose aucun rôle ARIA (`role=listbox`/`menu`), ne gère pas les flèches Haut/Bas pour parcourir les options, ne piège pas le focus, et ne refocus pas la cellule d'origine à la fermeture. Seul Escape est géré (au niveau document). Pour un outil utilisé au clavier toute la journée (la nav Excel entre cellules est soignée, ironie), ouvrir une pastille force le retour à la souris. Le CommentsPopover a `role=dialog` mais idem pas de focus trap. InlineTvaTagPicker a `aria-haspopup=listbox`/`aria-expanded` mais ses items ne sont pas des `role=option` dans un `role=listbox`.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:2329, app/obligations/[tracker]/tracker-table.tsx:2362, app/obligations/[tracker]/comments-panel.tsx:156
- **Reco** : Sur le conteneur popover statut : `role="listbox"`, items en `role="option"` + `aria-selected`. Gérer ArrowUp/Down/Home/End + Enter dans un onKeyDown local, focus la 1ère option (ou l'option active) à l'ouverture, et restaurer le focus sur `button[data-cell-button]` à la fermeture. Idéalement factoriser un hook `useListboxKeys`. Focus-trap léger sur CommentsPopover.

### [medium/accessibility/S] Cibles tactiles trop petites : pastilles 11px, étiquette TVA 10px, facturation 9px

Les pastilles statut sont en `text-[11px] px-2 py-1` (ligne 2272-2273) → hauteur effective ~22px, bien sous les 44px WCAG/Apple. La FacturationMiniPill est en `text-[9px] px-1.5 py-0` (ligne 2586) — quasi impossible à viser au doigt, et l'icône commentaire `h-3 w-3` (12px) avec `opacity-60` sur mobile (ligne 2308) est minuscule. Sur un tracker explicitement pensé pour le scroll mobile (commentaires inline dans le code), la zone de tap des actions principales est insuffisante. Le « Retard » badge (ligne 2249, text-[8px]) flirte avec l'illisible.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:2272, app/obligations/[tracker]/tracker-table.tsx:2586, app/obligations/[tracker]/tracker-table.tsx:2302
- **Reco** : Sur mobile (max-md), augmenter la zone de hit : `min-h-[32px] min-w-[44px]` sur le bouton pastille via une variante responsive, et donner à l'icône commentaire un padding tap (`p-1.5 -m-1.5`) pour 44px de cible sans changer le visuel. Monter la mini-pill facturation à text-[10px]/py-0.5. Vérifier le contraste du badge Retard 8px (blanc sur rose-500 OK mais taille limite — passer à 9-10px).

### [low/efficiency/M] Toute la mécanique Excel (sélection, clipboard, raccourcis) est inopérante sur mobile

La sélection multi-cellules repose sur shift/cmd-clic + flèches clavier (onTableKeyDown, lignes 833-952) et le copier/coller sur Cmd+C/V (lignes 758-828) — aucun de ces gestes n'existe sur touch. La barre de sélection (lignes 1815-1899) PEUT apparaître (un tap pose l'ancre mais ne sélectionne rien, cf. onCellMouseDown plain-click ligne 974-980 qui vide la sélection), donc en pratique le bulk est desktop-only sans le dire. Les boutons « Copier/Coller » de la barre marchent mais on ne peut pas constituer la sélection au doigt. Code mort embarqué + fonctionnalité fantôme sur mobile.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:954, app/obligations/[tracker]/tracker-table.tsx:1815
- **Reco** : Soit assumer desktop-only et masquer/expliquer (badge « sélection multiple : desktop »), soit ajouter un mode sélection tactile : un tap long ou un bouton « Sélectionner » par ligne/colonne (les poignées ≡ ligne 1622 et le header colonne existent déjà — les rendre tappables en activant un mode sélection sur mobile). À minima, ne pas monter le clavier-handler ni le clipboard sur touch.

### [low/efficiency/S] Persistance localStorage incomplète : recherche et filtre clôture non mémorisés, mais sélection oui

On persiste tvaView/tvaSort/tvaTagFilter/statusFilter/periodFilter (lignes 228-239) mais PAS `filterCloture` ni `search` ni `autoFit`. Sur un tracker annuel, l'utilisateur refiltre « clôture décembre » à chaque visite. Incohérence : pourquoi mémoriser le filtre statut et pas le filtre clôture, qui est tout aussi récurrent pour un EC ? À l'inverse, le Cmd+Shift+L (reset, lignes 775-781) vide search/statusFilter/periodFilter mais OUBLIE filterCloture et tvaTagFilter → un « tout réinitialiser » qui ne réinitialise pas tout, source de filtre fantôme perçu comme un bug.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:228, app/obligations/[tracker]/tracker-table.tsx:775, app/obligations/[tracker]/tracker-table.tsx:135
- **Reco** : Ajouter filterCloture (et autoFit) à la persistance localStorage + au cleanup d'année. Et faire que Cmd+Shift+L vide AUSSI filterCloture et remette tvaTagFilter à 'all' (et idéalement reset search). Aligner « ce qui est persisté » et « ce que reset efface » sur exactement le même set.

### [low/fluidity/S] Pas d'optimistic UI à l'ajout de commentaire (latence perçue)

Composer.submit() attend `await onSend(content)` (addComment côté serveur) AVANT de reset le draft et d'afficher le commentaire (comments-panel.tsx:308-322). Pendant l'aller-retour serveur, le bouton passe à « … » mais la ligne n'apparaît pas — sur une connexion moyenne le commentaire « lag » d'une demi-seconde avant de surgir. Le reste de la surface est très optimiste (applyPatch instantané sur les statuts) ; le commentaire détonne. Le compteur 💬 dans la cellule ne s'incrémente qu'après réponse serveur également.

- **Fichiers** : app/obligations/[tracker]/comments-panel.tsx:308, app/obligations/[tracker]/comments-panel.tsx:113
- **Reco** : Optimistic insert : pousser un commentaire temporaire `{id: tempId, content, author_email: currentUserEmail, created_at: now}` dans setComments immédiatement, vider le draft, puis réconcilier l'id réel au retour (ou rollback + toast si échec). Incrémenter onCountChange dans la foulée. Aligne le ressenti sur le reste de la surface.

### [low/accessibility/S] Animation pulse infinie sur la cellule deep-link + ignore prefers-reduced-motion

La cellule ciblée par un focus Jarvis reçoit `animate-pulse` (ligne 1765) pendant 6s (timeout ligne 306). `animate-pulse` est une animation infinie (opacité qui bat) — sur 6s c'est ~12 battements, distrayant, et surtout elle ne respecte pas prefers-reduced-motion. La plupart des autres animations du DS (slide-up-fade, etc.) sont définies maison ; rien n'indique un media-query reduced-motion global. Pour un usage pro répété, un highlight clignotant est fatigant.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:1765, app/obligations/[tracker]/tracker-table.tsx:306
- **Reco** : Remplacer le pulse par un highlight statique qui fade-out (ring doré + bg gold/15 maintenu, puis transition d'opacité sur la sortie), et/ou ajouter un bloc `@media (prefers-reduced-motion: reduce){ .animate-pulse, .animate-slide-up-fade { animation: none } }` dans globals.css. Vérifier que les popovers slide-up-fade respectent aussi reduced-motion.

### [low/visual/S] Densité verticale incohérente entre header skeleton et table réelle + colonne Échéance large

loading.tsx simule des lignes h-11 (44px) mais les vraies lignes font py-1.5 (~36-40px) → léger saut visuel au passage skeleton→contenu. Par ailleurs la colonne « Échéance » des trackers cloture-based est en min-w-[150px] (ligne 1581) et empile date + « clôture Déc · dans 12j » sur 2 lignes (lignes 1696-1702), ce qui la rend plus haute que les cellules pastille et déséquilibre le rythme vertical de la ligne ; sur un tableau qui se veut dense, 150px fixes + 2 lignes pour une info secondaire mange la place des colonnes de statut (le vrai contenu). La hiérarchie (date vs cellules d'action) n'est pas tranchée.

- **Fichiers** : app/obligations/[tracker]/loading.tsx:21, app/obligations/[tracker]/tracker-table.tsx:1581, app/obligations/[tracker]/tracker-table.tsx:1687
- **Reco** : Aligner la hauteur du skeleton sur la vraie densité (h-10). Compacter la colonne Échéance : date en tabular-nums + l'écart (« +12j » / « -3j ») en pastille inline plutôt que 2 lignes, réduire à min-w-[120px], et déplacer « clôture Déc » en title/tooltip plutôt qu'en sous-ligne permanente. Réinvestir l'espace gagné dans les colonnes statut.

## Échéances (app/obligations — page mensuelle de pilotage : "À traiter ce mois" + "En retard", groupes par tracker, picker statut inline, popover commentaires, navigation mois)  (72/100)

_Surface solide et déjà très réfléchie : optimistic UI propre sur le picker, popover commentaires perf-isolé, gestion fine des obligations virtuelles, et un engine robuste (pagination, dédup, ranking de statuts). Mais pour une version "définitive" il reste des angles morts coûteux : double refresh systématique au mount couplé à un engine full-scan non caché (perf), erreurs serveur avalées en console alors que le tracker voisin toaste (incohérence + feedback nul), absence totale de prefers-reduced-motion, navigation mois sans clavier ni jump direct, et quelques trous de hiérarchie visuelle / sémantique couleur (tints de section non remappées en navy, "aujourd'hui" non différencié de l'urgence, lien client en sky qui casse le doré MOON)._

### [high/performance/M] Refresh au mount + engine full-scan : double coût RSC à chaque visite

echeances-list.tsx:77-82 lance router.refresh() à CHAQUE mount du composant. Or la page est déjà export const dynamic = 'force-dynamic' (page.tsx:11) : chaque navigation rend déjà du frais côté serveur, puis le refresh au mount re-déclenche immédiatement un 2e cycle RSC complet. Et ce cycle ré-exécute getEcheancesPourMois qui fait un fetchAllSubs() + fetchAllObligations() paginés (echeances-engine.ts:204-241) — sur ~80 clients × 12 TVA × 4 années (anneeMin=year-2..year+1) c'est plusieurs milliers de lignes tirées et matchées en mémoire, deux fois. Le commentaire justifie le refresh par le Router Cache stale, mais force-dynamic + staleTimes ne se cumulent pas comme supposé : on paie un aller-retour entier et un flash de re-render pour couvrir un cas (retour depuis Jarvis/tracker) qui ne concerne pas la navigation interne mois précédent/suivant.

- **Fichiers** : app/obligations/echeances-list.tsx:77-82, app/obligations/page.tsx:11, lib/echeances-engine.ts:204-241
- **Reco** : Conditionner le refresh : ne le lancer que si on revient d'une autre surface, pas sur chaque mount. Pattern : stocker un flag sessionStorage posé par les surfaces qui modifient les statuts, et ne refresh que s'il est présent (puis le consommer). OU mieux : supprimer le refresh au mount et compter sur revalidatePath('/obligations') déjà émis par setEcheanceStatus + un revalidateTag partagé déclenché par Jarvis/tracker. Côté engine, ajouter un index DB (subscription_id, periode) et restreindre le SELECT obligations aux types présents dans les subs billables plutôt que tout [year-2,year+1].

### [high/fluidity/S] Erreurs serveur avalées en console — aucun feedback utilisateur

Dans handlePick (echeances-list.tsx:415-419) et handleOpenComments (448-451), un échec serveur se contente d'un console.error + revert silencieux. L'utilisateur clique 'Terminé', l'optimistic s'affiche, l'action échoue (souscription désactivée — erreur explicite levée dans ensureObligationRow actions.ts:251-255, RLS, réseau), le chip revient en arrière sans un mot. Pour un expert-comptable qui enchaîne vite, c'est un statut qu'il croit enregistré et qui ne l'est pas — risque métier réel (échéance fiscale ratée). Incohérence flagrante : la surface jumelle tracker-table.tsx utilise toastError sur exactement les mêmes actions (lignes 1089, 1106, 1127) via lib/toast-helpers, et sonner est déjà dans la stack.

- **Fichiers** : app/obligations/echeances-list.tsx:415-419, app/obligations/echeances-list.tsx:448-451, app/obligations/[tracker]/tracker-table.tsx:1089
- **Reco** : Importer toastError/toastSuccess depuis @/lib/toast-helpers (déjà utilisé par le tracker). Dans le catch de handlePick : toastError(err, 'Échec mise à jour du statut'). Dans handleOpenComments : toastError(err, 'Impossible d'ouvrir les commentaires'). Optionnel : toastSuccess discret au passage en Terminé (l'item disparaît de la liste, un toast confirme l'action).

### [medium/efficiency/M] Navigation mois : ni clavier, ni saut direct, ni mois dans l'URL au scroll

La nav mois (echeances-list.tsx:113-144) se fait uniquement par clics sur deux flèches. Pour un dirigeant qui pilote, aller de juin à décembre = 6 clics + 6 round-trips serveur (chaque push = navigation RSC dynamique). Aucun raccourci clavier (←/→ ou j/k), aucun moyen de sauter directement à un mois/année (pas de picker, pas de menu), et le libellé central (123-125) est purement décoratif alors qu'il crie 'clique-moi'. 'Revenir au mois courant' n'apparaît que hors mois courant, bien, mais reste un lien texte discret peu cliquable.

- **Fichiers** : app/obligations/echeances-list.tsx:113-144
- **Reco** : 1) Rendre le libellé central cliquable -> ouvre un mini-picker mois/année (réutiliser le composant Picker existant ou un <input type=month>). 2) Ajouter un listener clavier global (useEffect) : ArrowLeft/ArrowRight -> prev/next mois quand aucun input/popover n'a le focus. 3) Prefetch : <Link prefetch> sur prev/next plutôt que router.push impératif, pour que le mois adjacent soit déjà chaud.

### [medium/accessibility/S] Aucune prise en charge de prefers-reduced-motion

Grep sur tout le repo : 0 occurrence de prefers-reduced-motion / motion-reduce. globals.css définit pourtant 7 animations (slide-up-fade, fade-in, scale-in, slide-in-right, achievement-pop avec overshoot bounce cubic-bezier(0.34,1.56...), row-highlight 2.4s). Sur cette surface, chaque ouverture de picker statut et du popover commentaires joue animate-slide-up-fade (picker.tsx:273, comments-panel.tsx:169). Un utilisateur vestibulaire-sensible n'a aucun moyen de couper ça — non-conformité WCAG 2.1 SC 2.3.3 (Animation from Interactions) et c'est un standard attendu au niveau Linear/Stripe que la marque revendique.

- **Fichiers** : app/globals.css:798-863, app/_components/picker.tsx:273, app/obligations/[tracker]/comments-panel.tsx:126
- **Reco** : Ajouter en fin de globals.css un bloc global : @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }. Neutralise aussi le scrollIntoView smooth de picker.tsx:165 et le scrollTo behavior:'smooth' de comments-panel.tsx:126.

### [medium/performance/M] Statut virtuel : double aller-retour serveur par clic (ensure + update)

Pour une obligation virtuelle (cas dominant en début de mois : les cellules n'existent pas encore en DB), setEcheanceStatus avec un libellé exécute ensureObligationRow PUIS updateObligationStatus (actions.ts:209-211). ensureObligationRow fait 3 requêtes (lookup sub, lookup existing, lookup defaultOpt) + INSERT, et updateObligationStatus refait 1 SELECT type + 1 SELECT status_options + 1 UPDATE — soit ~6-7 round-trips DB pour un seul clic, là où un INSERT direct avec le statut_logique déjà connu côté client (l'option est dans pickerOptions) suffirait. Combiné au revalidatePath('/obligations') + router.refresh() de l'appelant, la latence perçue d'un premier clic sur une ligne virtuelle est notable.

- **Fichiers** : app/obligations/actions.ts:204-213, app/obligations/actions.ts:286-300, app/obligations/echeances-list.tsx:386-396
- **Reco** : Fusionner le chemin virtuel+libellé : dans ensureObligationRow, accepter un statut_logique/statut_detail optionnels et les écrire directement dans l'INSERT (le client connaît déjà o.statut_logique via options.find dans handlePick:391). Supprimer l'updateObligationStatus subséquent. Économise ~3 requêtes et un UPDATE par première saisie.

### [medium/color/S] Tints de section non remappées en dark/navy — incohérence avec le DS couleur

Les headers de section utilisent des opacités arbitraires bg-rose-500/[0.06], bg-amber-500/[0.05] (echeances-list.tsx:244-246). Or la couche de compat de globals.css ne remappe QUE les familles -50/-100/-200 et les text-*-500/600 ; grep confirme zéro règle pour bg-rose-500\/ ou bg-amber-500\/. Conséquence : en dark et surtout en navy (qui ajoute .dark + .navy mais où le commentaire l.737-738 dit que les status colors 'restent inchangés'), ces fonds tombent sur le rose-500/amber-500 Tailwind brut à 5-6% — une teinte légèrement différente du système -50 utilisé partout ailleurs, posée sur un card bleu marine. Subtil mais c'est exactement le genre d'incohérence qui se voit côte à côte sur une version 'parfaite'. Le sous-header de tracker (bg-zinc-50/60 -> bien remappé) et la card sont nickel, ce sont juste les bandeaux d'accent qui dévient.

- **Fichiers** : app/obligations/echeances-list.tsx:244-246, app/globals.css:566-615, app/globals.css:737-738
- **Reco** : Remplacer par les familles déjà remappées : header rose -> bg-rose-50/60 dark:bg-rose-50/40 (déjà géré l.572/615), header amber -> bg-amber-50/40 (déjà géré l.567/611). Ou, si on tient aux /[0.05], ajouter les remaps .dark .bg-rose-500\/\[0\.06\] et .navy équivalents dans la couche compat. Le plus simple et cohérent : aligner sur le système -50.

### [medium/visual/M] « Aujourd'hui » et « dans X j » traités comme du neutre, sans signal d'urgence

La colonne échéance (echeances-list.tsx:519-537) ne colore que le retard en rose ; isToday (calculé l.340) et les échéances à J+1/J+2 sont rendus en gris neutre identique à une échéance à J+25. Pour une todo-list de pilotage, l'imminence est l'information n°1 : un dépôt qui tombe aujourd'hui ou demain doit sauter aux yeux autant qu'un retard. D'autant que le tracker dispose déjà d'un getUrgencyStatus (lib/echeances.ts:387) avec niveaux d'urgence — concept non réutilisé ici, c'est une incohérence de richesse entre les deux surfaces sur le MÊME domaine métier.

- **Fichiers** : app/obligations/echeances-list.tsx:339-347, app/obligations/echeances-list.tsx:519-537, lib/echeances.ts:387
- **Reco** : Introduire 3 niveaux dans le relatif/date : retard -> rose (existant) ; aujourd'hui/≤2j -> amber (text-amber-600 dark:text-amber-400 + pastille 'aujourd'hui' en chip amber) ; ≤7j -> souligné léger ou text-zinc-700 medium ; au-delà -> neutre actuel. Réutiliser getUrgencyStatus pour rester cohérent avec le tracker. 'aujourd'hui' mérite un chip plein, pas un simple texte gris.

### [low/color/S] Lien client en bleu sky : casse l'accent doré MOON et la sémantique couleur

Le nom du client et le titre du tracker passent en hover:text-sky-600 dark:hover:text-sky-400 (echeances-list.tsx:469, 504). Le bleu sky est étranger à la palette de marque (encre navy + accent doré --gold). C'est un réflexe 'lien web' générique qui détonne dans un SaaS premium où le doré est censé être la couleur d'interaction signature ; ailleurs l'app utilise hover:text-gold (globals.css:377 définit la classe utilitaire). Le sky n'apparaît nulle part dans les tokens de marque, uniquement comme couleur de statut pipeline (PC).

- **Fichiers** : app/obligations/echeances-list.tsx:467-469, app/obligations/echeances-list.tsx:502-504, app/globals.css:377
- **Reco** : Remplacer hover:text-sky-600 dark:hover:text-sky-400 par hover:text-[hsl(var(--gold-dark))] dark:hover:text-[hsl(var(--gold))] (ou la classe utilitaire hover:text-gold) sur les deux liens, pour ancrer l'interaction sur le doré MOON et homogénéiser avec le reste de l'app.

### [low/visual/S] État vide global pauvre : aucun moment de satisfaction quand tout est traité

Quand un mois n'a rien à traiter et rien en retard, la page affiche une seule card avec le texte gris centré 'Rien à traiter ce mois-ci.' (echeances-list.tsx:171, 256-259) et la section 'En retard' disparaît purement. Pas d'illustration, pas d'icône, pas de message positif — alors que 'zéro échéance + zéro retard' est précisément le bon état que l'outil devrait célébrer pour un cabinet. La card vide fait 'page cassée / données manquantes' plutôt que 'tout est sous contrôle'. L'app a pourtant une culture de feedback gratifiant (animate-achievement-pop dans globals.css).

- **Fichiers** : app/obligations/echeances-list.tsx:160-175, app/obligations/echeances-list.tsx:256-259
- **Reco** : Empty state soigné : icône (CalendarCheck lucide) en cercle gold-soft, titre 'Tout est à jour' + sous-texte 'Aucune échéance ce mois-ci, aucun retard.' centré, padding py-12. Si enRetard.length===0 spécifiquement, on peut ajouter une micro-confirmation visuelle (coche emerald) plutôt que masquer toute trace de la notion de retard.

### [low/fluidity/S] Loading skeleton désynchronisé de la vraie structure de page

loading.tsx affiche un titre + une grille de 4 cartes 'stat' (grid-cols-4) + 6 barres. Mais la vraie page n'a AUCUNE grille de stats : c'est un PageHeader puis le sélecteur de mois puis 1-2 sections en liste (echeances-list.tsx). Le skeleton promet une mise en page (4 KPI cards) qui n'arrive jamais -> saut visuel / layout shift à l'hydratation, sensation de bascule. C'est un détail mais sur une version définitive le skeleton doit matcher la silhouette réelle.

- **Fichiers** : app/obligations/loading.tsx, app/obligations/echeances-list.tsx:110-144
- **Reco** : Réécrire loading.tsx pour refléter la structure : barre titre, puis une ligne de 3 chips (flèche / libellé mois / flèche) à la bonne largeur (~180px central), puis 2 blocs section rounded-2xl avec header + 4-5 lignes. Supprimer la fausse grille de 4 cards.

### [low/visual/M] Picker statut : largeur de chip variable -> colonne de droite qui danse

Le chip de statut (StatusPicker -> Picker bouton, picker.tsx:244-257) a une largeur dictée par le libellé (whitespace-nowrap, px-2). Les libellés varient fortement d'un type à l'autre ('À faire' vs 'EDI - En attente retour client' vs 'Pas commencé'). Dans la colonne desktop col-span-2 justify-end (echeances-list.tsx:541), chaque ligne a donc un chip de largeur différente, et l'icône commentaires + lien tracker se décalent ligne à ligne. Verticalement l'œil ne suit aucune colonne nette — rythme cassé sur une liste dense, là où Attio/Linear gardent des colonnes d'action parfaitement alignées à droite.

- **Fichiers** : app/obligations/echeances-list.tsx:539-559, app/_components/picker.tsx:244-257
- **Reco** : Soit fixer une largeur min au chip de statut dans ce contexte (min-w-[120px] text-left avec truncate), soit aligner les actions sur une grille fixe : réserver une largeur constante au bloc statut et garder commentaires+lien dans un sous-groupe de largeur fixe collé à droite. Au minimum, max-w + truncate sur le libellé pour éviter les chips à rallonge.

### [low/visual/S] Groupe-tracker : pas de hiérarchie de comptage section vs sous-groupe

Le header de section donne un compte global dans le sous-titre ('12 obligations à échéance...', echeances-list.tsx:150/166) et chaque sous-header de tracker répète un compte ('3 obligations', l.269-271). Les deux comptages utilisent des styles proches (text-[10px]/[11px] zinc-500) et le sous-header tracker est en uppercase tracking-[0.08em] (l.266) — visuellement assez fort pour un simple séparateur de groupe, ce qui aplatit la distinction section > groupe > ligne. Sur un mois chargé (TVA = 1 groupe de 60 lignes), le rythme des sous-headers répétés alourdit.

- **Fichiers** : app/obligations/echeances-list.tsx:264-272
- **Reco** : Différencier les niveaux : sous-header tracker plus discret (retirer l'uppercase ou réduire à tracking-wide, text-zinc-500), et déplacer le compteur de groupe en pastille tabulaire à droite (déjà le cas). Envisager un sous-header sticky (top-0 dans la card scrollable) pour garder le contexte du tracker quand on scrolle une longue liste TVA.

### [low/accessibility/M] Picker statut sans libellé accessible ni rôle explicite du chip

Le bouton du Picker (picker.tsx:236-257) porte aria-haspopup='listbox' et aria-expanded, bien, mais aucun aria-label : un lecteur d'écran annonce juste le texte du chip ('À faire') sans dire de quoi il s'agit ni à quelle ligne il appartient. Sur cette page chaque ligne a un picker identiquement nommé 'À faire' -> en navigation lecteur d'écran, série de boutons 'À faire' indistincts. De plus le popover role='listbox' (l.263) contient des <button> et non des role='option' avec aria-selected (l.291-308), donc la sémantique listbox/option attendue est incomplète.

- **Fichiers** : app/obligations/echeances-list.tsx:568-635, app/_components/picker.tsx:236-308
- **Reco** : 1) Passer un aria-label contextuel au Picker depuis StatusPicker : `Statut — ${item.clientName}, ${item.trackerTitle}`. 2) Dans picker.tsx, mettre role='option' + aria-selected={isSelected} sur les boutons d'option (l.291), et aria-activedescendant sur le listbox pointant vers l'option active pour une vraie nav clavier annoncée.

## Missions (IR/IFI, CAA, Pilotage, Créations, Exceptionnelles)  (72/100)

_Surface dense et fonctionnellement très riche (sélection Excel, optimistic UI, pickers portalisés, auto-facturation), avec une base de cohérence réelle grâce aux composants partagés (Picker, BulkActionBar, StatusFilterChip). Mais la promesse « 5 tables cohérentes » est tenue à ~70% : trois sémantiques de pastilles différentes pour un même point rouge, deux palettes « en cours » concurrentes (blue vs sky) dont une seule a un vrai traitement dark/navy, des récaps d'années au layout divergent, et des incohérences ergonomiques fines (forfait IR éditable alors qu'il est commun, sélecteur d'année pilotage figé à 2026, modales sans focus-trap). Rien de cassé visuellement mais l'œil exigeant repère vite que les tables n'ont pas été harmonisées au dernier kilomètre._

### [high/consistency/M] Trois sémantiques différentes pour la même pastille rouge

Le point coloré en tête de ligne (qui doit dire « action requise ») ne veut pas dire la même chose d'une table à l'autre. IR et Pilotage calculent une vraie urgence via computeEcheanceIR/computeEcheancePilotage → amber (à traiter) ou rose (en retard). CAA affiche une pastille ROSE FIXE dès qu'une mission n'est pas TERMINE/N/A (caa-table.tsx:755-768, isPasTerminee inclut EN_COURS, aucune échéance) — c'est exactement le bruit visuel que le commentaire d'IR (ir-table.tsx:801-804) dit avoir corrigé. Créations affiche rose uniquement si a_traiter/null, donc une création « INPI en cours » n'a AUCUN signal alors qu'un IR en cours proche échéance en a un (creations-table.tsx:658-665). Exceptionnelles : rose si a_demarrer OU en_cours (mission-exc-table.tsx:1162). Résultat : un même rond rouge signifie « en retard » ici, « pas fini » là, « pas démarré » ailleurs. Pour un expert qui scanne vite, c'est trompeur.

- **Fichiers** : app/missions/caa/caa-table.tsx:755-768, app/missions/creations/creations-table.tsx:658-665, app/missions/exceptionnelles/mission-exc-table.tsx:1159-1174, app/missions/ir/ir-table.tsx:805-830, app/missions/pilotage/pilotage-table.tsx:451-477, lib/echeances.ts:387-403
- **Reco** : Unifier sur la logique amber/rose d'IR/Pilotage (getUrgencyStatus). CAA n'a pas de règle d'échéance dans lib/echeances.ts : soit en ajouter une (computeEcheanceCAA), soit assumer une pastille amber neutre « à traiter » (pas rose) pour distinguer « à faire » de « en retard ». Créations : étendre la pastille amber à tous les statuts non terminaux (depot_capital, inpi_*), pas seulement a_traiter. Documenter la convention : amber = à traiter / actif, rose = en retard, rien = terminé ou pas encore actif.

### [high/color/S] « En cours » est bleu dans IR/CAA, sky partout ailleurs

Les colonnes statut IR et CAA passent statutColorClass(o.statut_logique) dans le Picker (ir-table.tsx:899, caa-table.tsx:825). Pour EN_COURS cela renvoie STATUT_COLORS.EN_COURS = 'bg-blue-100 text-blue-800 border-blue-200' (lib/utils.ts:31). Or TOUTES les autres surfaces de Missions utilisent sky pour « en cours » : pilotage (TDB/RDV_OPTIONS sky-50/500), créations (depot_capital/inpi sky-50/500), exceptionnelles (ETAT_MISSION en_cours sky), et même les chips de filtre (StatusFilterChip accent="sky" partout, y compris dans IR/CAA eux-mêmes ir-table.tsx:647). Donc dans la table IR, le chip de filtre « En cours » a un point sky mais les cellules « en cours » sont bleues. Mismatch bleu/sky directement à l'écran.

- **Fichiers** : lib/utils.ts:28-44, app/missions/ir/ir-table.tsx:896-900, app/missions/caa/caa-table.tsx:822-826
- **Reco** : Aligner STATUT_COLORS.EN_COURS sur sky : 'bg-sky-100 text-sky-800 border-sky-200' (et le custom 'blue' → sky aussi), ou faire dériver IR/CAA des mêmes constantes inline sky que les autres tables. Vérifier que le mapping reste cohérent avec les obligations/[tracker] qui partagent statutColorClass.

### [high/consistency/S] Pilotage : année courante figée à 2026 en dur

pilotage/page.tsx:8 fait `const CURRENT_YEAR = 2026;` en dur, alors qu'IR/CAA/Créations utilisent `new Date().getFullYear()`. Le sélecteur d'années de pilotage (year-1/year/year+1, pilotage-table.tsx:350) restera donc centré sur 2026 même en 2027+, divergeant des autres onglets qui suivront l'année réelle. C'est un piège temporel silencieux : à partir de janvier 2027, ouvrir Pilotage affichera 2025-2026-2027 centré sur 2026 tandis qu'IR affichera 2026-2027-2028.

- **Fichiers** : app/missions/pilotage/page.tsx:8, app/missions/ir/page.tsx:11, app/missions/caa/page.tsx:9, app/missions/creations/page.tsx:11
- **Reco** : Remplacer par `const CURRENT_YEAR = new Date().getFullYear();` comme les 3 autres pages. Si 2026 était un défaut métier voulu, le rendre explicite (ex. clamp min) plutôt que codé en dur.

### [medium/color/M] Chips statut IR/CAA : palette light-only avec dark/navy via couche de compat

statutColorClass renvoie des classes 100/800 SANS variante dark: (lib/utils.ts:28-33). En dark/navy elles ne sont colorées que par les overrides globaux .dark .bg-blue-100{hsl(218 45% 22%)} etc. (globals.css:587/669/702). Tout le reste de la surface utilise des chips translucides dark:bg-sky-500/15 (pilotage/créations/exc/FACT/LDM), qui ont un rendu visuel nettement plus léger et « verre dépoli ». Conséquence : en dark, les chips de statut IR/CAA sont des aplats plus opaques/saturés que les chips de facturation ou LDM de la même ligne — deux familles visuelles de badges cohabitent. De plus aucun override .navy .bg-blue-100 n'existe : ça fonctionne uniquement parce que le toggle applique .dark .navy ensemble (globals.css:172-176), couplage fragile si la stratégie de thème évolue.

- **Fichiers** : lib/utils.ts:28-56, app/globals.css:587-702, app/_components/picker.tsx:310
- **Reco** : Faire émettre à statutColorClass les mêmes tokens translucides que les options inline (ex. EN_COURS → 'bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30'), pour que tous les badges d'une ligne partagent exactement la même densité dans les 3 thèmes. Supprime aussi la dépendance aux overrides de compat pour ces chips.

### [medium/visual/M] Récap par année : 2 layouts différents (créations vs IR/CAA)

IR et CAA rendent le récap comme une grille de cards autonomes pleine largeur (grid ... lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5, ir-table.tsx:688, caa-table.tsx:653) avec barre de progression et titre d'année en gras. Créations rend un BLOC unique encadré avec un header « Recap par année » et seulement les 3 années les plus récentes via recapYears.slice(0,3) en grille md:grid-cols-3 (creations-table.tsx:554-601). Donc à statuts/données équivalents, créations plafonne arbitrairement à 3 années et présente une boîte là où IR/CAA présentent des cartes flottantes. Pilotage et exceptionnelles n'ont eux aucun récap par année (KPI différents). L'œil ressent une rupture de rythme en naviguant entre les onglets.

- **Fichiers** : app/missions/creations/creations-table.tsx:553-601, app/missions/ir/ir-table.tsx:687-724, app/missions/caa/caa-table.tsx:652-681
- **Reco** : Extraire un composant <YearRecapGrid> partagé (card par année, barre emerald, état vide « aucune souscription ») et l'utiliser à l'identique dans IR/CAA/Créations. Retirer le slice(0,3) de créations (ou l'appliquer aussi à IR/CAA si le plafond est voulu) pour une règle unique.

### [medium/efficiency/M] Forfait IR éditable alors qu'il est commun IR+IFI (pas de garde, contrairement à CAA)

Le forfait IR est conceptuellement « commun IR+IFI par dossier-année » (commentaire ir-table.tsx:63, sync via setIrForfait). En vue année la cellule Forfait s'affiche pour tout dossier souscrit IR OU IFI et reste toujours éditable (ir-table.tsx:941-946, EditableForfait sans prop disabled). À l'inverse CAA passe disabled={!r.obligations.has(selectedYear)} (caa-table.tsx:840) et EditableForfait CAA gère un état disabled visuel (caa-table.tsx:1237-1243). Les deux composants EditableForfait sont d'ailleurs dupliqués quasi à l'identique entre IR et CAA. Risque : éditer un forfait sur une ligne IFI-seule sans cohérence claire, et duplication de code à maintenir.

- **Fichiers** : app/missions/ir/ir-table.tsx:941-946, app/missions/ir/ir-table.tsx:1340-1407, app/missions/caa/caa-table.tsx:836-841, app/missions/caa/caa-table.tsx:1209-1286
- **Reco** : Extraire un seul <EditableForfait disabled?> partagé (déjà présent en double) et lui passer une garde explicite côté IR (ex. désactiver si ni IR ni IFI souscrits l'année, ou afficher un tooltip « commun IR+IFI »). Aligner le comportement disabled IR sur CAA.

### [medium/consistency/M] Pilotage n'a pas les vues Base/onglets ni la nav 3-ans glissante des autres

IR/CAA/Créations partagent un pattern de navigation identique : onglet « Base » + flèches ChevronLeft/Right qui décalent une fenêtre 3-ans glissante centrée (center), avec préservation du center dans l'URL. Pilotage propose seulement 3 années fixes [year-1, year, year+1] sans flèches ni vue Base (pilotage-table.tsx:350,390-405) ; impossible d'aller voir 2023 sans éditer l'URL. Exceptionnelles n'a pas d'années du tout (logique différente, OK). Du coup 3 onglets ont une chrono navigable et le 4e (pilotage) a une chrono bornée à ±1 an, ce qui surprend l'utilisateur qui vient d'IR.

- **Fichiers** : app/missions/pilotage/pilotage-table.tsx:350-406, app/missions/ir/ir-table.tsx:563-637
- **Reco** : Ajouter au minimum les flèches de décalage de fenêtre à pilotage (réutiliser la logique center/prevCenter/nextCenter d'ir-table.tsx:574-577), idéalement le même bloc <YearSwitcher> extrait en composant partagé pour IR/CAA/Créations/Pilotage.

### [medium/accessibility/M] Modales (FormModal, TypesManagerModal) sans focus-trap ni restauration de focus

La TypesManagerModal (mission-exc-table.tsx:2187) et les FormModal d'édition IR/CAA s'ouvrent en role=dialog aria-modal mais ne piègent pas le focus : Tab peut sortir derrière l'overlay backdrop-blur, et à la fermeture le focus n'est pas rendu au bouton déclencheur (ni « Gérer les types » ni le crayon de ligne). Pour un usage clavier intensif (le persona tape vite), c'est un accroc WCAG 2.4.3/2.1.2. Le Picker, lui, gère bien Escape + restauration focus (picker.tsx:180-182,210) — l'incohérence est interne à la surface.

- **Fichiers** : app/missions/exceptionnelles/mission-exc-table.tsx:2187-2213, app/missions/ir/ir-table.tsx:1196-1222, app/missions/caa/caa-table.tsx:1076-1094
- **Reco** : Ajouter un focus-trap (boucle Tab/Shift+Tab sur les éléments focusables du dialog) et restaurer le focus sur l'élément déclencheur à la fermeture (mémoriser document.activeElement à l'ouverture). Mutualiser dans FormModal pour couvrir IR/CAA en une fois.

### [low/performance/S] Imports morts createPortal / useRef dans 4 tables

ir-table.tsx, caa-table.tsx, creations-table.tsx importent createPortal (react-dom) sans jamais l'utiliser (toute la portalisation est déléguée au Picker partagé). useRef est importé dans ir/caa/creations/pilotage mais n'est utilisé que dans exceptionnelles. Ces imports morts alourdissent inutilement, brouillent la lecture et auraient dû être supprimés au moment du refactor vers Picker (commentaire « (StatutPicker… remplacés par <Picker> » creations-table.tsx:853). Aucun impact runtime majeur mais c'est un signal de « pas fini » sur une version qui se veut définitive.

- **Fichiers** : app/missions/ir/ir-table.tsx:3-6, app/missions/caa/caa-table.tsx:3-6, app/missions/creations/creations-table.tsx:4-6, app/missions/pilotage/pilotage-table.tsx:5
- **Reco** : Retirer `createPortal` des imports d'IR/CAA/Créations et `useRef` d'IR/CAA/Créations/Pilotage. Activer une règle lint no-unused-vars stricte pour empêcher la récidive.

### [low/efficiency/S] Filtre « Tout sélectionner » : bouton texte discret, pas de raccourci visible ni d'état

Le « Tout sélectionner » est un petit lien gris [11px] dans le footer (ir-table.tsx:1008-1016, idem CAA/Créations/Pilotage). Il déclenche selectAll mais : (1) ne devient pas « Tout désélectionner » quand tout est déjà sélectionné (pas de toggle), (2) n'indique pas le raccourci Cmd+A pourtant supporté par le hook et documenté dans le tooltip de la BulkActionBar (bulk-action-bar.tsx:297), (3) sur exceptionnelles il n'existe pas du tout (pas de sélection cellulaire là-bas). Pour un power-user qui veut bulk-éditer une colonne entière, l'affordance est faible.

- **Fichiers** : app/missions/ir/ir-table.tsx:1008-1016, app/missions/caa/caa-table.tsx:905-913, app/missions/pilotage/pilotage-table.tsx:615-623, app/_components/bulk-action-bar.tsx:297
- **Reco** : Transformer en toggle « Tout sélectionner / Désélectionner » selon selectedCount vs nombre de cellules de la colonne, et accoler le hint « ⌘A ». Optionnel : un kbd discret à côté. Garder le pattern identique sur les 4 tables sélectionnables.

### [low/accessibility/S] Outline de focus cellule : épaisseur incohérente (1px vs 2px)

La cellule focalisée au clavier (navigation Excel) a un outline sky d'épaisseur 1 dans IR/CAA/Créations (outline outline-1, ir-table.tsx:883, caa-table.tsx:809, creations-table.tsx:695) mais d'épaisseur 2 dans Pilotage (outline outline-2 outline-sky-500, pilotage-table.tsx:526). Même interaction, deux rendus de focus. 1px sky-400 en dark/navy sur fond sélectionné sky/[0.12] est par ailleurs un contraste de focus assez faible.

- **Fichiers** : app/missions/ir/ir-table.tsx:883, app/missions/caa/caa-table.tsx:809, app/missions/creations/creations-table.tsx:695, app/missions/pilotage/pilotage-table.tsx:526
- **Reco** : Standardiser sur outline-2 (le plus visible, déjà utilisé par pilotage) avec outline-offset-[-2px] sur les 4 tables. Vérifier le contraste de l'anneau de focus sur fond sky-500/[0.12] en dark (passer à outline-sky-400 minimum).

### [low/performance/M] Bulk Promise.all sans limite de concurrence (facturation/forfait)

Les applications bulk de facturation lancent une server action par ligne en parallèle via Promise.all (ir-table.tsx:345 onBulkApply FACT, 292 paste FACT ; caa-table.tsx:326 ; creations-table.tsx:390). Sur une sélection large (ex. « Tout sélectionner » sur 79 dossiers IR puis appliquer « Facturée »), c'est ~79 requêtes Supabase simultanées + autant de revalidatePath, là où les statuts passent par un seul bulkSet…Statut groupé côté serveur. Asymétrie : les statuts sont batchés, la facturation/forfait non. Risque de rate-limit/latence perçue et de revalidations redondantes.

- **Fichiers** : app/missions/ir/ir-table.tsx:343-353, app/missions/caa/caa-table.tsx:324-334, app/missions/creations/creations-table.tsx:388-398
- **Reco** : Ajouter des server actions bulkSetFacturation(ids, year, etat) (un seul UPDATE … IN) comme pour les statuts, et un seul revalidatePath en fin. À défaut, plafonner la concurrence (p-limit ~5). Gain direct sur la latence perçue des gros bulk.

### [low/visual/S] Emoji 📅 brut comme glyphe d'UI dans exceptionnelles

La date de début de mission utilise un emoji littéral 📅 (mission-exc-table.tsx:1213) comme icône, alors que toute la surface (et l'app) s'appuie sur lucide-react (Calendar dispo). Rendu hétérogène multi-plateforme (l'emoji change selon OS/police), couleur non contrôlable (ne suit pas text-zinc-400), et incohérent avec les autres icônes monochromes des lignes (Pencil, X, Copy, ExternalLink, MessageSquare). Idem le ↵ dans le composer commentaires (comments-popover.tsx:322) est OK car dans un kbd, mais le 📅 est décoratif.

- **Fichiers** : app/missions/exceptionnelles/mission-exc-table.tsx:1212-1219
- **Reco** : Remplacer par <Calendar className="h-3 w-3" /> de lucide-react, hérite de text-zinc-400 dark:text-zinc-500. Cohérence immédiate avec les autres glyphes de ligne.

### [low/consistency/M] Pilotage/Créations : facturation absente de la colonne mais présente ailleurs — modèle de facturation éclaté

La facturation existe comme colonne pleine dans IR, CAA, Créations, Exceptionnelles (pastilles À facturer/Facturée/Sans facture, palette FACT_OPTIONS strictement identique copiée 4 fois) mais PAS dans Pilotage (qui n'a ni forfait ni facturation). Or Pilotage liste des missions livrables (TdB présenté) qui pourraient être facturables. Plus gênant : FACT_OPTIONS est dupliqué à l'identique dans ir/caa/creations/exc (ir-table.tsx:68-72, caa-table.tsx:61-65, creations-table.tsx:41-45, mission-exc ETAT_FACTURATION 127-150) — toute évolution de libellé/couleur doit être répétée 4×, source de dérive future.

- **Fichiers** : app/missions/ir/ir-table.tsx:67-72, app/missions/caa/caa-table.tsx:60-65, app/missions/creations/creations-table.tsx:40-45, app/missions/exceptionnelles/mission-exc-table.tsx:127-150
- **Reco** : Extraire FACT_OPTIONS (et EtatFacturation) dans un module partagé lib/facturation.ts importé par les 4 tables. Décider explicitement si Pilotage doit porter une facturation (sinon documenter pourquoi pas, pour que l'absence soit un choix et non un oubli).

## Facturation centralisée (app/facturation)  (66/100)

_Surface solide et honnête sur le fond : agrégation propre de 6 sources, montants en tabular-nums, popover en portal anti-clipping, skeleton dédié. Mais elle est en retard sur le reste de l'app : elle réimplémente un FactPicker maison (sans nav clavier, sans role listbox) là où un Picker partagé complet existe, ses filtres sont des onglets sans compteurs (vs StatusFilterChip), il manque une recherche client, le feedback optimiste désync visiblement avec le filtre par défaut, et il n'y a aucun prefers-reduced-motion dans tout le projet. Les KPI sont plats et trompeurs quand on filtre. Rien de cassé, mais loin du niveau « définitif » visé._

### [high/consistency/M] FactPicker maison duplique le Picker partagé (sans clavier ni a11y)

facturation-center.tsx réimplémente ~115 lignes de popover (FactPicker, lignes 307-421) alors que app/_components/picker.tsx fait exactement ça et est utilisé par CAA, IR, Missions exc., Créations. Conséquences concrètes : (1) le FactPicker n'a AUCUNE navigation clavier (le Picker gère ArrowUp/Down/Home/End/Enter/Tab + scrollIntoView + restauration du focus sur Escape) ; (2) le popover n'a pas role="listbox" alors que le bouton annonce aria-haspopup="listbox" (incohérence ARIA) ; (3) il affiche un caractère brut ✓ au lieu de l'icône lucide Check ; (4) le centrage du popover diffère (FactPicker centre, Picker s'aligne à droite par défaut), donc le même geste produit un placement différent ici. C'est la dette de cohérence n°1 de la surface.

- **Fichiers** : app/facturation/facturation-center.tsx:307-421, app/_components/picker.tsx:37-339
- **Reco** : Supprimer FactPicker et utiliser <Picker value={it.etat_facturation} options={FACT_OPTIONS} onChange={v=>onSetFact(it,v)} onReset={()=>onSetFact(it,null)} allowEmpty placeholderColor={amber} placeholderTitle="Facturation non définie" align="center" />. FACT_OPTIONS est déjà au format PickerOption (key/label/color). On gagne la nav clavier, role listbox, Check, et -115 lignes.

### [high/efficiency/M] Aucune recherche client : retrouver un dossier = scan visuel

La liste agrège 6 sources sur 79+ clients : en pratique des dizaines à centaines de lignes. Il n'existe aucun champ de recherche (Grep `search|input` = 0 résultat dans facturation-center.tsx). Pour facturer « Dupont », Benjamin doit scroller. C'est l'écran où l'on cherche un nom précis le plus souvent, et c'est précisément celui qui n'a pas de filtre texte, alors que les autres surfaces ont des filtres riches. Le filtrage est purement par onglets État/Source.

- **Fichiers** : app/facturation/facturation-center.tsx:158-172, app/facturation/facturation-center.tsx:99-100
- **Reco** : Ajouter un <input> de recherche debouncé (client-side sur localItems, match insensible accents sur clientName + detail) à gauche des FilterBar, avec icône Search lucide et raccourci. Réutiliser le style input de l'app (h-8, rounded-md, border-zinc-200 dark:border-white/[0.08], focus-visible déjà global). Filtrer dans un useMemo sur localItems.

### [high/fluidity/M] Feedback optimiste qui désync : la ligne reste puis disparaît, sans confirmation

onSetFact (l.102-115) met à jour localItems optimistiquement PUIS router.refresh(). Sous le filtre par défaut « À facturer », passer une ligne en « Facturée » la garde affichée (état mis à jour mais pas retirée du tableau), puis le refresh serveur la fait disparaître brutalement car page.tsx la filtre (l.356-366). Résultat : flash incohérent (la pastille devient verte, puis la ligne s'évanouit ~300-800ms après) et zéro toast de succès (toast uniquement on error, l.111). L'utilisateur n'a aucune confirmation positive — seulement une ligne qui s'efface.

- **Fichiers** : app/facturation/facturation-center.tsx:102-115, app/facturation/page.tsx:356-366
- **Reco** : Deux options : (a) retirer optimistiquement la ligne de localItems si elle ne matche plus filterEtat, avec une transition d'exit (max-height/opacity) plutôt qu'un saut ; (b) afficher un toast d'action avec Undo (sonner toast.success("Marquée facturée", { action: { label: "Annuler", onClick: () => onSetFact(item, prevEtat) } })) — pattern attendu pour une action destructive-visuellement. Au minimum, déclencher toastSaved() au succès pour confirmer.

### [medium/efficiency/M] KPI trompeurs sous filtre : « À facturer = 0 » quand on regarde « Facturées »

Les 4 KPI (l.119-156) sont calculés sur localItems = les items DÉJÀ filtrés par état. Quand filterEtat="facturee", la liste ne contient que des facturées, donc le KPI « À facturer » affiche 0 et « Sans facture » 0 — alors qu'il existe peut-être 40 lignes à facturer. Le dashboard prétend donner une vue d'ensemble mais reflète juste le filtre. Pire : « Total affiché … sur N au total » (l.155) — N = allItems.length inclut les sans_facture exclus par défaut, donc le ratio est incohérent avec ce que l'œil voit.

- **Fichiers** : app/facturation/facturation-center.tsx:119-156
- **Reco** : Calculer les KPI sur l'ensemble non filtré par état (passer un totaux global depuis page.tsx, ou un prop allItemsForKpi), pour qu'ils restent stables quel que soit l'onglet actif — c'est le rôle d'un KPI. Garder « Total affiché » lié à la liste filtrée mais clarifier le dénominateur (lignes de la source courante, pas allItems).

### [medium/accessibility/S] Aucun prefers-reduced-motion dans tout le projet

globals.css n'a aucune règle @media (prefers-reduced-motion: reduce) et le code n'utilise jamais motion-reduce: (Grep global = 0 résultat). Le FactPicker ouvre avec animate-slide-up-fade (l.383), et l'app a row-highlight/achievement-pop/scale-in. WCAG 2.3.3 (AAA) et la bonne pratique premium imposent de neutraliser ces animations pour les utilisateurs sensibles. Ça touche toute l'app mais se manifeste ici à chaque ouverture de popover de facturation.

- **Fichiers** : app/globals.css:899-915, app/facturation/facturation-center.tsx:383
- **Reco** : Ajouter dans globals.css : @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; } } et désactiver les keyframes décoratives (achievement-pop, row-highlight). Effort S, gain a11y transverse.

### [medium/consistency/M] Filtres sans compteurs (FilterBar maison vs StatusFilterChip partagé)

Les filtres État/Source sont des onglets Link maison (FilterBar, l.265-301) sans compteur. Le reste de l'app utilise StatusFilterChip (app/_components/status-filter-chip.tsx) qui affiche un count par groupe dans une mini-pill. Sur cette page, savoir « combien à facturer / combien facturées » d'un coup d'œil sur les onglets serait très utile (les nombres existent déjà dans kpi). En plus, deux systèmes de filtres visuels coexistent dans l'app pour la même intention.

- **Fichiers** : app/facturation/facturation-center.tsx:265-301, app/_components/status-filter-chip.tsx:16-75
- **Reco** : Soit afficher un count dans chaque onglet de FilterBar (réutiliser la mini-pill tabular-nums text-[10px] de StatusFilterChip), soit migrer vers StatusFilterChip. Calculer les counts par état sur l'ensemble non filtré (cf. finding KPI). Garder la navigation par URL si on veut le partage de lien, mais aligner le style.

### [medium/visual/M] Montants manquants noyés : la majorité des lignes affichent « - » sans signal

Le montant vient de forfait/honoraires_jur/forfait_bilan, souvent null (AGO si honoraires_jur=0, créations si honoraires_creation=0, CAA/IR si migration 0053 non appliquée → fallback null l.59/105). La cellule rend alors un « - » gris italique (l.212). Sur un écran de FACTURATION, une ligne sans montant est une donnée à compléter, pas un détail neutre. Et les KPI « Total à facturer (estim.) » somment silencieusement 0 pour ces lignes : l'estimation est partielle sans que l'UI dise « X lignes non valorisées ».

- **Fichiers** : app/facturation/facturation-center.tsx:211-213, app/facturation/facturation-center.tsx:152-153, app/facturation/page.tsx:197,261,340
- **Reco** : Rendre le montant manquant actionnable : remplacer le « - » par un chip discret « À chiffrer » (text-amber-600/amber-500, cursor aide) avec title expliquant la source du montant. Et dans le subtitle KPI, préciser « estim. sur N lignes valorisées / M » pour ne pas laisser croire à un total complet.

### [medium/efficiency/L] Pas de tri ni de regroupement par client ou montant

Le tri est figé côté serveur (état puis clientName, page.tsx l.375-380). Impossible de trier par montant décroissant (« quelles grosses factures émettre d'abord ? »), ni de regrouper les lignes d'un même client (un client peut apparaître en CAA + Bilan + AGO sur des lignes séparées, dispersées). Pour un expert-comptable qui prépare une session de facturation, c'est un manque ergonomique réel. Les en-têtes de colonne ne sont pas cliquables.

- **Fichiers** : app/facturation/page.tsx:368-380, app/facturation/facturation-center.tsx:181-227
- **Reco** : Rendre les en-têtes Montant et Client triables (tri client-side sur localItems, indicateur ChevronUp/Down comme dans mission-exc-table qui utilise déjà ce pattern). Optionnellement, un toggle « grouper par client » qui insère des sous-totaux par dossier — très parlant pour facturer en lot.

### [low/consistency/S] Format monétaire et helper dupliqués, divergents de fmtEuro

formatEUR (l.81-84) est copié-collé à l'identique depuis finance-dashboard.tsx (l.135-137) et produit « 1 200 € HT », alors que lib/utils.ts expose fmtEuro qui produit « 1 200 € » (style:currency). Trois formats monétaires coexistent donc dans l'app. Le suffixe « HT » est pertinent ici, mais le fait d'avoir deux copies privées du même formatter est de la dette : un changement de règle (k€, espace insécable) devra être répété.

- **Fichiers** : app/facturation/facturation-center.tsx:81-84, app/finance/finance-dashboard.tsx:135-137, lib/utils.ts:11-18
- **Reco** : Extraire un helper partagé fmtEuroHT(n) dans lib/utils.ts (réutilisant l'Intl déjà là) et l'importer dans finance + facturation. Supprimer les deux copies locales. Vérifier l'espace insécable avant € (Intl le gère, le concat manuel " € HT" ajoute un espace normal — fragile sur retour à la ligne).

### [low/accessibility/S] Pop-over sans focus trap ni gestion du resize/scroll

Le FactPicker positionne le popover une seule fois à l'ouverture (useEffect dep [open], l.320-334). Si l'utilisateur scrolle la page ou redimensionne pendant qu'il est ouvert, le popover reste figé à l'ancienne position (décalé du bouton). De plus, à l'ouverture le focus ne part pas dans la liste (contrairement au Picker partagé qui pilote activeIdx), donc un utilisateur clavier ouvre un menu sans point d'entrée focalisable cohérent.

- **Fichiers** : app/facturation/facturation-center.tsx:320-353
- **Reco** : Encore un argument pour adopter le Picker partagé. Si on garde un popover maison, écouter scroll/resize (recalcul de pos) et déplacer le focus sur la 1re option à l'ouverture. Mais la vraie réponse est la migration (cf. finding 1).

### [low/color/S] Couleurs source en pastilles 10px : contraste limite en dark/navy

Les tags source (SOURCE_COLOR, l.45-52) utilisent text-teal-300/indigo-300/etc. sur bg-*-500/15 en dark, à 10px font-medium (l.196). teal-300/rose-300 sur un fond à 15% d'opacité passent sous ~4.5:1 en dark, et le texte 10px est sous le seuil « large text ». L'intention (6 teintes distinctes hors sémantique métier) est bonne, mais la lisibilité réelle en dark/navy à cette taille est juste. La pastille État juste à côté est en 11px sur fonds /25 — plus lisible.

- **Fichiers** : app/facturation/facturation-center.tsx:45-52, app/facturation/facturation-center.tsx:196-198
- **Reco** : Monter l'opacité de fond à /20 et le texte à text-*-200 en dark (comme les FACT_OPTIONS qui utilisent déjà /25 + 200), ou passer la pastille source à 11px. Vérifier teal/rose/indigo au contrast checker sur les 3 thèmes. Aligner sur la recette dark des chips d'état pour cohérence.

### [low/visual/M] Hiérarchie visuelle plate : KPI sans icône/accent vs finance, pas de h2

Les Kpi (l.239-263) sont des cartes plates (bordure + ombre), là où finance-dashboard a des KpiHero avec gradient bg, icône en pastille et delta coloré (l.314-368). Sur la page sœur (Finance), la même intention « carte de chiffre clé » est nettement plus premium. Côté sémantique, les 4 KPI et le tableau n'ont aucun titre de niveau h2 (seul PageHeader pose le h1) : pour un lecteur d'écran, KPI et tableau flottent sans repère de section. Le type accent inclut "sky" jamais utilisé (l.248,251) — code mort mineur.

- **Fichiers** : app/facturation/facturation-center.tsx:150-156, app/facturation/facturation-center.tsx:239-263
- **Reco** : Aligner les Kpi sur le pattern finance (petit gradient accentRing + mini-icône lucide : à_facturer→FileClock amber, facturée→CheckCircle emerald, sans_facture→Ban zinc). Ajouter un <h2 className="sr-only">Synthèse</h2> avant la grille KPI et donner un aria-labelledby au tableau. Retirer le variant "sky" mort du type.

### [low/fluidity/S] Skeleton de chargement décalé du rendu réel (toolbar + colonnes)

loading.tsx (l.14-15) rend la toolbar comme un seul bloc h-12, alors que la vraie page affiche deux segmented controls État/Source de hauteur différente. Le skeleton du titre (l.6-7, h-7 w-48) ne matche pas non plus le PageHeader réel (text-lg/xl + description sur 2 lignes). Le saut layout au moment de l'hydratation est léger mais perceptible et nuit à la sensation « définitive ».

- **Fichiers** : app/facturation/loading.tsx:5-22, app/facturation/facturation-center.tsx:151-172
- **Reco** : Faire correspondre le skeleton : deux groupes de pills arrondies (rounded-xl) pour les filtres, et caler la largeur/hauteur du titre sur PageHeader (h-6 + ligne description h-3 w-80). Garder 4 cartes KPI (OK) mais leur donner la même hauteur que les vraies (p-3 → ~h-[76px], pas h-24).

## Onboarding global (Liste + cercle de progression, Matrice, Paramétrage du parcours)  (72/100)

_Surface dense et fonctionnellement riche : filtres persistés en URL, édition inline optimiste, popovers portaillés bien positionnés (clamp viewport), et un éditeur de parcours DnD soigné. Le socle est solide. Mais trois faiblesses la tirent vers le bas pour une version « définitive » : (1) la Matrice est un quasi-fork visuel de la Liste et de la fiche — toolbar non thémée dark/navy, aucun traitement mobile, et ~300 lignes de popover dupliquées avec la fiche ; (2) trois logiques de couleur de progression coexistent (anneau, barre matrice, barre fiche) et le statut « À faire » est sous-contrasté ; (3) aucune prise en charge de prefers-reduced-motion et confirmations destructives incohérentes (window.confirm vs modale maison)._

### [high/consistency/M] La toolbar de la Matrice n'a aucun traitement mobile (la Liste si)

onboarding-list.tsx a une vraie UX mobile : grid 2x2 de selects natifs (MobileFilterSelect) sous md, avec un commentaire explicite « éviter le scroll horizontal vu sur les chips » (lignes 248-300). La Matrice (matrice-table.tsx lignes 402-440) ne reprend RIEN : c'est un unique flex-wrap desktop. Sur mobile, les ~14 FilterChips Type/TNS/Statut + le tri s'empilent sur 4-5 lignes AU-DESSUS d'un tableau déjà en overflow-x-auto. Le même utilisateur, sur le même domaine, vit deux ergonomies opposées selon l'onglet.

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:402-440, app/onboarding/onboarding-list.tsx:202-301
- **Reco** : Extraire la toolbar de filtres (search + chips desktop + grid de MobileFilterSelect) dans un composant partagé <OnboardingFilters> consommé par Liste ET Matrice. La duplication de FilterChip/SortBtn/typeCounts/tnsCounts/statusCounts/origineToType/TYPE_PILL/TYPE_LABEL entre les deux fichiers est déjà quasi identique : la factoriser supprime le risque de dérive.

### [high/consistency/S] Trois logiques de couleur de progression pour la même donnée

Le même indicateur « progression onboarding » se peint de trois façons : (1) anneau Liste = gris si vide, doré en cours, emerald si complet (onboarding-list.tsx:412-416) ; (2) barre Matrice = même logique gris/doré/emerald (matrice-table.tsx:580-585) ; (3) barre de la fiche client = TOUJOURS emerald, même à 10% (clients/[slug]/onboarding/page.tsx:153). Un dossier à 30% est doré dans la Liste/Matrice mais vert sur sa propre fiche : message sémantique contradictoire (le vert = « tout va bien » alors qu'il reste 70%).

- **Fichiers** : app/clients/[slug]/onboarding/page.tsx:151-156, app/onboarding/matrice/matrice-table.tsx:576-589, app/onboarding/onboarding-list.tsx:412-416
- **Reco** : Choisir UNE sémantique et l'extraire en helper (ex: progressColor(done,total,noTasks) → classe). Recommandation : gris (vide) / doré --gold (en cours) / emerald-500 (complet), appliqué aux 3 surfaces. Corriger en priorité la barre fiche (remplacer bg-emerald-500 fixe par la logique conditionnelle).

### [medium/color/S] Toolbar Matrice non thémée dark/navy (focus ring doré incohérent)

La toolbar de la Liste est entièrement déclinée en dark: (input lignes 211, FilterChip ligne 497, séparateurs). La Matrice utilise des classes light-only (bg-card, border-zinc-200, text-zinc-500, FilterChip sans variantes dark lignes 1187-1208). La couche de compat globals.css rattrape la plupart des fonds/bordures, mais (a) l'input Matrice a un focus:ring-[hsl(var(--gold))]/30 (ligne 408) alors que la Liste utilise un ring zinc neutre — deux styles de focus pour le même champ ; (b) les FilterChips actifs de la Matrice perdent les états dark soignés (dark:bg-white/[0.10] dark:border-white/20) que la Liste a définis, donc rendu plus plat en dark/navy.

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:402-440, app/onboarding/matrice/matrice-table.tsx:1187-1208
- **Reco** : Unifier via le composant partagé du point précédent. Si non factorisé tout de suite : aligner le focus de l'input Matrice sur celui de la Liste (focus:border-zinc-900 dark:focus:border-white/[0.30] focus:ring-4 focus:ring-zinc-900/[0.07]) et porter les variantes dark des FilterChips. Réserver le ring doré aux pastilles de statut (cohérent avec onboarding-editor).

### [medium/consistency/M] Représentation du statut divergente entre Matrice (pastille icône) et fiche (badge texte)

Dans la Matrice, un statut est une pastille ronde colorée avec icône (Check/X/Minus/carré — StatusDot, matrice-table.tsx:1103-1145), excellente pour scanner. Sur la fiche, le MÊME statut est un badge texte coloré (« Tally à faire », onboarding-editor.tsx:224-234). Deux langages visuels pour le même concept, ouvrant pourtant le MÊME popover. L'utilisateur doit ré-apprendre la lecture en passant de la matrice à la fiche.

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:1103-1145, app/clients/[slug]/onboarding/onboarding-editor.tsx:224-234
- **Reco** : Aligner : soit afficher la pastille StatusDot AUSSI sur la fiche (devant le badge texte, ou à la place avec le libellé à côté), soit afficher le libellé texte au survol/à côté de la pastille en matrice. Idéalement, exporter StatusDot dans un module partagé (lib/onboarding-ui.tsx) et l'utiliser dans les deux.

### [medium/efficiency/L] ~300 lignes de popover statut dupliquées entre Matrice et fiche

OptionRow, CreateOptionInline/CreateOptionForm, le rendu du popover groupé (titre + groupes STATUT_GROUP_ORDER + footer Réinitialiser), la logique de positionnement (POPOVER_HEIGHT/openUp/clamp), et les handlers rename/delete sont copiés quasi à l'identique entre matrice-table.tsx (622-1097, 1244-1524) et onboarding-editor.tsx (139-588). Toute évolution (nouveau champ, fix a11y) doit être faite deux fois ; le risque de dérive est déjà visible (la fiche ne clampe pas horizontalement le popover, ligne 176-180, alors que la matrice le fait).

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:622-819, app/clients/[slug]/onboarding/onboarding-editor.tsx:139-308
- **Reco** : Extraire un <StatusPopover> et un <StatusOptionRow>/<CreateStatusOption> partagés dans app/onboarding/_components/. Le hook de positionnement (calc openUp + clamp viewport) est un candidat évident à useStatusPopoverPosition().

### [medium/accessibility/S] Aucune prise en charge de prefers-reduced-motion

Aucune occurrence de prefers-reduced-motion dans tout le repo (globals.css inclus). L'anneau de progression anime stroke-dashoffset sur 500ms (onboarding-list.tsx:441), les popovers font animate-slide-up-fade, et le retour de fiche déclenche row-highlight (flash 2,4s) + scroll smooth (use-highlight-row.ts:36-39). Pour un utilisateur sensible au mouvement, ces animations s'imposent sans échappatoire (WCAG 2.3.3 / bonnes pratiques).

- **Fichiers** : app/globals.css, app/_hooks/use-highlight-row.ts:36, app/onboarding/onboarding-list.tsx:441
- **Reco** : Ajouter dans globals.css un bloc @media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.01ms!important; transition-duration:.01ms!important; scroll-behavior:auto!important } } et passer scrollIntoView à behavior:'auto' quand la media query matche dans use-highlight-row.

### [medium/consistency/S] Confirmations destructives incohérentes : window.confirm vs modale maison

L'éditeur de parcours utilise la jolie modale useConfirm (parcours-editor.tsx:104, 260-265, 309-314) pour supprimer une étape/rubrique. Mais la suppression d'un libellé de statut — dans la Matrice ET la fiche — utilise window.confirm() natif (matrice-table.tsx:1324, onboarding-editor.tsx:479), qui casse l'identité premium (boîte système OS, non thémée, non stylée). Trois écrans du même module, deux UX de confirmation.

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:1322-1334, app/clients/[slug]/onboarding/onboarding-editor.tsx:477-489
- **Reco** : Remplacer les window.confirm restants par useConfirm (variant danger), comme déjà fait dans parcours-editor. Le composant existe déjà (app/_components/confirm-modal).

### [medium/color/S] Pastille « À faire » sous-contrastée (rose-400 sur rose-50)

StatusDot A_FAIRE = X en text-rose-400 sur bg-rose-50 border-rose-200 (matrice-table.tsx:1139-1144). rose-400 (~#fb7185) sur rose-50 (~#fff1f2) est très en dessous d'un contraste lisible pour une icône porteuse de sens, surtout à 12px. C'est l'état le plus important à repérer (ce qui reste à faire) et c'est le moins lisible. À comparer avec TERMINE qui utilise emerald-700 (contraste fort).

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:1139-1144
- **Reco** : Monter l'icône À faire à text-rose-500/600 (et strokeWidth conservé), ou aligner l'intensité sur les autres dots (TERMINE=emerald-700, EN_COURS=sky-600). Vérifier aussi la légende qui réutilise StatusDot.

### [medium/performance/M] Cellules de la Matrice non mémoïsées : re-render de toute la grille à chaque clic

onPickStatus/onSetTns appellent applyPatch qui recrée localRows (nouveau tableau), puis router.refresh() recrée encore localRows via useEffect (ligne 201). MatrixCell n'est pas mémoïsé : pour 79 dossiers × 13 colonnes (~1000 cellules, chacune avec ses useEffect de positionnement de popover), un seul changement de statut re-rend toute la grille deux fois. Acceptable aujourd'hui mais c'est précisément la surface « tableau dense » où un React.memo est rentable, d'autant que chaque cellule monte des listeners.

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:548-572, app/onboarding/matrice/matrice-table.tsx:622-819
- **Reco** : Mémoïser MatrixCell (React.memo avec comparaison sur cell.id/statut_logique/statut_detail/isOpen) et stabiliser les callbacks par cellule (passer clientId+taskIdx+taskId en props plutôt que des closures recréées). Idem pour OnboardingRowComp côté Liste.

### [low/consistency/M] Libellés du même enum « origine » incohérents d'un écran à l'autre

La valeur DB « 2 - Reprise » est rendue « Reprise avec EC » par TYPE_LABEL (onboarding-list.tsx:39 / matrice-table.tsx:79), « 2 - Reprise (avec EC) » dans l'éditeur de conditions (parcours-editor.tsx:872), et « 2 - Reprise » brut dans le picker OrigineChip (matrice-table.tsx:924-939). De même « 5 - Sous-traitance » → « ST » (pill) vs « Sous-traitance » (description layout) vs « 5 - Sous-traitance » (picker). L'utilisateur voit jusqu'à 3 noms pour la même catégorie.

- **Fichiers** : app/onboarding/onboarding-list.tsx:37-44, app/onboarding/matrice/matrice-table.tsx:924-939, app/onboarding/parametrage/parcours-editor.tsx:870-876
- **Reco** : Centraliser un mapping unique origine→{labelCourt, labelLong} dans lib (ex: lib/origine.ts) et l'utiliser partout (pills, pickers, éditeur de conditions). Décider d'une convention : pill courte = « Reprise +EC », libellé long = « 2 - Reprise (avec expert-comptable) ».

### [low/efficiency/S] États vides pauvres : pas de réinitialisation des filtres

Quand un filtre ne renvoie rien, Liste et Matrice affichent un simple texte « Aucun dossier ne correspond aux filtres » (onboarding-list.tsx:305-307, matrice-table.tsx:444-446), sans bouton pour réinitialiser. Avec 4 filtres combinables (Type/TNS/Statut/recherche), tomber sur 0 résultat est facile ; l'utilisateur doit reparcourir manuellement chaque chip. À l'inverse, la zone vide « Déposer une étape ici » du paramétrage est, elle, bien travaillée.

- **Fichiers** : app/onboarding/onboarding-list.tsx:304-307, app/onboarding/matrice/matrice-table.tsx:443-446
- **Reco** : Ajouter un bouton « Réinitialiser les filtres » dans l'état vide (et idéalement un « × Effacer » global dès qu'au moins un filtre ≠ all). Remettre search/type/tns/status à leurs valeurs par défaut (et nettoyer l'URL via router.replace).

### [low/consistency/S] Commentaire de tri obsolète (mention « auto / type » jamais implémentée)

Le docblock de MatriceTable annonce « Tri : auto / progression / nom / type » (matrice-table.tsx:124) mais seuls « Progression » et « Nom » existent (SortMode = 'pct' | 'nom', boutons lignes 434-435). Documentation qui ment au prochain lecteur. Par ailleurs un tri « par type » aurait du sens pour un EC qui traite les Créations en lot.

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:116-128
- **Reco** : Corriger le commentaire. Optionnel mais utile : ajouter un tri « Type » (regroupe Création/Reprise/Interne/ST) — gain ergonomique réel pour traiter une catégorie d'un bloc.

### [low/visual/S] Légende de la Matrice reléguée tout en bas, loin des pastilles

La légende (Terminé/En cours/À faire/N/A + « tâche non créée ») est sous le tableau (matrice-table.tsx:603-613). Or les pastilles à décoder sont en haut ; sur 79 lignes il faut scroller jusqu'en bas pour comprendre le code couleur la première fois. Les icônes (carré sky, X rose, Minus zinc) ne sont pas universellement évidentes.

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:603-613
- **Reco** : Déplacer la légende au-dessus du tableau (sous la toolbar) ou la rendre sticky/compacte en barre fine. Alternative : un petit bouton « ? Légende » dans la toolbar ouvrant un popover, pour ne pas voler de hauteur en permanence.

### [low/fluidity/S] Loading skeleton non thémé et non représentatif

loading.tsx affiche un titre h-8 w-48 bg-zinc-200 + 6 barres h-8 (lignes 4-9). Il ne ressemble ni à la toolbar+anneaux de la Liste, ni au tableau de la Matrice, et le bg-zinc-200 du titre n'a pas de variante dark (sera un gris clair sur fond sombre, sauf rattrapage compat). Le saut visuel skeleton→contenu est marqué.

- **Fichiers** : app/onboarding/loading.tsx:1-12
- **Reco** : Aligner le skeleton sur la vraie structure (un bloc toolbar arrondi + N lignes avec un rond 44px à gauche pour mimer l'anneau). Utiliser bg-card/bg-zinc-100 (rattrapés en dark) plutôt que bg-zinc-200 nu, et arrondir (rounded-2xl) comme les cartes réelles.

### [low/accessibility/S] Sélecteur d'onglets : libellé d'onglet actif non marqué pour le lecteur d'écran

OnboardingTabs rend des <Link> avec un style actif visuel fort (onboarding-tabs.tsx:36-50) mais sans aria-current="page" sur l'onglet actif. Un lecteur d'écran ne distingue pas l'onglet courant des autres. Idem, ce sont des liens stylés en onglets sans rôle tablist (acceptable pour de la navigation, mais aria-current manque).

- **Fichiers** : app/onboarding/onboarding-tabs.tsx:36-50
- **Reco** : Ajouter aria-current={active ? "page" : undefined} sur le <Link>. Optionnellement, focus-visible:ring cohérent avec le reste (les onglets n'ont pas de style de focus explicite au clavier).

## Paramétrage (matrice clients × obligations, étiquettes TVA) + Admin utilisateurs  (68/100)

_Trois sous-surfaces fonctionnellement solides mais incohérentes entre elles : la matrice (grid.tsx) est dense, rapide et optimistic avec une vraie optimisation perf sur le survol de colonne, mais elle est quasi muette pour l'accessibilité (aucun focus-visible, aucun aria sur les toggles, glyphes texte au lieu de lucide) et repose entièrement sur la couche de compat dark/navy sans variantes explicites. Les trois zones utilisent trois patterns de feedback différents (modale+optimistic pour la grid, toast+optimistic pour les tags, confirm inline sans optimistic ni toast pour l'admin), ce qui casse la cohérence d'un même espace « Paramétrage ». Points durs transverses : zéro prefers-reduced-motion dans tout le CSS, bulk d'activation par colonne destructif sans confirmation, dropdown de colonne sans Escape/click-outside et clippable par l'overflow du tableau._

### [critical/accessibility/M] Toggles de la matrice : aucun focus-visible ni sémantique aria (inutilisables au clavier/lecteur d'écran)

Le contrôle le plus utilisé de toute la surface — les cases ✓ de la matrice (grid.tsx l.614-648), les boutons de sélection de ligne (l.519-530), les en-têtes de colonne cliquables (l.457-466) et toutes les pills de la barre bulk (l.687-734) — n'ont AUCUN style focus-visible : on ne voit rien quand on tabule. Pire, ce sont des <button> avec seulement un `title` : pas d'`aria-pressed`/`aria-checked` ni d'`aria-label`, donc un lecteur d'écran annonce « bouton » sans état ni libellé pour une grille de ~12 colonnes × N clients. Les <select> Régime/TVA (l.558-590) n'ont ni `aria-label` ni `<label>` associé. À comparer : la surface sœur app/obligations/[tracker]/tracker-table.tsx porte 13 attributs a11y ; ici il y en a 0 (grep aria/role = 0 match).

- **Fichiers** : app/parametrage/grid.tsx:519-530, app/parametrage/grid.tsx:558-590, app/parametrage/grid.tsx:614-648, app/parametrage/grid.tsx:687-734
- **Reco** : Sur chaque toggle de cellule : `aria-pressed={v}` + `aria-label={`${col.label} — ${r.denomination}`}`, et ajouter au className `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))]/60 focus-visible:ring-offset-1`. Ajouter `aria-label` aux <select> Régime/TVA et aux pills bulk. Réutiliser exactement le pattern focus déjà présent dans confirm-modal.tsx (`focus-visible:ring-2 focus-visible:ring-zinc-400`).

### [high/efficiency/S] Bulk « Activer/Désactiver pour tous » par colonne : écriture massive sans confirmation

Cliquer l'en-tête d'une colonne puis « Activer pour tous » (grid.tsx l.472-483 → bulkColumn l.176-185) écrit immédiatement sur TOUS les clients filtrés (potentiellement 79) sans aucune confirmation, alors que la même action via la barre de sélection (decocheAll l.323-343) et la reconduction globale (reconduireAll l.303-321) passent, elles, par une modale `confirm` variant danger. Incohérence dangereuse : la voie la plus exposée (un clic dans l'en-tête) est la moins protégée, et un mauvais filtre actif au moment du clic applique en masse sans filet. De plus la découvrabilité est faible : rien n'indique qu'un en-tête est cliquable hormis le `title`.

- **Fichiers** : app/parametrage/grid.tsx:176-185, app/parametrage/grid.tsx:457-491
- **Reco** : Router bulkColumn() via le même `confirm({ variant: 'danger', title: `Activer « ${label} » pour ${filtered.length} dossiers ?` })` que decocheAll. Ajouter un affordance visuel sur les en-têtes cliquables (chevron lucide `ChevronDown` 12px à droite du libellé + `cursor-pointer`).

### [high/accessibility/S] Aucun prefers-reduced-motion dans tout le design system

Grep `prefers-reduced-motion`/`motion-reduce` = 0 occurrence dans tout le repo. Or ces surfaces déclenchent beaucoup de mouvement : `active:scale-95` sur chaque cellule et chaque chip de filtre (grid.tsx l.380,398,619), `scale-110` sur le swatch couleur actif (manager.tsx l.276), `animate-slide-up-fade` de la barre bulk (l.681) et des dropdowns, `animate-fade-in` + `animate-slide-up-fade` des modales confirm/alert. Pour un outil pro utilisé toute la journée, c'est un manquement WCAG 2.3.3 et une gêne réelle pour les utilisateurs sensibles au mouvement.

- **Fichiers** : app/globals.css:798-863, app/parametrage/grid.tsx:619, app/parametrage/tva-tags/manager.tsx:276
- **Reco** : Ajouter un bloc global dans globals.css : `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; } }` et neutraliser explicitement les `.animate-*` + retirer les `scale` via `transform:none`. C'est un fix transverse à fort ROI.

### [high/fluidity/M] Dropdown d'en-tête de colonne : pas d'Escape, pas de click-outside, clippé par l'overflow du tableau

Le menu colonne (grid.tsx l.467-491) est en `position:absolute` à l'intérieur du conteneur `overflow-auto` du tableau (l.422-428). Sur la colonne la plus à droite (année N+1) ou en bas de scroll, il sera coupé par l'overflow. Il ne se ferme ni à l'Escape, ni au clic à l'extérieur : seul un clic sur le même en-tête ou sur « Annuler » le ferme. Cliquer une autre cellule pendant qu'il est ouvert laisse le menu ouvert, comportement non-standard et frustrant pour un utilisateur rapide.

- **Fichiers** : app/parametrage/grid.tsx:422-428, app/parametrage/grid.tsx:467-491
- **Reco** : Soit passer ce menu en portail positionné (createPortal + coords) comme confirm-modal.tsx, soit a minima ajouter un useEffect global `keydown Escape → setColMenu(null)` et un overlay/click-outside (listener `mousedown` sur document qui ferme si la cible n'est pas dans le menu). Le pattern existe déjà dans confirm-modal.tsx, le réutiliser.

### [high/consistency/M] Trois patterns de feedback différents pour une même surface « Paramétrage »

La matrice est optimistic + modale (useConfirm/useAlert), pas de toast. Les étiquettes TVA sont optimistic + toasts (toastSuccess/toastError) + useConfirm. L'admin users n'est NI optimistic NI toasté : `startTransition(() => approveUser(...))` + revalidatePath serveur (user-row.tsx l.56-110), donc latence visible et zéro feedback de succès, et la confirmation de révocation est un mini-inline « Confirmer ? » (l.83-102) au lieu de la modale danger utilisée partout ailleurs. Trois grammaires d'interaction dans le même menu de réglages : l'utilisateur ne sait jamais à quoi s'attendre.

- **Fichiers** : app/admin/users/user-row.tsx:56-110, app/parametrage/grid.tsx:229-253, app/parametrage/tva-tags/manager.tsx:48-135
- **Reco** : Unifier : (1) toasts partout via toast-helpers (au moins erreurs, succès court sur actions admin) ; (2) destructif toujours via useConfirm variant danger (remplacer le « Confirmer ? » inline de révocation par confirm()); (3) rendre l'admin optimistic (maj locale du profile + revert sur erreur) comme les deux autres. Aligner sur le pattern le plus abouti = manager.tsx.

### [medium/color/M] La matrice ne déclare aucune variante dark/navy explicite — dépendance totale à la couche de compat

Contrairement à manager.tsx (qui porte des `dark:` partout) et à confirm-modal.tsx, grid.tsx n'a quasiment aucun `dark:` : la barre d'outils, l'input de recherche (`bg-white border-zinc-300 text-sm`, l.357), les chips de filtre (`bg-white text-zinc-500 border-zinc-200`, l.383/401), les <select> (`bg-white border-zinc-300`, l.562/580), l'en-tête sticky (`bg-zinc-50 text-zinc-700`, l.430) reposent uniquement sur le remappage automatique. Ça « marche » mais c'est fragile (toute classe non couverte casse silencieusement) et illisible à maintenir. Cas concret : en dark, `bg-white` plein des <select>/<input> est remappé vers `--card`, donc un input card-sur-card (toolbar elle-même `bg-card`) avec très peu de séparation — la bordure `border-zinc-300` (→ hsl 0 0% 22%) est la seule délimitation, contraste faible.

- **Fichiers** : app/parametrage/grid.tsx:350-417, app/parametrage/grid.tsx:558-590, app/parametrage/tva-tags/manager.tsx:142-167
- **Reco** : Aligner grid.tsx sur manager.tsx : remplacer les `bg-white` de formulaire par `bg-white dark:bg-white/[0.04]` et ajouter `dark:border-white/[0.10]`, expliciter les chips de filtre en dark. Pour l'input de recherche dans une toolbar `bg-card`, utiliser `bg-zinc-50 dark:bg-white/[0.04]` pour une vraie séparation visuelle.

### [medium/color/M] Surcharge dark/navy NON tuned pour l'admin users (gradient ambre figé, badges, boutons couleur)

page.tsx admin utilise `bg-gradient-to-b from-amber-50/40 to-white` (l.48) et `bg-zinc-100` inline dans la description (l.37), tous deux figés clair : en dark/navy le `to-white` est remappé vers `--card` mais le gradient ambre→card devient bizarre, et l'en-tête de section pending est `text-amber-700` (l.44) sans variante. user-row.tsx : `bg-emerald-600 text-white` (l.57), `bg-amber-100 text-amber-800 border-amber-300` (l.36), `text-rose-700 border-rose-300` (l.107) — aucune variante dark. Le badge ADMIN (l.31) utilise bien les tokens `--gold`, donc l'incohérence est interne au même fichier. La couche compat navy n'a d'ailleurs AUCUN remap `amber-*` propre (elle hérite du dark greyscale via `.dark .navy`), donc l'ambre « En attente » apparaît brun-greyscale sur surfaces bleues en navy : thématiquement discordant.

- **Fichiers** : app/admin/users/page.tsx:42-54, app/admin/users/user-row.tsx:30-110
- **Reco** : Remplacer le gradient ambre par un fond plat tokenisé (`bg-amber-50/50 dark:bg-amber-500/[0.06]`) ou par la carte standard avec une barre d'accent. Ajouter les `dark:` manquants sur les badges/boutons admin en s'alignant sur les couleurs sémantiques déjà remappées (emerald/rose/amber existent en dark dans globals.css). Vérifier le rendu navy de l'ambre.

### [medium/visual/S] Glyphes texte (✓ ✗ ■ □ ›) au lieu de la librairie d'icônes — incohérence visuelle et alignement

La matrice rend les états avec des caractères Unicode : ✓/✗ dans le menu colonne (l.476/482), ■/□ pour la sélection de ligne (l.529), ✓ dans la cellule (l.633/645), ✕ et › un peu partout (l.365,661,707). Le rendu de ✓/✗/■ varie selon la police OS (poids, baseline, taille), d'où micro-désalignements verticaux dans une grille dense où l'alignement est primordial. À côté, manager.tsx utilise proprement lucide-react (Check, X, Plus, Trash2) et le badge admin aussi. Mélange de deux systèmes d'iconographie sur la même surface.

- **Fichiers** : app/parametrage/grid.tsx:439-444, app/parametrage/grid.tsx:529, app/parametrage/grid.tsx:633-645, app/parametrage/grid.tsx:476-482
- **Reco** : Remplacer par lucide : `Check`/`X` (h-3.5), `CheckSquare`/`Square` pour la sélection, `ChevronRight` pour les `›`. Icônes vectorielles = baseline stable et taille déterministe. Conserver le calque emerald de la cellule, juste swapper le glyphe par <Check className="h-3.5 w-3.5" />.

### [medium/consistency/S] Ombres et focus codés en dur (shadow-xl/2xl, focus:ring) au lieu des tokens thème-aware

Le design system fournit `.shadow-card`/`.shadow-card-hover`/`.shadow-pop` adossés à `--shadow-*` qui s'adaptent aux 3 thèmes (globals.css l.64-67/152-155/222-225/383-385). Or le dropdown colonne utilise `shadow-xl` brut (grid.tsx l.468) et la barre bulk `shadow-2xl` (l.682) — valeurs Tailwind calibrées pour fond clair, qui paraissent faibles/incohérentes en dark/navy où les ombres devraient être plus opaques. Idem, l'input de recherche et les selects utilisent `focus:ring-2 focus:ring-[hsl(var(--gold))]/30` (l.357) tandis que le reste du repo standardise sur `focus-visible:ring` (confirm-modal). Mélange `focus:` (déclenché aussi à la souris) vs `focus-visible:`.

- **Fichiers** : app/parametrage/grid.tsx:357, app/parametrage/grid.tsx:468, app/parametrage/grid.tsx:682
- **Reco** : Remplacer `shadow-xl`→`shadow-pop`, `shadow-2xl`→`shadow-pop` (ou créer `--shadow-2xl` token). Passer tous les `focus:ring`→`focus-visible:ring` pour ne pas afficher l'anneau au clic souris. Cohérence immédiate sur les 3 thèmes.

### [low/fluidity/S] Skeletons de chargement absents pour TVA-tags et Admin (apparition brute)

Seul app/parametrage/loading.tsx existe. Les routes /parametrage/tva-tags et /admin/users sont `force-dynamic` (requêtes Supabase transatlantiques à chaque visite) mais n'ont pas de loading.tsx : pendant le fetch, l'utilisateur voit la page précédente figée puis un saut brutal de contenu. Sur la matrice le skeleton existe mais ne reflète pas la vraie structure (pas de colonnes), donc le reflow reste visible.

- **Fichiers** : app/parametrage/loading.tsx:1-14, app/parametrage/tva-tags/page.tsx:5, app/admin/users/page.tsx:5
- **Reco** : Ajouter app/parametrage/tva-tags/loading.tsx (carte création + 4 lignes shimmer) et app/admin/users/loading.tsx (2 sections + lignes). Réutiliser le pattern `animate-pulse` de parametrage/loading.tsx. Bonus : enrichir le skeleton de la matrice avec quelques colonnes pour limiter le reflow.

### [low/visual/S] État vide de la matrice indigent vs reste de l'app

Quand aucun client ne matche, la grille affiche un simple « Aucun client. » centré sur un colSpan (grid.tsx l.668-673), sans icône, sans distinction filtre-vide vs base-vide, sans CTA « vider les filtres ». À comparer, l'état vide des étiquettes TVA est correct (« Aucune étiquette… Crée la première », manager.tsx l.171-174) et l'admin a une carte dédiée (page.tsx l.62-64). L'état vide le plus probable ici (filtres trop restrictifs) ne propose pas de réinitialiser.

- **Fichiers** : app/parametrage/grid.tsx:668-673
- **Reco** : Distinguer deux cas : si search/regimeFilter/tvaFilter actifs → « Aucun dossier ne correspond aux filtres » + bouton « Réinitialiser les filtres » (réutilise le `vider` déjà existant l.408-415) ; sinon message base-vide. Ajouter une icône lucide `SearchX` discrète et du padding vertical cohérent (py-12).

### [low/fluidity/S] Renommage d'étiquette en uncontrolled defaultValue : revert visuel incohérent

Dans manager.tsx, le label est un input `defaultValue={r.label}` (uncontrolled, l.190-202) tandis que la couleur et l'actif sont controlled via `rows`. Conséquence : si onRename échoue côté serveur, le code fait `router.refresh()` (l.81) mais l'input garde sa valeur tapée tant que le composant n'est pas remonté (defaultValue ne se resync pas avec le state) ; et le revert local sur label vide (l.72) modifie `rows` mais pas la valeur affichée du DOM input (defaultValue figé au mount). Edge-case réel : taper un label vide → l'input conserve visuellement le vide jusqu'à blur/refresh.

- **Fichiers** : app/parametrage/tva-tags/manager.tsx:67-84, app/parametrage/tva-tags/manager.tsx:190-202
- **Reco** : Passer le label en input controlled `value={r.label}` avec onChange→setRows local et onBlur→action serveur, ou ajouter `key={r.label}` sur l'input pour forcer le remount au resync. Aligne le comportement du label sur couleur/actif (tout controlled).

### [low/efficiency/S] Reconduction : double confirmation + alerte bloquante, friction pour l'action répétée

reconduireOne (grid.tsx l.284-301) et reconduire (l.265-282) enchaînent une modale confirm PUIS, après succès, une modale alert bloquante à fermer manuellement. Pour Benjamin qui peut reconduire dossier par dossier (bouton « N+1 › » sur chaque ligne, l.656-662), c'est 2 modales par dossier — très lourd en répétition. Le succès gagnerait à être un toast non bloquant (le helper toastSuccess existe déjà et est utilisé dans tva-tags) plutôt qu'une alert modale.

- **Fichiers** : app/parametrage/grid.tsx:265-301
- **Reco** : Remplacer les `await alert({...})` de succès par `toastSuccess(`${res.created} reconduite(s) vers ${year+1}`)`. Garder la modale confirm uniquement en amont. Pour reconduireOne, envisager même de retirer la confirm (action réversible et ciblée) et ne garder que le toast.

### [low/visual/M] Densité d'en-tête : libellés tronqués cryptiques sans légende (Liasse, 2777, 2561, AGO…)

Les en-têtes de colonnes affichent des `short` très elliptiques (« 2777 », « 2561 », « IS Sld », « AGO », « DES », grid.tsx COLS l.45-55) avec le libellé complet seulement dans un `title` au survol. Sur écran tactile / au clavier le `title` est inaccessible. Pour un nouvel arrivant au cabinet la grille est illisible sans dictionnaire. La largeur min des colonnes (`min-w-[64px]`) est par ailleurs très serrée, augmentant le risque de wrap sur les libellés un peu longs.

- **Fichiers** : app/parametrage/grid.tsx:45-55, app/parametrage/grid.tsx:451-466
- **Reco** : Ajouter une ligne de légende repliable au-dessus du tableau (chips « 2777 = Flat-tax · 2561 = IFU … ») ou un popover d'aide via icône `HelpCircle` lucide dans la toolbar. À défaut, exposer le libellé complet en `aria-label` sur le <button> d'en-tête (couvre clavier + lecteur d'écran).

## Composants UI partagés (app/_components : ui.tsx, picker, form-modal, confirm-modal, status-filter-chip, bulk-action-bar, mobile-filter-select)  (62/100)

_Le socle de composants partagés est globalement bon : Picker, FormModal, useConfirm/useAlert, StatusFilterChip et BulkActionBar sont réellement réutilisés (5 à 9 surfaces chacun) et bien documentés. MAIS le fichier de primitives « premium » ui.tsx (Button, Card, Badge, StatusBadge, EmptyState, Toolbar, Kbd) est 100% mort — zéro import dans toute l'app — pendant que ces mêmes éléments sont réimplémentés à la main partout (Button primaire dupliqué dans ~12 fichiers, un Card/Badge concurrent à API divergente dans clients/[slug]/_components.tsx). À cela s'ajoutent des trous d'accessibilité systémiques : aucun prefers-reduced-motion, ARIA listbox du Picker cassée, pas d'aria-pressed sur les chips de filtre, et un accent doré totalement absent de la couche partagée._

### [critical/consistency/L] ui.tsx (Button, Card, Badge, StatusBadge, EmptyState, Toolbar, Kbd) est 100% mort

Aucun fichier de l'app n'importe app/_components/ui.tsx (vérifié : 0 import de '_components/ui', 0 usage de StatusBadge/CardHeader/CardBody/LinkButton/Toolbar hors du fichier lui-même). C'est pourtant le fichier décrit comme les primitives premium du CRM. Conséquence : la promesse 'design system' est fictive au niveau composants — chaque écran réinvente ses boutons/cards/badges, donc la cohérence visuelle ne tient que par copier-coller de classes, pas par un composant source de vérité. Le commentaire d'en-tête ('Primitives UI premium du CRM v2') ment sur l'état réel.

- **Fichiers** : app/_components/ui.tsx, app/missions/caa/caa-table.tsx, app/missions/ir/ir-table.tsx, app/missions/exceptionnelles/mission-exc-table.tsx
- **Reco** : Décider : soit adopter ui.tsx partout (remplacer les <button class='bg-zinc-900 dark:bg-zinc-50…'> par <Button variant='primary'>, les cartes par Card/CardHeader/CardBody, etc.), soit le supprimer. Recommandation forte : l'adopter. Commencer par câbler <Button>/<EmptyState> dans 2-3 surfaces pilotes (mission tables, fiche client), puis migrer le reste. Sans ça, toute évolution de style devra être répétée à la main dans 12+ fichiers.

### [high/consistency/M] Card/Badge dédoublés avec deux API incompatibles

Il existe DEUX Card et DEUX Badge. Dans ui.tsx : <Card> composé via <CardHeader>/<CardBody> (rounded-lg, pas d'ombre, header optionnel manuel) et <Badge tone='emerald'>{children}</Badge>. Dans app/clients/[slug]/_components.tsx : <Card title subtitle action bodyClassName> (rounded-2xl + shadow-card + header intégré) et <Badge text='…' color='…' /> (rounded-full, signature totalement différente : prop `text` au lieu de children, prop `color` brute au lieu d'un `tone` sémantique). Les deux Card n'ont même pas le même rayon (lg vs 2xl) ni la même ombre. Un dev qui importe 'Card' obtient un composant différent selon le chemin — piège majeur et incohérence visuelle (fiches client en rounded-2xl ombrées vs reste de l'app en rounded-lg plat).

- **Fichiers** : app/_components/ui.tsx, app/clients/[slug]/_components.tsx, app/clients/[slug]/page.tsx, app/clients/[slug]/layout.tsx
- **Reco** : Fusionner sur une seule Card. Garder l'API à props (title/subtitle/action) de clients/[slug]/_components.tsx qui est la plus ergonomique, la déplacer dans ui.tsx, et faire pointer la version locale dessus (re-export) le temps de la migration. Unifier le rayon : choisir rounded-xl partout (compromis entre lg et 2xl) et appliquer shadow-card systématiquement. Pour Badge, garder l'API `tone` sémantique de ui.tsx (gère le dark) et supprimer la variante `text/color`.

### [high/accessibility/S] Aucun support prefers-reduced-motion

globals.css ne contient aucune media query prefers-reduced-motion (vérifié : 0 occurrence). Or toutes les surfaces partagées s'appuient sur des animations à l'entrée : animate-slide-up-fade (Picker popover, FormModal, ConfirmModal, AlertModal, BulkActionBar et ses 2 popovers), animate-fade-in (backdrops), achievement-pop, row-highlight-flash, scale-in. Pour un utilisateur sensible au mouvement (vestibulaire) ou simplement réglé sur 'réduire les animations' (réglage OS courant), rien n'est neutralisé → non-conformité WCAG 2.3.3 et inconfort. Sur des tables denses où chaque ouverture de Picker rejoue un slide, c'est aussi de l'agitation visuelle.

- **Fichiers** : app/globals.css
- **Reco** : Ajouter en fin de globals.css un bloc @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:0.01ms !important; animation-iteration-count:1 !important; transition-duration:0.01ms !important; scroll-behavior:auto !important; } } et, plus finement, neutraliser explicitement .animate-slide-up-fade/.animate-fade-in/.animate-scale-in/.achievement-pop en `animation:none`. Coût quasi nul, gain d'accessibilité immédiat sur TOUTES les surfaces partagées d'un coup.

### [high/accessibility/M] ARIA du Picker cassée : role=listbox sans options ni activedescendant

Le Picker annonce role='listbox' sur le conteneur popover et aria-haspopup='listbox' + aria-expanded sur le trigger, mais (1) les items sont des <button> sans role='option' ni aria-selected, (2) aucun aria-controls reliant trigger et listbox, (3) aucun aria-activedescendant suivant activeIdx alors que la nav clavier ↑/↓ est gérée. Pour un lecteur d'écran, c'est un listbox vide contenant des boutons : l'option active au clavier n'est jamais vocalisée, l'état sélectionné non plus. Le trigger n'a pas non plus de libellé accessible quand il n'affiche qu'un chip court (ex. 'N/A') — pas d'aria-label décrivant la colonne. C'est le composant interactif le plus utilisé de l'app (3 par ligne × 79 clients), donc l'impact a11y est large.

- **Fichiers** : app/_components/picker.tsx:243, app/_components/picker.tsx:262, app/_components/picker.tsx:291
- **Reco** : Sur chaque item : role='option', aria-selected={isSelected}, id={`picker-opt-${flatIdx}`}. Sur le conteneur listbox : id stable + tabIndex={-1}. Sur le trigger : aria-controls={listboxId} et aria-activedescendant={open ? `picker-opt-${activeIdx}` : undefined}, plus un aria-label optionnel (nouveau prop `label`) pour nommer la colonne ('Statut', 'Facturation'). Conserver le pattern actuel (focus reste sur le trigger, nav via activedescendant) qui est le bon modèle combobox/listbox.

### [medium/color/M] Le doré MOON est totalement absent de la couche partagée

L'identité affichée est 'accent doré MOON (--gold)'. Or aucun composant partagé n'utilise --gold : le Button primary est noir/blanc (zinc-900/zinc-50), le bouton submit de FormModal idem, le bouton OK d'AlertModal idem, le chip actif de StatusFilterChip est gris (bg-zinc-100), le focus-ring est zinc-400 partout. Le doré ne vit que dans des éléments décoratifs hors de cette surface (SectionTitle, scrollbar, row-highlight, halos de fond). Résultat : les composants partagés — donc 90% de ce que l'utilisateur touche — sont d'un gris/noir générique 'Linear par défaut', sans la signature premium dorée revendiquée.

- **Fichiers** : app/_components/ui.tsx:30, app/_components/status-filter-chip.tsx:52, app/_components/form-modal.tsx:145, app/globals.css:380
- **Reco** : Introduire le doré sur les points d'accent à fort signal : (a) focus-ring de marque via le token existant .ring-gold / hsl(var(--ring)) au lieu de ring-zinc-400 ; (b) état actif de StatusFilterChip avec une fine bordure/anneau gold (border-[hsl(var(--gold))]/40) plutôt que bordure zinc ; (c) éventuellement un variant Button 'brand' doré pour le CTA principal de chaque page (création client, enregistrer). Rester parcimonieux pour garder le calme premium, mais le doré doit apparaître au moins sur le focus et l'état actif.

### [medium/accessibility/S] Focus-ring hardcodé en ring-zinc-400, non tokenisé et off-brand en dark/navy

Le ring de focus est figé en focus-visible:ring-zinc-400 (+ ring-offset-2) dans ui.tsx, FormModal, ConfirmModal, AlertModal, soit 23 occurrences au total dans le repo. Problèmes : (1) pas de token → impossible de changer le ring globalement ; (2) en thème navy (fond bleu marine très sombre), un anneau zinc-400 (gris moyen) a un contraste médiocre et paraît terne ; (3) ring-offset-2 utilise la couleur de fond par défaut, qui sur surfaces colorées (header rose de ConfirmModal danger) crée un liseré incohérent ; (4) zinc-400 sur fond clair frôle la limite de contraste pour un indicateur de focus (WCAG 2.4.11/1.4.11 recommandent un contraste fort de l'indicateur).

- **Fichiers** : app/_components/ui.tsx:26, app/_components/form-modal.tsx, app/_components/confirm-modal.tsx:222, app/globals.css
- **Reco** : Définir --ring par thème dans globals.css (déjà la convention HSL du projet) et remplacer ring-zinc-400 par ring-[hsl(var(--ring))] (ou le doré, cf. finding précédent). Renforcer la teinte en dark/navy (ring plus clair/chaud). Vérifier ring-offset-color sur les headers colorés (passer en ring-offset-[hsl(var(--surface-elevated))] dans les modales).

### [medium/consistency/M] Contrat de couleurs des statuts dispersé : classes light-only en JS + override dark en CSS

STATUT_COLORS/CUSTOM_STATUS_COLORS (lib/utils.ts) ne définissent QUE des classes claires (bg-amber-100 text-amber-800 border-amber-200), sans variante dark:. Ces classes sont injectées telles quelles dans Picker (current?.color + chip o.color), BulkActionBar (chips inline et dropdown). Le rendu dark/navy ne fonctionne QUE parce que globals.css remappe manuellement chaque classe (.dark .bg-amber-100 {…}, .dark .text-amber-800 {…}, etc.). C'est extrêmement fragile : ajouter une nouvelle couleur de statut (ex. bg-orange-100) marchera en clair et sera invisible/cassée en dark tant qu'on n'aura pas pensé à ajouter l'override CSS correspondant à la main. Le contrat de couleur vit dans deux fichiers déconnectés.

- **Fichiers** : lib/utils.ts:28, lib/utils.ts:47, app/globals.css:581, app/_components/picker.tsx:310, app/_components/bulk-action-bar.tsx:258
- **Reco** : Centraliser : faire que statutColorClass renvoie des classes incluant déjà les variantes dark (sur le modèle de BADGE_TONE dans ui.tsx : 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'). À terme, retirer du compat layer globals.css les overrides .dark .bg-amber-100/.text-amber-800… qui ne servent plus qu'à rattraper ces classes-là. Un seul endroit (lib/utils.ts) décrit alors la couleur d'un statut dans les 3 thèmes.

### [medium/accessibility/S] StatusFilterChip : état actif visuel-only, sans aria-pressed

StatusFilterChip est un <button> dont l'état 'active' n'est porté que par des classes (bg-zinc-100/border). Aucun aria-pressed ni aria-current. Pour un lecteur d'écran, les 4-8 chips de filtre (Tous / À faire / En cours / Terminé) sont des boutons indistincts — impossible de savoir lequel est appliqué. C'est pourtant un composant bien réutilisé (7 surfaces : IR, CAA, Créations, Missions exc, Pilotage, trackers, TVA tags), donc le défaut se répète partout. Le dot d'accent (span coloré) n'a pas non plus de texte alternatif, mais le label adjacent compense.

- **Fichiers** : app/_components/status-filter-chip.tsx:46
- **Reco** : Ajouter aria-pressed={active} sur le <button> (le pattern toggle-button est ici plus juste que aria-current). Optionnel : title={`${label}${count!==undefined?` (${count})`:''}`} pour exposer le compteur au survol/AT. Modification d'une ligne, propagée aux 7 surfaces.

### [medium/performance/M] Pickers non mémoïsés : ~237 instances re-render + ré-alloc d'options à chaque update

Dans les tables mission, on rend 3 <Picker> par ligne (statut, facturation, LDM) → ~237 instances simultanées pour 79 clients. Le Picker n'est pas mémoïsé (aucun React.memo/useCallback dans picker.tsx) et reçoit à chaque cellule des props recréées : options={statusOptions.map(...)} (nouveau tableau à chaque render parent) et onChange/onReset en arrow inline. Donc à chaque mise à jour optimiste d'un statut, le parent re-render et React réconcilie les 237 Pickers en recréant 237 tableaux d'options. De plus, l'effet keydown du Picker liste onChange + flatOptions.length en deps : il se ré-abonne à document chaque fois que le popover ouvert re-render. À l'échelle actuelle (79 clients) c'est tolérable, mais ça scale mal et ajoute du jank perceptible sur les éditions rapides.

- **Fichiers** : app/_components/picker.tsx:230, app/missions/caa/caa-table.tsx:820
- **Reco** : (1) Envelopper Picker dans React.memo. (2) Côté tables, mémoïser les listes d'options stables avec useMemo (statusOptions.map(...)) hors du render de ligne, et stabiliser les handlers (passer onChange={onSetStatut} avec une signature (id, value) plutôt qu'une arrow par cellule, ou useCallback). (3) Dans picker.tsx, isoler la closure Enter via un ref (activeRef/onChangeRef) pour retirer onChange/flatOptions.length des deps de l'effet keydown et ne l'attacher qu'à l'ouverture.

### [low/efficiency/M] BulkActionBar : API double (label/columnLabel) et code popover dupliqué deux fois

Le composant traîne une prop `label` @deprecated en parallèle de columnLabel (colLabel calculé mais le rendu du compteur n'utilise QUE columnLabel — donc un caller qui passe encore `label` voit son libellé de colonne ignoré dans l'affichage : incohérence silencieuse, ligne 134 vs 147). Par ailleurs la mécanique popover (position fixed ancrée bottom, click-outside, Esc, createPortal, animate-slide-up-fade) est écrite DEUX fois quasi à l'identique pour le menu Appliquer et le tooltip d'aide (~50 lignes dupliquées). Enfin, la barre est en z-40 alors que les modales/Picker sont en z-[1000]/1500 : si une modale s'ouvre en sélection active, l'empilement est OK, mais la barre passe sous d'éventuels overlays z-50.

- **Fichiers** : app/_components/bulk-action-bar.tsx:36, app/_components/bulk-action-bar.tsx:134, app/_components/bulk-action-bar.tsx:216, app/_components/bulk-action-bar.tsx:293
- **Reco** : (1) Supprimer la prop `label` (ou faire colLabel piloter réellement l'affichage du compteur). (2) Extraire un petit composant interne <AnchoredPopover anchorRef bottom> partagé par le menu et l'aide. (3) Le tooltip d'aide affiche des raccourcis ⌘ (Mac) en dur — ajouter une détection plateforme pour montrer Ctrl sur Windows (l'utilisateur est sous Windows 11).

### [low/consistency/M] Trois implémentations divergentes de modale/backdrop au lieu d'un primitif partagé

FormModal, ConfirmModal et AlertModal réécrivent chacun le même squelette : createPortal(document.body) + backdrop bg-zinc-900/50 backdrop-blur-md + conteneur rounded-2xl shadow-modal + Esc handler + useFocusTrap + animate-slide-up-fade. Le markup est cohérent (bonne nouvelle) mais copié-collé : un changement de design de modale (ex. passer le backdrop à blur-sm, changer le rayon, ajouter un aria-describedby) doit être répété 3 fois et peut diverger. On note déjà de petites divergences : FormModal pose aria-label={title} sur le wrapper et n'a PAS d'aria-labelledby reliant le <h3>, alors que ConfirmModal utilise aria-labelledby='confirm-modal-title' (id statique, donc collision si deux confirmations coexistaient). AlertModal n'a ni aria-label ni aria-labelledby.

- **Fichiers** : app/_components/form-modal.tsx:94, app/_components/confirm-modal.tsx:131, app/_components/confirm-modal.tsx:311, lib/focus-trap.ts
- **Reco** : Extraire un <ModalShell> (portal + backdrop + focus-trap + Esc + anim + tailles) consommé par les trois. Y centraliser l'a11y : générer un id via useId() pour aria-labelledby (remplacer l'id statique 'confirm-modal-title'), câbler aria-describedby vers la description. FormModal/ConfirmModal/AlertModal ne fournissent alors que header/body/footer.

### [low/visual/S] MobileFilterSelect : select natif sans chevron custom ni états error/disabled

MobileFilterSelect rend un <select> natif brut. Fonctionnellement c'est le bon choix sur mobile (picker OS natif, accessible). Mais visuellement la flèche native du navigateur casse l'esthétique premium dense du reste (chips, pickers custom), et le composant n'expose ni disabled, ni état d'erreur, ni placeholder/option vide stylée. Le focus-ring est ici focus:ring (pas focus-visible), donc il s'affiche aussi au clic souris — léger bruit visuel incohérent avec le focus-visible utilisé partout ailleurs.

- **Fichiers** : app/_components/mobile-filter-select.tsx:41
- **Reco** : Garder le select natif (bon pour mobile) mais : ajouter appearance-none + un <ChevronDown> positionné en absolute (lucide, déjà utilisé) pour homogénéiser, exposer une prop disabled, et remplacer focus: par focus-visible: pour aligner sur la convention de focus du design system.

### [low/fluidity/S] Confirm/Alert : focus posé via ref callback el?.focus() à chaque render

Dans ConfirmModal et AlertModal, le bouton de confirmation/OK reçoit le focus via une ref callback inline ref={(el)=>el?.focus()} (confirm-modal.tsx:228 et :336). Cette callback se ré-exécute à chaque render du composant (et React l'appelle avec null puis l'élément à chaque commit où l'identité de la callback change — ici elle change à chaque render car arrow inline), ce qui peut re-voler le focus pendant que l'utilisateur tape (notamment AlertModal qui réagit aussi à Enter). C'est fragile et non idiomatique face au useFocusTrap déjà en place. Le focus initial devrait être posé une fois au mount.

- **Fichiers** : app/_components/confirm-modal.tsx:228, app/_components/confirm-modal.tsx:336
- **Reco** : Remplacer par un useRef + useEffect(()=>{ btnRef.current?.focus() }, []) au mount (comme FormModal le fait déjà pour le 1er input). Supprimer les ref callbacks inline. Cohérent avec le pattern de focus initial des autres modales.

### [low/fluidity/M] Picker : hauteur de popover estimée 'à la louche' → flip openUp parfois faux

Le positionnement du popover calcule POPOVER_HEIGHT par estimation (options.length*28 + headers*24 + reset*32 + 16). Si l'estimation diffère du réel (labels longs qui wrappent, densité différente), la décision openUp peut être erronée → popover qui déborde sous le viewport ou flippe inutilement. De plus la position est figée au moment de l'ouverture : pas de recalcul sur scroll/resize, donc si l'utilisateur scrolle la page avec un Picker ouvert, le popover en position:fixed reste collé à l'ancienne position pendant que le bouton défile (décrochage visuel). Mineur car la fermeture se fait au clic outside, mais sur table scrollable c'est atteignable.

- **Fichiers** : app/_components/picker.tsx:111, app/_components/picker.tsx:137
- **Reco** : Mesurer la hauteur réelle après mount (popRef.current.offsetHeight dans un useLayoutEffect) pour décider openUp, ou passer à une lib de positionnement (@floating-ui/react) qui gère flip/shift/auto-update — surtout que le projet a déjà ce besoin sur Picker ET BulkActionBar. A minima, fermer le Picker sur scroll de l'ancêtre scrollable (addEventListener scroll capture).

## Chatbot Jarvis (assistant flottant)  (62/100)

_Surface visuellement très soignée et cohérente avec l'identité MOON (disque sombre, étoile dorée, drawer dense, raccourcis vocaux bien pensés). Mais le maillon faible est l'expérience temps réel : aucun streaming ni feedback d'avancement pendant une boucle qui peut enchaîner jusqu'à 8 appels Opus + tool-calls, le tout matérialisé par trois points qui rebondissent. S'ajoutent un système de toasts maison qui double et chevauche sonner (déjà standard partout ailleurs), une accessibilité incomplète (pas de prefers-reduced-motion global, pas d'aria-live, pas de role=dialog/focus trap), et des détails d'ergonomie (textarea figée à 1 ligne, CTA doré peu lisible). Rien de cassé fonctionnellement, mais loin du niveau « définitif » sur fluidité perçue et a11y._

### [critical/fluidity/L] Zéro streaming : Opus répond en bloc derrière 3 points qui rebondissent

route.ts exécute toute la boucle tool_use (jusqu'à MAX_TURNS=8 appels Claude Opus + exécutions Supabase) puis renvoie un unique Response.json (lignes 366-459). Côté client, send() fait un fetch().then(res.json()) bloquant (chat-bubble.tsx L255-262) et n'affiche qu'un loader de 3 dots (L670-684). Avec Opus 4.7 (MODEL L116) et plusieurs tours d'outils, la latence ressentie est de plusieurs secondes SANS aucun signal de progression ni token-by-token. Pour un usage vocal (la réponse est lue à voix haute), ce silence casse complètement l'illusion de 'collègue qui répond'. C'est le défaut #1 de la surface.

- **Fichiers** : app/api/chat/route.ts:366-459, app/_components/chat-bubble.tsx:255-313, app/_components/chat-bubble.tsx:670-684
- **Reco** : Passer l'endpoint en streaming SSE : client.messages.stream() côté serveur, renvoyer un ReadableStream, et côté client lire via getReader() en mettant à jour le dernier message assistant token par token (state 'streaming'). Conserver le rendu progressif dans la bulle (whitespace-pre-wrap gère déjà l'incrémental). La TTS ne se déclenche qu'à la fin (utterance complète). Garder le mode bloquant en fallback si stream indisponible.

### [high/fluidity/M] Aucun feedback sur l'avancement des tool-calls (résolution client, écriture)

Pendant la boucle, Jarvis peut enchaîner resolveClient -> list_status_options -> set_obligation_status, chacun touchant Supabase, mais l'UI ne montre rien d'autre que les dots génériques. L'utilisateur ne sait pas si Jarvis 'cherche le client', 'liste les libellés' ou 'écrit le statut'. Or les noms d'outils sont parlants et l'app a une convention métier claire. C'est une occasion manquée de latence perçue ET de confiance (surtout quand l'IA fait une écriture sans confirmation, cf. system prompt L149-152).

- **Fichiers** : app/api/chat/route.ts:407-451, app/_components/chat-bubble.tsx:670-684
- **Reco** : En streaming, émettre un event par tool_use ({name, input}) et afficher une micro-ligne éphémère sous les dots : 'Recherche de Soulez Larivière…', 'Mise à jour du statut…'. Map nom d'outil -> verbe FR (set_obligation_status -> 'Mise à jour du statut', list_obligations_due -> 'Lecture des échéances'). Style identique à la pill 'Écoute…' déjà existante (L695-699).

### [high/consistency/M] Deux systèmes de toasts concurrents qui se chevauchent (maison vs sonner)

Toute l'app notifie via sonner (Toaster position='top-right' dans layout.tsx L65-77, helpers lib/toast-helpers.ts). Jarvis réinvente un stack de toasts maison en fixed top-16 right-4 z-[950] (chat-bubble.tsx L486-522) avec sa propre logique d'expiration (setInterval 500ms L316-323). Résultat : deux familles de toasts au style différent au même coin de l'écran, qui se superposent visuellement si une action sonner se déclenche en parallèle (ex. un save ailleurs). Incohérence visuelle + double code à maintenir.

- **Fichiers** : app/_components/chat-bubble.tsx:486-522, app/_components/chat-bubble.tsx:316-331, app/layout.tsx:65-77, lib/toast-helpers.ts
- **Reco** : Supprimer le stack maison et router les JarvisChange via sonner avec un toast custom : toast.custom(t => <JarvisChangeToast .../>, { duration: 12000 }) embarquant l'action onClick -> router.push(href) et le bouton Voir. On garde le design (check vert, deep-link doré) mais une seule pile, un seul z-index, un seul moteur d'expiration. Supprime aussi le useEffect setInterval L316-323.

### [high/accessibility/S] Aucun support prefers-reduced-motion dans tout le design system

globals.css n'a aucune règle @media (prefers-reduced-motion) (vérifié sur tout le fichier). Or la surface empile des animations infinies : 3 dots animate-bounce (chat-bubble.tsx L679-681), Sparkles animate-pulse du loader (L674), dot rouge animate-pulse en écoute (L697), bouton mic animate-pulse pendant l'enregistrement (L727), halo qui scale au hover du FAB (L535-545), slide-up-fade sur chaque message. Pour un utilisateur sensible au mouvement, c'est non conforme WCAG 2.3.3.

- **Fichiers** : app/globals.css:798-863, app/_components/chat-bubble.tsx:670-700, app/_components/chat-bubble.tsx:727
- **Reco** : Ajouter un bloc global dans globals.css : @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; } }. Puis remplacer le loader 3-dots par un état statique (texte 'Jarvis réfléchit…') quand reduced-motion est actif, et neutraliser les animate-pulse.

### [high/accessibility/M] Drawer sans role=dialog, sans focus-trap ni restitution du focus

Le panneau (chat-bubble.tsx L550-757) est un simple <div> : pas de role='dialog'/aria-modal, pas de focus-trap (Tab sort du drawer vers la page derrière), et à la fermeture (Esc ou bouton X) le focus n'est pas rendu au FAB déclencheur — il part au <body>. Un utilisateur clavier/lecteur d'écran se perd. Sur mobile le drawer est plein écran (h-[100dvh]) donc le focus errant derrière est encore plus problématique.

- **Fichiers** : app/_components/chat-bubble.tsx:550-610, app/_components/chat-bubble.tsx:446-458, app/_components/confirm-modal.tsx:133
- **Reco** : Sur le div drawer : role='dialog' aria-modal='true' aria-label='Assistant Jarvis'. Trapper Tab/Shift+Tab dans le panneau (premier/dernier focusable). Mémoriser document.activeElement à l'ouverture et le re-focus à la fermeture (ou .focus() sur le FAB). Réutiliser le pattern déjà présent dans form-modal.tsx / confirm-modal.tsx pour rester cohérent.

### [medium/accessibility/S] Réponses, chargement et erreurs non annoncés (pas d'aria-live)

La zone conversation (chat-bubble.tsx L613-691) n'a aucun aria-live. Un lecteur d'écran n'annonce ni l'arrivée de la réponse de Jarvis, ni l'état de chargement, ni le bloc d'erreur rouge (L686-690). Pour un assistant conversationnel c'est central — d'autant que la cible utilisateur peut être en mains-libres/vocal.

- **Fichiers** : app/_components/chat-bubble.tsx:613-691, app/_components/chat-bubble.tsx:686-690
- **Reco** : Envelopper la liste des messages dans un conteneur aria-live='polite' aria-relevant='additions' et donner aux nouveaux messages assistant un role='status'. Le bloc erreur passe en role='alert' (annonce immédiate). La pill 'Écoute…' (L695-699) gagne aria-live='assertive'.

### [medium/accessibility/S] Bouton imbriqué dans un bouton sur le toast (HTML invalide) + croix mal accessible

Le toast est un <button> (chat-bubble.tsx L488) qui contient un <span role='button' tabIndex={0}> pour fermer (L508-519). Bouton dans bouton = HTML invalide et hydration/comportement clavier imprévisible ; de plus le span 'Fermer' n'a pas de handler clavier (onKeyDown), donc Entrée/Espace ne le ferment pas alors qu'il est focusable. Le span déclenche aussi e.stopPropagation mais reste un enfant interactif d'un contrôle interactif.

- **Fichiers** : app/_components/chat-bubble.tsx:488-520
- **Reco** : Restructurer : conteneur <div> (non interactif) ; à l'intérieur un <button> 'Voir' qui navigue et un <button aria-label='Fermer'> séparé, côte à côte. Si on migre vers sonner.custom (cf. finding toasts), le problème disparaît car closeButton est géré nativement.

### [medium/efficiency/S] Textarea figée à une ligne : dictée/saisie longue illisible

Le champ a rows={1}, minHeight 40px et max-h-32 mais AUCUNE logique d'auto-grow (pas d'ajustement scrollHeight au onChange — vérifié, seul scrollRef utilise scrollHeight L213). Quand Benjamin dicte un paragraphe ou tape une phrase multi-lignes, le texte reste coincé dans une seule ligne visible avec scroll interne : il ne voit pas ce qu'il a dit/écrit avant d'envoyer. Pour une surface vocale où la transcription doit être relue avant envoi, c'est handicapant.

- **Fichiers** : app/_components/chat-bubble.tsx:702-717, app/_components/chat-bubble.tsx:644-660
- **Reco** : Ajouter l'auto-grow : dans onChange, e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,128)+'px'. Idem après injection d'une suggestion (L648) et après transcription vocale (setDraft L355). Alternative moderne si support OK : CSS field-sizing: content sur la textarea + min/max-height.

### [medium/performance/S] Suggestions re-fetchées (et moteur d'échéances relancé) à chaque ouverture

À chaque ouverture du chat sans conversation en cours, useEffect refait GET /api/chat/suggestions (chat-bubble.tsx L227-242), qui appelle getEcheancesPourMois (suggestions/route.ts L96) — calcul d'échéances non trivial sur ~80 dossiers. Aucune mise en cache : ouvrir/fermer/rouvrir relance tout. force-dynamic empêche aussi tout cache HTTP. Gaspillage pour une donnée qui change peu dans la journée.

- **Fichiers** : app/_components/chat-bubble.tsx:227-242, app/api/chat/suggestions/route.ts:85-133
- **Reco** : Mémoriser les suggestions dans un ref/state avec TTL (ex. 5-10 min) côté client, ou stocker { suggestions, ts } en sessionStorage et ne refetch que si périmé. Côté route, envisager un Cache-Control: private, max-age=300 (en gardant l'auth) plutôt que force-dynamic pur.

### [medium/visual/M] Toast stack chevauche le header du drawer (surtout mobile plein écran)

Le stack de toasts est en fixed top-16 right-4 (chat-bubble.tsx L486) tandis que le drawer ouvert sur mobile occupe tout l'écran (w-full h-[100dvh], L551) avec son header doré en haut. Un toast de confirmation s'affiche donc PAR-DESSUS le header du chat, pile dans la zone de lecture. Sur desktop le drawer est à droite (md:w-[400px]) et les toasts max-w-360px tombent aussi dans/au-bord du panneau. La confirmation d'action et la conversation se télescopent.

- **Fichiers** : app/_components/chat-bubble.tsx:486-522, app/_components/chat-bubble.tsx:550-551
- **Reco** : Quand le drawer est ouvert, soit afficher la confirmation INLINE dans le fil (petite carte 'Statut mis à jour · Voir' après le message assistant), soit décaler le stack (ex. desktop: right-[420px] quand open ; mobile: ancrer en bas au-dessus de l'input). L'inline est préférable : la confirmation vit là où l'action a été demandée.

### [low/fluidity/S] Le bouton Envoyer ne montre pas l'état de chargement

Pendant loading, le textarea et les boutons sont disabled (chat-bubble.tsx L713/721/736) mais l'icône Send reste un avion statique grisé — aucun spinner. Le seul indicateur d'activité est dans le fil (les dots). Le point d'action (le bouton qu'on vient de presser) ne réagit pas, ce qui donne une sensation de clic 'mort'.

- **Fichiers** : app/_components/chat-bubble.tsx:733-746
- **Reco** : Pendant loading, remplacer <Send/> par un petit spinner (Loader2 lucide + animate-spin, neutralisé sous prefers-reduced-motion) et garder le fond doré actif plutôt que l'état grisé 'cursor-not-allowed'. Micro-feedback immédiat sur l'élément cliqué.

### [low/color/S] CTA doré 'Voir' à 10px : contraste insuffisant sur fond clair

Dans le toast, la ligne 'Voir ->' utilise text-[10px] text-[hsl(var(--gold))] sur fond blanc (chat-bubble.tsx L504-506). Le doré MOON (~#a88962) sur blanc tourne autour de 3:1, en-dessous du 4.5:1 WCAG AA pour du texte de cette taille — et 10px aggrave la lisibilité. Même remarque pour le sous-titre '⌃⇧V parler' zinc-400 sur header sombre (limite) et les kbd hints à text-[9px]/[10px] (L749-753) qui frôlent le seuil de lisibilité.

- **Fichiers** : app/_components/chat-bubble.tsx:504-506, app/_components/chat-bubble.tsx:748-753
- **Reco** : Pour le CTA 'Voir' : monter à text-[11px] font-semibold et utiliser un doré plus foncé en light (créer un token --gold-strong ou text-[hsl(var(--gold))] + assombrir, ex. brightness via une variable dédiée). Vérifier les kbd hints à >=11px. Viser 4.5:1 minimum.

### [low/performance/S] Persistance localStorage écrite à chaque frappe pendant la dictée

Le useEffect de persistance sérialise messages.slice(-20) en JSON et écrit dans localStorage à chaque changement de messages (chat-bubble.tsx L191-200). Couplé au streaming (finding #1) où le dernier message muterait à chaque token, cela provoquerait un JSON.stringify + write synchrone par token. Même hors streaming, c'est un write synchrone bloquant le main thread à chaque tour.

- **Fichiers** : app/_components/chat-bubble.tsx:191-200
- **Reco** : Débouncer l'écriture (ex. 300-500ms) ou n'écrire qu'au settle d'un message complet (pas pendant le streaming). Un simple useEffect avec setTimeout + clear suffit. À traiter en même temps que la migration streaming pour éviter une régression de perf.

### [low/efficiency/S] Erreurs non actionnables : pas de retry, message brut technique

En cas d'échec, on affiche le message d'erreur brut dans une carte rouge (chat-bubble.tsx L686-690), y compris des chaînes techniques type 'Erreur Claude API : ...' (route.ts L390) ou 'Boucle tool_use trop longue (8 tours).' (L456). L'utilisateur n'a aucun bouton 'Réessayer' : il doit re-saisir/re-dicter sa demande. Le message user a pourtant déjà été ajouté au fil (L249), donc le dernier prompt est connu.

- **Fichiers** : app/_components/chat-bubble.tsx:686-690, app/api/chat/route.ts:386-391, app/api/chat/route.ts:454-458
- **Reco** : Sous la carte d'erreur, ajouter un bouton 'Réessayer' qui relance send() avec le dernier message user (garder une ref lastUserText). Mapper les erreurs serveur vers des messages humains ('Jarvis a mis trop de temps, réessaie' au lieu de 'Boucle tool_use trop longue'). Style cohérent avec toastError.

## Performance back / data (transversal)  (74/100)

_La couche data est globalement saine et nettement au-dessus de la moyenne : selects scopes (quasi zero `select("*")`), React `cache()` pour dedup layout+page, parallelisation `Promise.all` sur la plupart des pages lourdes (Finance, IR, Dashboard, Onboarding, tracker), et un schema reellement bien indexe (composites `(client_id, annee)`, `(annee, type, statut)`, trigram sur denomination, index facturation et audit). Les vrais offenders sont concentres : la page Facturation enchaine 6 requetes Supabase en serie (zero parallelisation), et la sidebar refait un fan-out de 9 requetes via server action a CHAQUE navigation. S'ajoutent une chaine serie dans le layout client et quelques micro-serialisations. Rien de catastrophique a l'echelle ~80 clients, mais ces points coutent de la latence percue gratuite et grandiront mal._

### [high/performance/S] Facturation : 6 requetes Supabase en serie (await sequentiel)

La page /facturation charge CAA, IR, AGO, Bilan, Missions exc. et Creations avec un `await` sequentiel sur chacune (lignes 44, 90, 154, 208, 268, 315). Aucune n'est parallelisee alors qu'elles sont totalement independantes (sources distinctes, agregees ensuite cote JS). C'est le pire offender du repo : la latence de la page = somme des 6 round-trips Postgres au lieu du max. Avec les fallbacks defensifs (re-await en cas d'erreur de colonne), ca peut monter a 8-9 allers-retours. Toutes les autres pages lourdes (Finance, IR, Dashboard) utilisent deja Promise.all - c'est une incoherence locale, pas un choix d'archi.

- **Fichiers** : app/facturation/page.tsx:44, app/facturation/page.tsx:90, app/facturation/page.tsx:154, app/facturation/page.tsx:208, app/facturation/page.tsx:268, app/facturation/page.tsx:315
- **Reco** : Envelopper les 6 requetes dans un seul `const [caaRes, irRes, agoRes, bilanRes, missionRes, creationRes] = await Promise.all([...])` (meme pattern que app/finance/page.tsx:116 ou app/missions/ir/page.tsx:62). Garder les fallbacks mais les appliquer apres le Promise.all sur les `.error` individuels. Gain : latence divisee par ~6 sur cette page.

### [high/performance/M] Sidebar : fan-out de 9 requetes a CHAQUE navigation

`loadSidebarBadges` (server action lancant 9 requetes Supabase paralleles) est appele dans un `useEffect` dont la dependance est `[pathname]` (sidebar.tsx:289). Donc a chaque clic de navigation interne, on declenche : 1 round-trip server-action + 9 requetes DB (dont 2 fetch complets de lignes ir_obligations pour dedup JS). C'est la sidebar persistante qui re-interroge tout le portefeuille a chaque page vue, meme quand l'utilisateur ne touche pas a la facturation/creations. S'y ajoute un `console.log("[sidebar-badges]", b)` en prod a chaque nav (ligne 296). A ~80 clients c'est absorbable, mais c'est du trafic gratuit qui scale lineairement avec l'usage et pollue la console.

- **Fichiers** : app/_components/sidebar.tsx:289, app/_components/sidebar.tsx:296, app/_components/sidebar-badges-loader.ts:43
- **Reco** : Decoupler le refetch de la navigation. Option simple : ne re-fetcher que sur retour de visibilite + un event custom emis par les actions qui changent un statut a-faire (ex. `window.dispatchEvent(new Event('moon:badges-stale'))` dans updateObligationStatus/setEcheanceStatus), et ecouter cet event dans la sidebar a la place de `[pathname]`. Option intermediaire : debounce/throttle a 1 fetch / 30s max. Retirer le console.log de prod (le passer derriere `process.env.NODE_ENV !== 'production'`).

### [medium/performance/M] Layout client : loadClient -> loadContactsLink -> allClientsList en serie

Le layout de la fiche client enchaine 3 round-trips serie : `await loadClient(slug)` (l.99), puis `await loadContactsLink(client.id)` (l.101), puis le fetch de TOUTE la table clients pour la nav prev/next (l.125-130). loadContactsLink ne depend que de client.id, et allClientsList ne depend d'aucun des deux - les deux pourraient partir en parallele apres loadClient. De plus `allClientsList` retire id/slug/denomination de tous les clients a CHAQUE ouverture de fiche, juste pour calculer prev/next. La page enfant (page.tsx) re-appelle ensuite loadClient + loadContactsLink (dedupes par cache() donc OK) puis lance encore un fetch groupes serie (l.54-55).

- **Fichiers** : app/clients/[slug]/layout.tsx:99, app/clients/[slug]/layout.tsx:101, app/clients/[slug]/layout.tsx:124, app/clients/[slug]/page.tsx:54
- **Reco** : Dans le layout : `const client = await loadClient(slug); const [contactsLink, { data: allClientsList }] = await Promise.all([loadContactsLink(client.id), supabase.from('clients').select(...)]);`. Mieux : memoiser la liste prev/next dans un `cache()` dedie (loadClientNavList) puisqu'elle ne change pas entre layout et sous-routes. Pour le groupes du page.tsx, l'inclure dans CLIENT_SELECT (deja le cas via `groupes(nom)`) plutot qu'une requete separee.

### [medium/performance/M] updateObligationStatus : 3 round-trips serie pour un seul changement de chip

La mutation la plus frequente du CRM (changer le statut d'une cellule du tracker) fait en serie : SELECT type/client_id (l.54), puis SELECT statut_logique depuis status_options (l.62), puis UPDATE (l.72). 3 allers-retours Postgres sequentiels par clic. Le statut_logique pourrait etre resolu sans round-trip : status_options est deja entierement charge cote tracker (passe en prop `statusOptions`) - le client connait deja le statut_logique du libelle choisi. On refait cote serveur un lookup que le client a deja. L'optimistic UI masque la latence visuellement mais la mutation reste lente (et le 3x round-trip se voit sur connexion mobile/lente).

- **Fichiers** : app/obligations/actions.ts:54, app/obligations/actions.ts:62, app/obligations/actions.ts:72
- **Reco** : Passer `statut_logique` en argument de l'action depuis le tracker (qui le connait via statusOptions) pour eliminer les 2 SELECT : un seul UPDATE suffit alors. Garder un fallback serveur uniquement si l'argument est absent. Idem pour bulkUpdateObligationStatus. Gain : 3 round-trips -> 1 sur l'action la plus chaude.

### [medium/efficiency/S] select("*") injecte dans le contexte LLM (get_client_details)

L'outil `get_client_details` du chatbot fait `.select("*, groupes(nom)")` (tools.ts:265 et 272) et renvoie la row brute telle quelle au modele. clients a ~50+ colonnes (tous les forfaits, dates, champs CRM, generated columns mrr/arr, timestamps...). On envoie donc l'integralite du schema client a Claude a chaque consultation vocale, ce qui (1) coute des tokens de sortie tool + tokens d'entree au tour suivant, (2) augmente la latence de la boucle tool_use, (3) expose des champs inutiles a la generation. C'est le seul `select("*")` du repo - partout ailleurs c'est scope.

- **Fichiers** : app/api/chat/tools.ts:265, app/api/chat/tools.ts:272
- **Reco** : Remplacer par un select explicite des champs utiles a une reponse vocale (denomination, pipeline_statut, mrr, arr, forfaits principaux, jour/mois_cloture, regime, origine, groupes(nom)). Reduit le payload de moitie et accelere les tours de boucle. Pattern deja applique dans list_clients (tools.ts:230).

### [medium/performance/M] revalidateFinanceViews invalide 2 routes lourdes a chaque mutation de statut

Quasi toutes les actions de statut/facturation appellent `revalidateFinanceViews()` qui fait `revalidatePath('/facturation')` + `revalidatePath('/finance')` (revalidate-finance.ts:13-16). Ces deux pages sont les plus couteuses a reconstruire (Finance = 6 requetes + agregation 24 mois ; Facturation = 6 requetes serie cf. finding #1). Les invalider a chaque changement de chip TVA - meme un statut qui n'impacte ni le CA ni les factures (ex. passage A_FAIRE -> EN_COURS) - force un rebuild complet au prochain acces. Sur un tracker ou l'utilisateur passe 30 chips a la suite, c'est 30 invalidations de 2 pages lourdes. Le commentaire reconnait le compromis mais l'invalidation est trop large (tout changement de statut, pas seulement les transitions facturables).

- **Fichiers** : lib/revalidate-finance.ts:13, app/obligations/actions.ts:78, app/obligations/actions.ts:159
- **Reco** : Ne revalider /finance et /facturation que sur les transitions reellement facturables : passage vers/depuis TERMINE, ou changement de etat_facturation. Pour les transitions A_FAIRE<->EN_COURS, skip. Alternative : remplacer revalidatePath par revalidateTag avec un tag 'finance-data' et ne le purger que dans setObligationFacturation + les transitions terminales. Reduit drastiquement les rebuilds inutiles pendant la saisie de masse.

### [low/performance/S] Historique client : 2 requetes serie + 500 lignes sans pagination

La page historique fait SELECT client par slug (l.23), puis - en serie - SELECT des 500 dernieres entrees d'audit (l.30-35). Les deux ne peuvent pas etre parallelises facilement (la 2e a besoin de client.id), mais on pourrait passer par un `cache()` partage avec loadClient (deja appele par le layout parent pour la meme fiche - ici on refait une 3e requete clients distincte avec un select different). Surtout : `.limit(500)` est envoye d'un bloc au client sans pagination ni virtualisation cote HistoriqueList. Pour un client tres actif l'audit log grossit vite (chaque edit de champ = 1 ligne) et 500 lignes de DOM d'un coup est un cout client gratuit.

- **Fichiers** : app/clients/[slug]/historique/page.tsx:23, app/clients/[slug]/historique/page.tsx:30
- **Reco** : Reutiliser loadClient(slug) (cache, deja charge par le layout) au lieu d'un nouveau SELECT clients ad hoc. Reduire le limit initial a ~50-100 avec un bouton 'charger plus' ou une virtualisation legere si la liste depasse ~100 entrees. L'index idx_audit_client_changed couvre deja le tri, donc cote DB c'est OK.

### [low/consistency/S] Modele Jarvis : route.ts hardcode encore Opus malgre le commit 'passe en Sonnet 4.7'

Le dernier commit (53af533) annonce 'Chatbot Jarvis : passe en Claude Sonnet 4.7' mais app/api/chat/route.ts:116 declare toujours `const MODEL = "claude-opus-4-7-20251022"`. C'est le seul endroit ou le modele est defini (la route suggestions n'en a pas). Soit le switch n'a pas ete applique au bon endroit, soit le commit ne decrit qu'un label UI. Impact data/perf : Opus est plus lent et bien plus cher qu'un Sonnet pour une boucle tool_use a 8 tours - sur un assistant vocal ou la latence compte, c'est a la fois un cout et une lenteur evitables. A confirmer cote intention produit.

- **Fichiers** : app/api/chat/route.ts:116
- **Reco** : Verifier l'intention : si le passage a Sonnet 4.7 est voulu pour Jarvis, mettre a jour la constante MODEL vers l'ID Sonnet 4.7 correspondant. Sinon, corriger le message de commit. Profiter de la passe pour externaliser le MODEL en variable d'env (ANTHROPIC_MODEL) pour pouvoir basculer sans redeploy.

### [low/performance/L] tracker-table.tsx : 113 KB de composant client monolithique

app/obligations/[tracker]/tracker-table.tsx fait 112 890 octets en un seul fichier 'use client'. C'est de loin le plus gros composant client du repo (la fiche client est eclatee, le chat-bubble fait 33 KB). Tout ce JS est telecharge et parse au premier acces a n'importe quel tracker production, y compris la logique de picker, bulk-actions, comments, filtres chips TVA, focus/scroll - meme pour un tracker simple sans TVA tags. Le rendu d'une grille pivot dense + memo/useTransition est correct cote re-renders, mais le poids de bundle initial est lourd pour la page la plus consultee en production.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:1
- **Reco** : Decouper en sous-modules lazy : extraire le picker de statut, le panneau commentaires (deja un fichier separe comments-panel.tsx - verifier qu'il est bien lazy), la bulk-action-bar et les chips TVA en imports dynamiques (`next/dynamic`, ssr:false) charges a l'interaction. Viser <40 KB pour le chemin critique du rendu de grille. Auditer aussi avec `@next/bundle-analyzer` pour confirmer ce qui domine.

### [low/consistency/S] Dashboard : Promise.all enveloppant une unique requete (faux signal)

dashboard-data.ts:119-127 utilise `const [{ data: clients }] = await Promise.all([ sb.from('clients').select(...) ])` pour une SEULE requete. C'est inoffensif perf, mais c'est un faux signal : la structure suggere une parallelisation qui n'existe pas, et invite a penser que le dashboard tire plusieurs sources alors qu'il agrege tout depuis la seule table clients en memoire. A l'inverse, des donnees comme la production/echeances ne sont PAS chargees ici (probablement voulu). C'est un detail de lisibilite/maintenabilite du code data, pas un probleme de runtime.

- **Fichiers** : app/_dashboard/dashboard-data.ts:119
- **Reco** : Simplifier en `const { data: clients } = await sb.from('clients').select(...)`. Si une 2e source (ex. obligations pour un KPI production) doit etre ajoutee plus tard, reintroduire Promise.all a ce moment. Garde le code honnete sur ce qu'il fait reellement.

### [low/efficiency/M] Fallbacks defensifs 'migration pas appliquee' qui doublent les requetes en prod stable

Plusieurs pages (facturation, IR, tracker) encapsulent leurs requetes dans des try/fallback du type 'si la colonne etat_facturation/forfait n'existe pas, re-await sans la colonne' (ex. facturation l.52-60, ir/page.tsx:82-96, tracker l.111-119). Ces migrations (0050, 0053) sont appliquees depuis longtemps en prod. Le cout : sur un schema a jour le chemin nominal passe, donc 0 surcout - MAIS le code porte une dette : un double appel potentiel et une complexite de lecture, et en cas d'erreur reelle (RLS, timeout) on declenche silencieusement un fallback qui masque le vrai probleme et double la latence sur cette requete.

- **Fichiers** : app/facturation/page.tsx:52, app/missions/ir/page.tsx:82, app/obligations/[tracker]/page.tsx:111
- **Reco** : Maintenant que les migrations 0050/0053 sont stabilisees, retirer les fallbacks de colonne et laisser l'erreur remonter (ou la logger). Reduit la complexite, evite le double-await en cas d'erreur transitoire mal categorisee, et clarifie l'intention. A faire apres confirmation que toutes les envs (dev/preview/prod) sont a jour.

### [low/performance/M] Middleware : getUser + lookup profiles a chaque requete (round-trip auth systematique)

Le middleware (lib/supabase/middleware.ts:33-59) appelle `supabase.auth.getUser()` (round-trip reseau de validation du token cote Supabase, pas une simple lecture de cookie) PUIS un SELECT profiles(approved, is_admin) sur quasi toutes les requetes non-publiques. Cela ajoute 2 allers-retours a chaque navigation et chaque server action (y compris le fan-out badges du finding #2, qui re-paie getUser via sa propre session). Pour un app a utilisateur unique tres actif, c'est de la latence systematique sur le chemin critique de chaque page. getUser() est necessaire pour la securite (valide le JWT), mais le SELECT profiles pourrait etre mis en cache court.

- **Fichiers** : lib/supabase/middleware.ts:33, lib/supabase/middleware.ts:55
- **Reco** : Garder getUser() (securite). Mettre en cache le statut profiles (approved/is_admin) dans un cookie signe court (ex. 60s) ou un JWT claim custom pour eviter le SELECT a chaque requete. Alternative : restreindre le `matcher` du middleware pour exclure les assets et certaines routes deja couvertes. Mesurer d'abord avec les Server-Timing avant d'optimiser - peut etre acceptable au scale actuel.

## Performance front / rendu (transversal)  (72/100)

_Le socle perf est sérieux : kanban et SpaceDropZone mémoïsés avec comparateurs fins, grille paramétrage qui contourne React pour le hover (querySelectorAll), charts dashboard lazy-loadés, optimizePackageImports configuré, dnd-kit désactivé sur mobile. Mais plusieurs surfaces lourdes dérapent : le mémo de StatusCell (tracker, ~960 cellules) est cassé par des props recréées à chaque render, /finance embarque Recharts en bundle initial (pas lazy comme le dashboard), les listes d'échéances ne sont pas mémoïsées, et tout repose sur router.refresh() qui re-sérialise le RSC complet à chaque mutation. Quelques scories : console.log en prod, dépendance morte @tanstack/react-table, URLSearchParams reconstruits par ligne._

### [high/performance/M] StatusCell : memo cassé → ~960 cellules re-rendent à chaque interaction

StatusCell est wrappé en memo() avec comparaison shallow par défaut, mais deux props sont recréées à CHAQUE render du parent TrackerTable : (1) rowLabel est un template string rebuildé inline `${r.denomination} · ${cols.find(...)?.label}` (ligne 1784), (2) options={statusOptions[c.type] ?? []} crée un nouveau tableau [] quand le type n'a pas d'options (ligne 1782). Résultat : sur un tracker à ~80 clients × ~12 colonnes (~960 cellules), ouvrir une cellule, sélectionner une cellule (drag Excel), ou taper dans la recherche re-rend TOUTES les cellules. Les callbacks sont pourtant bien mémoïsés (useCallback ll.1056-1141), donc le memo est à un cheveu de fonctionner. C'est le principal coupable de latence ressentie lors de la sélection multi-cellules et de la frappe.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:1782, app/obligations/[tracker]/tracker-table.tsx:1784, app/obligations/[tracker]/tracker-table.tsx:2109
- **Reco** : 1) Mémoïser les options vides : `const EMPTY: StatusOption[] = []` au niveau module, puis `options={statusOptions[c.type] ?? EMPTY}`. 2) Déplacer la construction de rowLabel DANS StatusCell (passer `denomination` + `colLabel` comme primitives stables, ou calculer le label à l'ouverture du popover seulement). 3) Pré-calculer un `Map<colKey, col>` (useMemo) pour remplacer les cols.find() et passer `colLabel` résolu. Ajouter un comparateur memo explicite sur (cell.statut_logique, cell.statut_detail, cell.etat_facturation, isOpen, isSelected, urgency, commentCount) pour blinder.

### [high/performance/S] /finance embarque Recharts dans le bundle initial (pas de lazy)

Le dashboard d'accueil charge bien ses charts en lazy via dashboard-charts-loader.tsx (next/dynamic, ssr:false, skeleton). Mais FinanceDashboard (1202 lignes, ~10 graphes Recharts : ComposedChart, BarChart, PieChart, AreaChart) est importé statiquement dans finance/page.tsx (`import FinanceDashboard`) et marqué "use client". Recharts (~50-90 kB gzip + d3) part donc dans le bundle JS initial de /finance, alors que la page est force-dynamic et n'affiche rien tant que le RSC n'est pas arrivé. Incohérence directe avec le pattern déjà retenu pour le dashboard.

- **Fichiers** : app/finance/page.tsx:4, app/finance/finance-dashboard.tsx:1, app/_dashboard/dashboard-charts-loader.tsx:11
- **Reco** : Reproduire le pattern dashboard : créer un finance-dashboard-loader.tsx "use client" qui fait `const FinanceDashboard = dynamic(() => import('./finance-dashboard'), { ssr:false, loading: () => <FinanceSkeleton/> })` et l'utiliser depuis page.tsx. Réutiliser le squelette de finance/loading.tsx. Gain : -1 gros chunk sur le TTI de /finance.

### [medium/performance/S] cols.find() appelé 2-3× par cellule dans la boucle de rendu (O(rows×cols²))

Dans le map des cellules du tracker, `cols.find((col) => col.key === c.colKey)` est rappelé pour calculer l'urgence (l.1715), pour décider du kind facturation (l.1769) et pour le rowLabel (l.1784). Soit 3 balayages linéaires de `cols` par cellule. Sur 80×12 cellules = ~2880 find() sur un tableau de ~12 éléments à chaque render complet. C'est du gaspillage CPU pur qui s'additionne au point précédent (chaque render devient plus cher).

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:1715, app/obligations/[tracker]/tracker-table.tsx:1769, app/obligations/[tracker]/tracker-table.tsx:1784
- **Reco** : Construire une seule fois `const colByKey = useMemo(() => new Map(cols.map(c => [c.key, c])), [cols])` et remplacer tous les `cols.find(col => col.key === c.colKey)` par `colByKey.get(c.colKey)`. Idéalement, pré-attacher `kind`/`label`/`periode` à chaque cell côté serveur (page.tsx fait déjà le pivot) pour supprimer la résolution côté client.

### [medium/performance/M] Listes d'échéances non mémoïsées : Section + EcheanceRow re-instanciés en masse

Dans echeances-list.tsx, Section et EcheanceRow sont de simples fonctions appelées dans des .map (ll.262, 274). Chaque EcheanceRow monte son propre useRouter + useTransition + useState×3 + useEffect + un useMemo pickerOptions (ll.307-366). Avec potentiellement plusieurs dizaines d'échéances (du mois + en retard), toute mise à jour d'état du parent (ex. localCommentCounts via handleCountChange, l.106) re-rend l'intégralité des lignes alors qu'une seule a changé. Même structure non mémoïsée que matrice mais sans la protection d'un memo de cellule.

- **Fichiers** : app/obligations/echeances-list.tsx:274, app/obligations/echeances-list.tsx:296, app/obligations/echeances-list.tsx:203
- **Reco** : Wrapper EcheanceRow en React.memo (clé déjà stable : `clientId|type|annee|periode`). Remonter le strict nécessaire : passer commentCount (number) plutôt que tout le dict commentCounts pour que le memo isole les lignes inchangées. Idem Section en memo. pickerOptions : extraire GROUP_LABEL hors du composant (recréé à chaque render, l.354).

### [medium/performance/L] router.refresh() systématique re-sérialise tout le RSC à chaque mutation

139 occurrences de router.refresh() sur 28 fichiers. Le pattern (optimistic local + refresh serveur) est sain, mais sur les grosses surfaces (tracker ~80 clients × colonnes, paramétrage, matrice) chaque clic sur une pastille déclenche un refresh qui re-fetch et re-sérialise l'INTÉGRALITÉ du payload RSC de la page (toutes les lignes), pas juste la cellule modifiée. En édition rapide (un expert qui enchaîne 20 statuts), c'est 20 re-fetch complets. echeances-list ajoute en plus un router.refresh() au mount (l.77) qui double le premier fetch.

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:257, app/obligations/echeances-list.tsx:77, app/parametrage/grid.tsx:181
- **Reco** : Débouncer/coalescer les refresh quand plusieurs mutations s'enchaînent (ex. ne refresh qu'après 400ms d'inactivité, ou seulement à la fermeture du popover). Pour les bulk (déjà groupés en 1 action), c'est OK. Évaluer si l'optimistic local suffit sans refresh pour les toggles purs (le state local est déjà la vérité) et ne refresh que sur les cas qui changent la structure (création de ligne, reconduction).

### [medium/performance/L] matrice-table : MatrixCell/OptionRow non mémoïsés sur une grille large

MatriceTable rend une grille clients × ~13 étapes. Chaque cellule = MatrixCell (fonction non mémoïsée) avec son propre useRef×2, useState(pos), useEffect×2 (l.622+). À chaque ouverture de picker (openPicker change dans le parent) ou patch optimiste (setLocalRows), toutes les MatrixCell re-rendent et re-attachent leurs listeners. Sur ~50 dossiers × 13 = 650 cellules, c'est lourd. Contrairement au tracker il n'y a même pas de tentative de memo ici. Le `grouped` IIFE (l.708) recrée aussi 4 tableaux par cellule à chaque render.

- **Fichiers** : app/onboarding/matrice/matrice-table.tsx:549, app/onboarding/matrice/matrice-table.tsx:622, app/onboarding/matrice/matrice-table.tsx:708
- **Reco** : Wrapper MatrixCell en React.memo (props : cell, options stables via EMPTY constant, isOpen, et callbacks déjà fournis par le parent — les passer via useCallback). Idéalement, le popover (createPortal + position + effets) ne devrait monter que pour la cellule ouverte : extraire un <CellPopover> rendu une seule fois au niveau parent piloté par openPicker, et garder MatrixCell réduit à un simple bouton + StatusDot (ultra léger). Gros gain de fluidité d'ouverture.

### [low/performance/S] clients-table : URLSearchParams reconstruits par ligne dans le rendu (×2)

Dans le map des lignes desktop (ll.408-418) ET dans le map mobile (ll.508-516), un `new URLSearchParams()` + 4-5 .set() + .toString() est exécuté pour chaque ligne à chaque render, pour construire le href `?nav-q=...&from=...`. Sur 79 clients c'est 79×2 constructions d'objets URL à chaque frappe dans la recherche (le composant entier re-rend car search est un state du parent et les lignes ne sont pas mémoïsées). Coût modéré mais évitable, et la table n'a aucun row memo.

- **Fichiers** : app/clients/clients-table.tsx:408, app/clients/clients-table.tsx:508
- **Reco** : Extraire le préfixe commun des params (nav-q/nav-bucket/nav-forme/nav-activite/from) en un seul useMemo `baseNavParams` dépendant de [search,bucket,formeFilter,activiteFilter,fromUrl], puis par ligne ne faire que `?${baseNavParams}` (le slug est déjà dans le path). Idéalement extraire un <ClientRow> mémoïsé. Gain de fluidité sur la frappe de recherche.

### [low/performance/S] console.log laissé en production dans la sidebar (à chaque changement de route)

sidebar.tsx l.295 : `console.log("[sidebar-badges]", b)` s'exécute à chaque navigation (l'effet badges dépend de [pathname], ll.289-306). Plus un console.error l.301. Au-delà du bruit en console prod, logger un objet à chaque route conserve une référence (empêche le GC du payload badges) et pollue le profiling. Le code reconnaît lui-même que c'est du debug (eslint-disable no-console).

- **Fichiers** : app/_components/sidebar.tsx:295, app/_components/sidebar.tsx:301
- **Reco** : Supprimer le console.log de succès. Garder le console.error éventuellement mais le router via un helper silencieux en prod (ex. `if (process.env.NODE_ENV !== 'production')`). Trivial.

### [low/efficiency/S] Dépendance morte @tanstack/react-table dans le bundle

@tanstack/react-table ^8.20.5 est déclaré en dependencies mais n'est importé NULLE PART dans le code (seules occurrences : package.json et package-lock.json). Toutes les tables sont faites main (<table> + map). C'est du poids inutile dans node_modules et un risque de confusion (un dev pourrait croire qu'il faut l'utiliser). canvas-confetti est lui bien utilisé (use-ldm-celebration).

- **Fichiers** : package.json
- **Reco** : `npm remove @tanstack/react-table`. Vérifier au passage qu'aucun import dynamique ne le référence (grep confirme : aucun). Allège l'install et clarifie l'intention (tables maison).

### [low/performance/S] Frontière "use client" haute : AppShell rend Sidebar+CommandPalette+ChatBubble sur toutes les pages

layout.tsx (RSC) monte AppShell ("use client") qui englobe tout le contenu et rend en permanence Sidebar (843 lignes, dnd-kit + supabase client), CommandPalette (fetch clients) et ChatBubble (800 lignes, Web Speech, localStorage, fetch suggestions). ChatBubble et CommandPalette sont surtout pilotés par des raccourcis/ouvertures rares mais leur JS est chargé et leurs effets (listeners keydown globaux) actifs sur chaque page. Sidebar fait par ailleurs un getUser()+select profiles au mount sur chaque navigation hard. Ce n'est pas critique (composants persistants entre routes) mais ChatBubble pourrait être différé.

- **Fichiers** : app/_components/app-shell.tsx:1, app/_components/chat-bubble.tsx:1, app/layout.tsx:62
- **Reco** : Charger ChatBubble en next/dynamic({ ssr:false }) — il n'a aucun contenu visible au load (juste un bouton flottant) et son gros JS (Speech/TTS) n'est utile qu'à l'ouverture. Idem envisageable pour CommandPalette (rendu null tant que fermé, mais son JS pourrait être lazy). Garder Sidebar en eager (visible immédiatement).

### [low/performance/M] Recharts ResponsiveContainer en sparkline de fond × 4 cartes hero (finance)

HeroCard (finance) rend un AreaChart Recharts complet dans un ResponsiveContainer juste pour une sparkline décorative en background, ×4 cartes (ll.336-356). ResponsiveContainer attache un ResizeObserver par instance et Recharts monte tout son pipeline SVG pour ~12 points. Pour 4 sparklines purement décoratives (opacity-40), c'est disproportionné — un <svg><path> calculé à la main serait 100× plus léger et éviterait 4 ResizeObservers.

- **Fichiers** : app/finance/finance-dashboard.tsx:336
- **Reco** : Remplacer les sparklines décoratives par un mini composant SVG maison : calculer un `d` polyline à partir des points (normalisés sur min/max) une fois en useMemo, rendre `<svg viewBox=...><path d=.../></svg>`. Supprime 4 instances Recharts du chemin critique de la page la plus chargée en graphes.

### [low/performance/S] Toaster expiration : setInterval 500ms tournant tant qu'un toast Jarvis existe

chat-bubble.tsx ll.316-323 : dès qu'un toast est présent, un setInterval(500ms) filtre les toasts expirés. Pendant les 12s (TOAST_DURATION_MS) d'affichage, c'est 24 réveils du thread + autant de setToasts (re-render) qui re-mappent la stack même si rien n'expire. Mineur, mais un timer périodique qui force un setState toutes les 500ms pour de l'expiration est un anti-pattern (réveille le main thread inutilement, gêne le profiling).

- **Fichiers** : app/_components/chat-bubble.tsx:316
- **Reco** : Remplacer le polling par un setTimeout par toast calé sur son expiresAt (au moment du push), qui retire CE toast à échéance. Pas de re-render périodique, suppression au pile-poil de la durée. Alternative : réutiliser sonner (déjà dans le projet) au lieu d'une stack de toasts maison.

## Accessibilité + animations (transversal)  (68/100)

_La base a11y est étonnamment soignée pour un outil mono-utilisateur : focus-trap maison sur les 3 modales portail, restauration du focus, skip-link, lang="fr", aria-labels présents sur la quasi-totalité des boutons-icônes, nav clavier complète sur le Picker, la palette et la grille Excel. Deux trous structurels tirent la note vers le bas : (1) prefers-reduced-motion est totalement absent du codebase (confettis 2,5s, achievement-pop avec overshoot, compteur MRR animé, row-highlight, des dizaines d'animate-*) — risque vestibulaire et non-conformité WCAG 2.3.3 ; (2) plusieurs incohérences de contraste de focus (anneau gris ~1.8:1 en clair) et des patterns ARIA incomplets (listbox/combobox sans role="option"/aria-selected, span[role=button] imbriqué dans un button). La grille obligations expose ~1500 arrêts de tabulation sans roving tabindex._

### [high/accessibility/M] prefers-reduced-motion totalement absent du design system

Aucune occurrence de prefers-reduced-motion dans tout le repo (0 match). Or l'app multiplie les animations à fort déplacement/parallaxe : confettis canvas-confetti pendant 2,5s plein écran (use-ldm-celebration.tsx l.57-99), achievement-pop avec overshoot scale+translateY de 40px (globals.css l.826-845), compteur MRR qui roule sur 1,8s en requestAnimationFrame (achievement-card.tsx l.43-58 + barre transition-[width] duration-[1800ms] l.247), row-highlight-flash 2,4s (globals.css l.853-863), et la transition globale button/a/select 140ms (l.911-915). WCAG 2.3.3 (AAA) et surtout le risque vestibulaire/migraine : un mouvement aussi marqué que l'achievement-pop + confettis répétés à chaque signature LDM peut déclencher des nausées chez les utilisateurs sensibles. C'est aussi le seul vrai manquement a11y 'dur' d'une surface par ailleurs propre.

- **Fichiers** : app/globals.css:798-863, app/globals.css:911-915, app/clients/[slug]/use-ldm-celebration.tsx:57-99, app/clients/[slug]/achievement-card.tsx:43-58, app/clients/[slug]/achievement-card.tsx:247
- **Reco** : Ajouter en fin de globals.css un bloc @media (prefers-reduced-motion: reduce) qui : (1) neutralise les keyframes lourds — `.animate-achievement-pop, .animate-slide-up-fade, .animate-slide-in-right, .row-highlight { animation: none !important; }` en gardant un simple `.animate-fade-in { animation: fade-in 0.01ms; }` ; (2) coupe les transform/transition globaux — `*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }`. Côté JS, gater fireConfetti() et le rolling-counter : `const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;` — si reduce, sauter le requestAnimationFrame (poser directement mrrAfter) et ne lancer qu'un burst confetti unique ou rien. C'est ~30 lignes pour fermer le seul vrai trou WCAG.

### [high/accessibility/S] Anneau de focus global trop peu contrasté en thème clair

La règle :focus-visible globale utilise outline: 2px solid hsl(240 5% 65%) (globals.css l.901-905), soit un gris ~#9b9ca3. Sur le fond page --background #f6f6f8 et surtout sur les cards blanches (#fff), le ratio de contraste de l'indicateur tombe à ~1.7–1.9:1, sous le minimum WCAG 2.2 SC 1.4.11 (3:1 pour les composants UI / indicateurs de focus). Pour un outil 100% clavier-friendly (palette, grille Excel, pickers), un focus aussi pâle est difficile à repérer, surtout sur les éléments neutres. Le focus dark est OK (hsl 240 5% 75% sur fond ~10%). Incohérence supplémentaire : certains composants utilisent un ring gold bien plus visible (cellules tracker l.2273, inputs editable l.45), d'autres ring-zinc-400 (ui.tsx BUTTON_BASE l.26) — trois conventions de focus cohabitent.

- **Fichiers** : app/globals.css:901-909, app/_components/ui.tsx:26, app/clients/[slug]/editable.tsx:45, app/obligations/[tracker]/tracker-table.tsx:2273
- **Reco** : Relever le contraste du focus clair : `:focus-visible { outline: 2px solid hsl(var(--foreground) / 0.55); outline-offset: 2px; }` (encre navy translucide = ~4:1 sur blanc) OU passer l'anneau global sur le gold (`hsl(var(--gold))`, ~#a88962 = 3.4:1 sur blanc) pour unifier avec les cellules/inputs qui l'utilisent déjà. Choisir UNE convention (recommandé : gold pour l'état actif significatif + foreground/0.55 pour le focus neutre) et l'appliquer aussi au ring Tailwind de ui.tsx (`focus-visible:ring-zinc-400` → `focus-visible:ring-[hsl(var(--gold))]`).

### [high/accessibility/M] Grille obligations : ~1500 arrêts de Tab, pas de roving tabindex

Chaque cellule de statut est un <button tabIndex={0} data-cell-button> (tracker-table.tsx l.2263-2264) ET chaque cellule expose en plus un bouton commentaires (l.2290+). Sur le tracker TVA mensuelle (~79 lignes × colonnes) ou un tracker annuel, on atteint facilement 800–1500 boutons tous dans l'ordre de tabulation naturel. La navigation flèches Excel-like est implémentée (onTableKeyDown l.833-952) et excellente, mais Tab ne suit PAS cette logique : il parcourt le DOM cellule par cellule. Conséquence : un utilisateur clavier qui veut sortir de la grille (vers la barre d'action / un autre champ) doit tabuler des centaines de fois, et il n'y a aucun point d'entrée unique. C'est le pattern grid ARIA classique qui demande un roving tabindex (une seule cellule à 0, le reste à -1).

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:2255-2279, app/obligations/[tracker]/tracker-table.tsx:2289-2300, app/obligations/[tracker]/tracker-table.tsx:833-952
- **Reco** : Passer au roving tabindex : la cellule active (anchor courant, ou (0,0) par défaut) a tabIndex={0}, toutes les autres tabIndex={-1}. Mettre à jour le tabIndex au fil de la nav flèches (déjà centralisée dans onTableKeyDown). Ajouter role="grid" sur le conteneur scrollable (tableRef), role="row" sur les <tr>, role="gridcell" sur les <td>. Ainsi Tab = entrer/sortir de la grille en 1 coup, flèches = naviguer dedans. Le bouton commentaires de chaque cellule devrait être tabIndex={-1} (atteignable via la cellule ou un raccourci), sinon il double le nombre d'arrêts.

### [medium/accessibility/M] Kanban pipeline : aucun accès clavier au drag-and-drop (desktop)

Le DndContext du kanban n'enregistre que PointerSensor et TouchSensor (kanban.tsx l.139-142). Il n'y a PAS de KeyboardSensor — contrairement à la sidebar qui, elle, l'inclut (sidebar.tsx l.359-362 avec sortableKeyboardCoordinates). Sur desktop, le seul moyen de changer un statut depuis le kanban est de glisser à la souris : un utilisateur clavier ne peut pas déplacer une carte du tout. Le drag handle est bien un vrai <button aria-label="Déplacer la carte"> (l.983-996), donc focusable, mais l'activer au clavier ne déclenche rien. Le fallback existe uniquement en mobile (MobileStatutPicker, masqué en md:). Pour un dirigeant qui pilote son funnel au clavier, c'est un blocage fonctionnel sur cette vue.

- **Fichiers** : app/pipeline/kanban.tsx:139-142, app/pipeline/kanban.tsx:983-996, app/_components/sidebar.tsx:359-362
- **Reco** : Ajouter KeyboardSensor au useSensors du kanban : `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })` (déjà importé/utilisé côté sidebar, copier le pattern). dnd-kit fournit alors Space pour saisir, flèches pour déplacer entre colonnes droppables, Space pour déposer, Esc pour annuler — avec annonces live intégrées. Alternative plus simple si le DnD clavier reste fragile : exposer aussi le MobileStatutPicker sur desktop via un bouton/raccourci sur la carte focusée (ex. Enter ouvre le picker de statut), pour offrir un chemin non-pointeur garanti.

### [medium/accessibility/S] Toast Jarvis : <span role=button> interactif imbriqué dans un <button>

Dans chat-bubble.tsx (l.488-521), chaque toast est un <button> cliquable (navigation deep-link), et sa croix de fermeture est un <span role="button" tabIndex={0} onClick> imbriqué À L'INTÉRIEUR de ce button (l.508-519). HTML interdit un élément interactif dans un autre (button > [role=button]) : comportement non spécifié, et surtout le span avec tabIndex={0} n'a PAS de handler clavier — onClick ne se déclenche pas sur Espace/Entrée, donc un utilisateur clavier peut focuser la croix mais pas la déclencher (et risque de déclencher la navigation du toast parent à la place). aria-label="Fermer" est présent mais inopérant au clavier.

- **Fichiers** : app/_components/chat-bubble.tsx:488-521
- **Reco** : Sortir la croix du <button> parent : transformer le toast en <div role="group"> contenant (a) un vrai <button> 'Voir' / zone cliquable et (b) un <button type="button" aria-label="Fermer"> frère, pas imbriqué. Ou garder la carte cliquable en <button> mais rendre la croix un <button> positionné en absolute hors du flux du premier (deux boutons frères dans un conteneur relative). Supprimer le span[role=button]+tabIndex au profit d'un <button>, qui gère Espace/Entrée nativement.

### [medium/accessibility/M] Combobox/listbox sans sémantique d'option active (palette, Picker, bulk)

Trois composants à navigation flèches sophistiquée n'exposent pas l'état au lecteur d'écran. (1) CommandPalette : l'input n'a pas role="combobox"/aria-expanded/aria-controls/aria-activedescendant, et les ItemRow (Link) n'ont ni role="option" ni aria-selected — la sélection visuelle (bg-zinc-100) n'est pas annoncée, donc au clavier le SR ne dit pas quel résultat est surligné (command-palette.tsx l.226-235, 357-381). (2) Picker : le bouton porte aria-haspopup="listbox"/aria-expanded (bon), le conteneur a role="listbox" (l.264), mais les options sont de simples <button> sans role="option" ni aria-selected, et pas d'aria-activedescendant reliant l'option active (picker.tsx l.291-317). (3) BulkActionBar : popover de liste sans rôles non plus. La nav fonctionne à la souris/clavier visuellement mais est muette pour NVDA/VoiceOver.

- **Fichiers** : app/_components/command-palette.tsx:226-235, app/_components/command-palette.tsx:357-381, app/_components/picker.tsx:262-317, app/_components/bulk-action-bar.tsx:248-263
- **Reco** : Pattern APG combobox/listbox : sur l'input palette → role="combobox" aria-expanded aria-controls={listId} aria-activedescendant={`item-${selectedIdx}`} ; sur chaque ItemRow → role="option" id={`item-${idx}`} aria-selected={selected} (et le conteneur role="listbox" id={listId}). Pour le Picker : ajouter role="option" + aria-selected={isSelected} sur chaque <button> d'option, et aria-activedescendant sur le listbox pointant l'option active (data-option-idx). Idem BulkActionBar. C'est purement additif (attributs), zéro risque de régression visuelle.

### [low/accessibility/M] Popovers non-modaux sans piège de focus (Picker, comments, theme, bulk)

useFocusTrap n'est appliqué QUE sur les 3 modales portail (confirm-modal, form-modal, command-palette). Les popovers ouverts par-dessus la grille — Picker (picker.tsx), CommentsPopover (comments-panel.tsx), BulkActionBar dropdown, ThemeToggle menu — n'ont pas de trap. Le Picker gère bien Escape→refocus bouton et Tab→ferme (l.214-219), ce qui est un compromis raisonnable. Mais le CommentsPopover, qui contient un textarea + liste + boutons supprimer et reste ouvert, laisse le Tab s'échapper vers la grille derrière tout en restant visuellement au premier plan : l'utilisateur clavier perd le contexte. Pas critique (ce ne sont pas des vraies modales bloquantes) mais incohérent avec le soin mis sur les modales.

- **Fichiers** : app/obligations/[tracker]/comments-panel.tsx:26-90, app/_components/picker.tsx:214-230, app/_components/theme-toggle.tsx:37-59, lib/focus-trap.ts
- **Reco** : Pour CommentsPopover spécifiquement (le seul popover 'riche' qui mérite un trap) : réutiliser useFocusTrap(popoverRef, true) + auto-focus du textarea à l'ouverture + Escape→close avec restauration du focus sur la pastille 💬 d'origine. Pour Picker/ThemeToggle/Bulk (sélection rapide), le comportement actuel (Esc + Tab ferme) est acceptable ; documenter ce choix dans un commentaire pour assumer la non-uniformité plutôt que de la subir.

### [low/accessibility/S] Indicateurs d'état/statut véhiculés par la seule couleur

Plusieurs signaux reposent uniquement sur la couleur sans libellé ni icône redondante pour les daltoniens / faible contraste : la pastille d'urgence d'échéance sur les cellules tracker (point coloré urgencyPastille l.2241-2245, distinction overdue/bientôt = teinte rose vs ambre — seul 'Retard' a un texte, le 'proche' non), les badges 'À faire' sidebar (point rose pur en mode collapse l.552, sans tooltip différenciant), et le dot d'état actif du ThemeToggle (point gold seul l.130). Le StatusBadge de ui.tsx fait bien dot+label (bon exemple), mais les pastilles inline de la grille ne suivent pas ce principe. WCAG 1.4.1 (Use of Color).

- **Fichiers** : app/obligations/[tracker]/tracker-table.tsx:2235-2254, app/_components/sidebar.tsx:546-562, app/_components/theme-toggle.tsx:129-131
- **Reco** : Ajouter une redondance non-chromatique sur les pastilles d'urgence : un title/aria-label explicite ('Échéance dans 3 jours' vs 'En retard') sur chaque pastille (pas seulement overdue), ou une micro-forme distincte (point plein = retard, anneau = proche). La pastille collapse sidebar a déjà un aria-label (l.551) — bien ; vérifier qu'un title visuel existe aussi au survol. Principe : tout signal couleur doit avoir un doublon texte/forme/icône.

### [low/color/S] Zone 'Perdu dans l'espace' : texte indigo très clair sur fond noir, sous le seuil

La drop zone starfield utilise des textes à très faible opacité sur un fond quasi-noir : text-indigo-200/40 (l.498, 736, 748), indigo-200/50 (l.832), indigo-300/30 sur le grip (l.821). Sur le gradient #0a0f1f→#0b1024, indigo-200 à 40% d'opacité tombe bien sous 4.5:1 (probablement ~2.5–3:1). Les libellés 'Perdu dans l'espace', le compteur de dossiers et surtout le montant ARR (information métier) deviennent durs à lire. C'est un choix esthétique assumé (ambiance 'dérive spatiale'), mais l'ARR et le nombre de dossiers sont des données réelles que Benjamin doit pouvoir lire. Ce panneau garde la même apparence dans les 3 thèmes (fond hardcodé), donc le souci est constant.

- **Fichiers** : app/pipeline/kanban.tsx:736-742, app/pipeline/kanban.tsx:821, app/pipeline/kanban.tsx:832, app/pipeline/kanban.tsx:498
- **Reco** : Remonter l'opacité des éléments porteurs d'info à >=70% : le compteur 'N dossiers · montant' et les noms de dossiers en text-indigo-100/90 minimum (déjà le cas pour les noms l.828, à appliquer au compteur l.740-742 et au montant l.832). Garder les éléments purement décoratifs (sous-titre 'zone de dérive', message vide) en faible opacité. Vérifier le grip GripVertical : indigo-300/30 au repos est quasi invisible — passer à /50 au repos.

### [low/fluidity/S] Modale form/confirm : auto-focus via ref callback el?.focus() au render

Dans confirm-modal.tsx, le bouton Confirmer (mode simple) et le bouton OK de l'alerte se focusent via `ref={(el) => el?.focus()}` (l.228, 336) — focus déclenché à chaque attache du ref pendant le render. C'est fragile : si le composant re-render (ex. changement de prop), le focus est volé à nouveau et ramené sur le bouton, ce qui peut interrompre un utilisateur. Le FormModal et le mode typeToConfirm font ça proprement dans un useEffect au mount (form-modal.tsx l.77-83, confirm-modal l.112-115). Incohérence de pattern + risque de focus-steal. Par ailleurs le setTimeout 50ms d'auto-focus (confirm l.113) peut entrer en course avec le focus-trap qui s'initialise au même moment.

- **Fichiers** : app/_components/confirm-modal.tsx:226-229, app/_components/confirm-modal.tsx:333-337, app/_components/form-modal.tsx:77-83
- **Reco** : Remplacer les `ref={(el) => el?.focus()}` par un useRef + useEffect(() => ref.current?.focus(), []) au mount, comme dans FormModal. Cela garantit un focus unique à l'ouverture sans re-déclenchement. Aligner les deux modales sur le même pattern (useEffect mount). Optionnel : réduire le setTimeout 50ms à un simple appel post-render (requestAnimationFrame) pour éviter la course avec useFocusTrap.

### [low/accessibility/S] Cible tactile sous 44px sur les boutons-icônes denses

Plusieurs boutons-icônes critiques sont sous la cible tactile recommandée (44×44 iOS HIG / 24px min WCAG 2.2 SC 2.5.8). Croix de fermeture des modales/popovers : p-1 autour d'une icône h-4 (≈24px total) — confirm-modal l.181-188, form-modal l.112-119, chat-bubble header l.601-608. Boutons '?' et X de la BulkActionBar : p-1 + icône h-3.5 (≈22px, l.191-213). Grip de drag des SpaceCard : px-1 py-2 sur icône h-3 (l.816-824). Sur la barre d'action en bas (souvent utilisée au doigt sur tablette) et les croix de modale, c'est juste, surtout que la barre est déjà compacte. Le reste de l'app respecte bien 44px (nav h-11 mobile l.539, cellules, boutons mobiles).

- **Fichiers** : app/_components/confirm-modal.tsx:181-188, app/_components/bulk-action-bar.tsx:191-214, app/_components/form-modal.tsx:112-119, app/pipeline/kanban.tsx:816-824
- **Reco** : Porter les boutons-icônes interactifs à minimum 32px de zone cliquable (idéalement 44 sur les surfaces tactiles) : passer p-1 → p-2 sur les croix de modale/popover (icône reste h-4), et sur la BulkActionBar utiliser h-8 w-8 inline-flex items-center justify-center plutôt que p-1. Pour les grips SpaceCard, élargir la hit-zone via -m négatifs compensés (pattern déjà utilisé sur le grip kanban Card l.989-992 : -my-1.5 -ml-2 px-1.5 py-2). Priorité aux croix de fermeture (action fréquente) et à la BulkActionBar (usage tablette).

### [low/accessibility/S] Modales : aria-labelledby manquant / focus-trap sans Tab natif piégé au backdrop

Détails de finition sur des modales par ailleurs solides. (1) FormModal utilise aria-label={title} sur le conteneur (form-modal.tsx l.99) alors qu'il existe un <h3> visible (l.111) : préférer aria-labelledby pointant le h3 (le titre est déjà à l'écran, le dupliquer en aria-label est redondant et peut diverger). ConfirmModal le fait bien (aria-labelledby="confirm-modal-title" l.136). AlertModal n'a NI aria-labelledby NI aria-label (l.314-316). (2) Le focus-trap maison (focus-trap.ts) filtre offsetParent!==null pour exclure les éléments cachés (l.40) : correct, mais le backdrop aria-hidden étant un frère du dialog dans le DOM (pas un parent), un Tab depuis le dernier élément reboucle bien — OK. (3) AchievementCard a aria-modal="false" + role="dialog" (achievement-card.tsx l.99-100) mais capture Escape globalement (l.67-73) : cohérent car non-bloquant, juste à noter.

- **Fichiers** : app/_components/form-modal.tsx:94-111, app/_components/confirm-modal.tsx:131-137, app/_components/confirm-modal.tsx:311-327, lib/focus-trap.ts:36-41
- **Reco** : Uniformiser le nommage : FormModal → remplacer aria-label={title} par un id sur le <h3> + aria-labelledby. AlertModal → ajouter id="alert-modal-title" sur son <h3> (l.327) + aria-labelledby correspondant sur le conteneur role="alertdialog". Vérification rapide : s'assurer que tous les role=dialog/alertdialog ont soit aria-labelledby (préféré) soit aria-label, jamais les deux.
