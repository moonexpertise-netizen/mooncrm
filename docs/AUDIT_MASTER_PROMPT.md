# MASTER PROMPT — MoonCRM : version DÉFINITIVE

Tu es l'agent d'implémentation chargé de porter MoonCRM (CRM/production pour cabinet d'expertise-comptable, mono-utilisateur exigeant : Benjamin) à sa version définitive et parfaite : fluide, belle, cohérente, performante, accessible, lisible dans les 3 thèmes. Stack : Next.js 15 (App Router, RSC), React 19, Tailwind 3.4, Supabase, lucide-react, recharts, dnd-kit, sonner. Travaille par chantiers transversaux (tokens d'abord, puis primitives, puis surfaces). Ne casse aucune logique métier ; les changements sont visuels, structurels (tokens/composants) et perf. Ancre toujours tes changements dans le code réel (chemins absolus). Ne crée jamais de fichiers .md de rapport.

Règle d'or : **on arrête d'étendre la couche de compat CSS** (`app/globals.css` ~lignes 405-796, qui remappe 1621 classes zinc/white hardcodées sur 92 fichiers) et **on route tout nouveau code sur des tokens sémantiques**. La compat reste comme filet de sécurité legacy, mais chaque composant qu'on touche migre vers les tokens.

---

## 1. DIRECTION ARTISTIQUE & PRINCIPES

Identité : SaaS B2B premium, calme, dense mais lisible. Références : Attio, Linear, Stripe, Notion. Encre navy `#0D1122`, accent doré MOON `--gold #a88962`, display Funnel_Display (titres). 3 thèmes : clair (défaut), dark (gris Notion saturation 0), navy (bleu MOON).

Principes non négociables :
1. **Densité maîtrisée** — beaucoup d'info, jamais d'encombrement. Rythme vertical régulier (hauteurs de lignes constantes), colonnes d'actions alignées à droite.
2. **Calme premium** — la profondeur vient de la bordure + du fond, pas d'ombres lourdes. La couleur encode du sens (statut/urgence), jamais de la décoration gratuite.
3. **Doré parcimonieux mais signature** — le doré marque les états *actifs significatifs*, le focus, et l'accent de valeur. Jamais en texte de label sur fond doré. Aujourd'hui le doré est quasi absent de la couche partagée (Button/chips en gris zinc générique) : le réintroduire aux bons points.
4. **Hiérarchie claire** — un seul langage visuel par concept (une Card, un Badge, un Picker, un état actif, un focus). Aujourd'hui : 2 Cards, 2 Badges, 3 sémantiques de pastille rouge, 2 couleurs "en cours". On unifie.
5. **Une seule source de vérité** par décision visuelle (couleur de statut, z-index, durée d'animation, format €).

---

## 2. DESIGN SYSTEM CONSOLIDÉ (concret — `tailwind.config.ts` + `app/globals.css`)

### 2.1 Tokens à AJOUTER dans `tailwind.config.ts > theme.extend`
Actuellement `extend` ne contient QUE `colors`. Ajouter :
```ts
// colors — brancher les tokens sémantiques DÉJÀ définis en CSS mais morts
success:"hsl(var(--success))","success-soft":"hsl(var(--success-soft))",
warning:"hsl(var(--warning))","warning-soft":"hsl(var(--warning-soft))",
danger:"hsl(var(--danger))","danger-soft":"hsl(var(--danger-soft))",
info:"hsl(var(--info))","info-soft":"hsl(var(--info-soft))",
gold:"hsl(var(--gold))","gold-soft":"hsl(var(--gold-soft))","gold-dark":"hsl(var(--gold-dark))",
ring:"hsl(var(--ring))",
sidebar:"hsl(var(--sidebar))","sidebar-foreground":"hsl(var(--sidebar-foreground))",

zIndex:{ base:"0",dropdown:"1000",sticky:"1100",overlay:"1200",modal:"1300",popover:"1400",toast:"1500",command:"1600",skiplink:"2000" },
borderRadius:{ /* règle : pills=md, cards & boutons=lg, surfaces flottantes=xl, hero/grande card=2xl */ },
fontSize:{ "2xs":["10px",{lineHeight:"14px"}], "xs-":["11px",{lineHeight:"16px"}], label:["13px",{lineHeight:"18px"}], base15:["15px",{lineHeight:"22px"}] },
transitionTimingFunction:{ "ease-out-soft":"cubic-bezier(0.16,1,0.3,1)", standard:"cubic-bezier(0.4,0,0.2,1)", bounce:"cubic-bezier(0.34,1.56,0.64,1)" },
transitionDuration:{ fast:"120ms", base:"160ms", slow:"240ms" },
boxShadow:{ card:"var(--shadow-sm)","card-hover":"var(--shadow-md)",pop:"var(--shadow-lg)",modal:"var(--shadow-xl)" },
```

### 2.2 Tokens de motion (dans `:root` de globals.css)
Aujourd'hui durées (0.12/0.15/0.16/0.18/0.55/2.4s/140ms) et 3 courbes en dur, dispersées (globals.css + `app/_components/app-shell.tsx:121` inline). Déclarer puis réutiliser PARTOUT :
```css
--ease-out:cubic-bezier(0.16,1,0.3,1); --ease-standard:cubic-bezier(0.4,0,0.2,1); --ease-bounce:cubic-bezier(0.34,1.56,0.64,1);
--dur-fast:120ms; --dur-base:160ms; --dur-slow:240ms;
```

### 2.3 Focus (token unique `--ring` par thème)
Aujourd'hui : `:focus-visible { outline:2px solid hsl(240 5% 65%) }` (globals.css:901, ~1.8:1 sur blanc = échec WCAG 1.4.11), pas d'override `.navy` ; `ui.tsx:26` utilise `ring-zinc-400` (3e convention). UNIFIER :
```css
:root { --ring: var(--gold); }   /* ou hsl(var(--foreground)/0.55) */
.dark { --ring: 240 5% 75%; }
.navy { --ring: 226 60% 70%; }
:focus-visible { outline:2px solid hsl(var(--ring)); outline-offset:2px; border-radius:6px; }
```
Remplacer les 23 `ring-zinc-400` par `ring-ring`. Toujours `focus-visible:` (jamais `focus:` seul). Fixer `ring-offset-color` via `ring-offset-background` sur modales à header coloré.

### 2.4 Échelle typographique (usages)
- Titres h1-h4 : Funnel_Display, weight 600, `letter-spacing -0.018em`, `leading-tight` (jamais `leading-none` sur valeurs avec jambages/€).
- KPI/chiffres : `font-display` + `tabular-nums`.
- Body 14px (sm). Labels denses `text-label` (13px). Méta/pills `text-xs-` (11px). Micro `text-2xs` (10px) = **plancher** pour texte porteur d'info (proscrire 8/9px du tracker et le CTA "Voir" 10px Jarvis).
- **Fraunces** importé dans `app/layout.tsx` (3 poids + italique) mais `grep font-fraunces` = 0 usage (display réelle = Funnel_Display). **Retirer l'import** (gain LCP/fonts).

### 2.5 Couleurs & doré — règles d'usage
- Surfaces : `bg-card` / `bg-surface-muted` / `bg-surface-elevated` / `text-foreground` / `text-muted-foreground` / `border-border` / `border-border-strong`. **Cesser** `bg-white dark:bg-[hsl(var(--card))]` → `bg-card` (commencer par `ui.tsx`).
- Sémantique statut centralisée dans `lib/utils.ts`. `STATUT_COLORS`/`CUSTOM_STATUS_COLORS`/`PIPELINE_COLORS` sont **light-only** → leur faire émettre les variantes `dark:` inline (modèle `BADGE_TONE`/`STATUS_TEXT` de ui.tsx, ex. `bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30`). Ensuite ces familles deviennent inutiles dans la compat.
- **Bug actif** : `"Z - Perdu dans l'espace":"bg-indigo-100…"` (lib/utils.ts:71) — `indigo` absent de la compat dark/navy → badge quasi-blanc illisible. Ajouter le bloc indigo (dark+navy) OU basculer ce badge sur classes dark: inline.
- "En cours" UNIQUE = **sky**. IR/CAA rendent EN_COURS en **blue** (`STATUT_COLORS.EN_COURS=bg-blue-100…`) alors que tout le reste est sky → mismatch direct. Aligner `STATUT_COLORS.EN_COURS` et `CUSTOM_STATUS_COLORS.blue` sur sky.
- Doré : focus (`--ring`), état actif `StatusFilterChip` (liseré/anneau `border-[hsl(var(--gold))]/40`), ARR/valeurs à fort enjeu, soulignement d'onglet actif. Variant Button `brand` doré pour CTA principal.
- Liens : `hover:text-gold` (pas `hover:text-sky-600` — détonne, cf. echeances-list).

### 2.6 États standardisés (TOUS les interactifs)
- **hover** : `hover:bg-muted/60` (dark:hover:bg-white/[0.06]). Interdit `hover:bg-zinc-50/50` nu (opacités non remappées par la compat → bug réel hover de ligne tracker).
- **active** : `active:scale-[0.97]` sous `motion-safe:`.
- **focus-visible** : token `--ring`.
- **disabled** : `opacity-50 cursor-not-allowed`, neutralise active scale.
- **selected** (cellules/options) : `outline-2 outline-[hsl(var(--ring))] outline-offset-[-2px]` (unifier : IR/CAA/Créations sont en outline-1, Pilotage en outline-2).

### 2.7 Patterns canoniques (un seul de chaque)
- **Table dense** : `<thead> sticky top-0 z-sticky` fond OPAQUE (`bg-card`), cellule gauche `sticky left-0` à z supérieur ; hover de ligne via `group/row` qui éclaire AUSSI la cellule sticky (`group-hover/row:bg-muted`) ; tri via icônes lucide `ChevronUp/Down` (jamais `▲▼`) ; resize via `onPointerDown` (souris+tactile) + poignée `role="separator"` focusable + clavier ; largeurs lues en lazy `useState(()=>…)` (pas de useEffect → pas de FOUC).
- **Card** : composant UNIQUE `<Card title subtitle action bodyClassName>` (API de `app/clients/[slug]/_components.tsx`), `rounded-xl shadow-card`, header teinté. Supprimer la Card concurrente de `ui.tsx` (rounded-lg, API CardHeader/CardBody). Migrer ContactsCard, échéancier-card, pilotage-card, obligations-matrix, onboarding dessus.
- **Badge** : API `tone` sémantique unique (ui.tsx). Supprimer la variante `{text,color}` de `_components.tsx`.
- **Pastille/dot d'urgence** : convention métier UNIQUE — `amber`=à traiter/actif, `rose`=en retard, rien=terminé/pas encore actif. Réutiliser `getUrgencyStatus` (lib/echeances.ts). Tout signal couleur doublé d'un `title`/aria-label (WCAG 1.4.1).
- **Picker** : `app/_components/picker.tsx` est la primitive — PARTOUT (supprimer FactPicker maison facturation -115 lignes, popovers statut dupliqués matrice/fiche ~300 lignes). Compléter ARIA (§4).
- **Modale** : extraire `<ModalShell>` (portal + backdrop tokenisé `bg-[hsl(var(--foreground))]/40` + focus-trap + Esc + anim) consommé par FormModal/ConfirmModal/AlertModal (3 copies). `aria-labelledby` via `useId()`. Focus initial `useRef`+`useEffect` (pas `ref={el=>el?.focus()}`).
- **Toolbar sticky** : pill horizontale search+chips ; sous `md` → grid 2x2 de selects natifs (pattern onboarding-list). Extraire en composant partagé Liste/Matrice (Matrice n'a aucun traitement mobile).
- **État vide** : `<EmptyState icon title description action>` partagé (ui.tsx) + bouton "Réinitialiser les filtres" si filtres actifs. Distinguer "0 filtré" vs "0 base". Remplacer tous les `(vide)`/`Aucun…` plat/`-` zinc-300. 0 échéance → message positif ("Tout est à jour").
- **Confirmation destructive** : toujours `useConfirm` variant danger (jamais `window.confirm()` — reste dans matrice-table, onboarding-editor, admin user-row).
- **Skeleton** : silhouette EXACTE du contenu réel (grilles/hauteurs/rounded, tokens `bg-muted`). Un `loading.tsx` par sous-route lourde (historique/, onboarding/, obligations/, exercice/).
- **Toasts** : `sonner` SEUL. Supprimer le stack maison Jarvis. Brancher sur thème résolu (navy→dark), pas `theme="system"`.

---

## 3. CHANTIERS TRANSVERSAUX PRIORITAIRES (application surface par surface)

### A. `prefers-reduced-motion` — ZÉRO support (vérifié : 0 occurrence). Échec WCAG 2.3.3.
Fin de `globals.css` :
```css
@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important; } }
```
Garde-fous JS (la media query n'est pas lue par JS) : `use-ldm-celebration.tsx` (skip `fireConfetti()`), `achievement-card.tsx` (poser `mrrAfter` direct), `use-highlight-row.ts` (`behavior:'auto'`). Hovers `-translate`/`scale` sous `motion-safe:`.

### B. Migration tokens (geler la compat) — par priorité
1. `ui.tsx` : `bg-white dark:bg-[hsl(var(--card))]` → `bg-card` ; `ring-zinc-400` → `ring-ring` ; Button primary `bg-zinc-900` + ajouter variant `brand` doré.
2. `app/clients/clients-table.tsx` (seule grande table sans `dark:` explicite) : ring focus tokenisé (3 occurrences sans fallback navy), thead/lignes en `dark:` explicites.
3. ContactsCard, EditableHeading, pills pipeline inactives (`bg-white text-zinc-700` → `bg-card text-muted-foreground border-border`), drawer mobile kanban (`bg-white` plein écran → `bg-surface-elevated`).
4. Toolbar Matrice onboarding, grid paramétrage (formulaires `bg-white` → `bg-zinc-50 dark:bg-white/[0.04]`).

### C. Échelle z-index — remplacer magic numbers (z-[900/950/1000/1500/2000] sur 9 fichiers, collisions à 1000)
Migrer vers `z-modal/z-popover/z-toast/z-command/z-skiplink/z-sticky`. BulkActionBar z-40 → `z-sticky`. Draft-bar matrice z > thead.

### D. Charts theme-aware (Recharts) — dashboard d'accueil illisible en dark/navy
`app/_dashboard/dashboard-charts.tsx` : axes/labels/curseur en hex codé en dur (`#52525b` sur `#202020` ≈ 2:1). Copier le pattern DÉJÀ correct de `finance-dashboard.tsx:445-465` : `tick={{fill:"currentColor"}}` + `className="text-zinc-500 dark:text-zinc-400"`, curseur `hsl(var(--foreground)/0.06)`, ajouter `<CartesianGrid strokeDasharray="3 3" vertical={false}>`. Cumul YTD vert (#10b981 = couleur "LDM signée", ambigu) → sky. Mix activité → dégradé de gold.

### E. Drill-down Pipeline cassé : `/clients?pipeline=…` jamais lu par clients-table → ajouter lecture du param et faire pointer onBarClick dessus.

### F. Accessibilité clavier/ARIA (§4 détaillé).

---

## 4. RÈGLES D'ACCESSIBILITÉ

- **Picker / Palette / Bulk listbox** : items `role="option"` + `aria-selected`, conteneur `role="listbox"`+`id`, trigger `aria-controls`+`aria-activedescendant`. Palette input `role="combobox" aria-expanded`. Additif, zéro régression visuelle.
- **Grille obligations** (`tracker-table.tsx`) : ~800-1500 boutons tabulables → **roving tabindex** (cellule active `tabIndex=0`, reste `-1`, MAJ via `onTableKeyDown` déjà centralisé) + `role="grid"/"row"/"gridcell"`. Bouton commentaire de cellule `tabIndex=-1`.
- **Kanban** (`kanban.tsx:139`) : drag inaccessible clavier → `useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates})` (déjà fait dans sidebar) + announcements FR. Fallback : `MobileStatutPicker` au clavier desktop (Enter sur grip).
- **Sidebar repliée** (`sidebar.tsx:492`) : `overflow-x-hidden` du `<nav>` clippe tooltips + flyout Production → sidebar collapse inutilisable. Retirer le clip X OU rendre tooltips/flyout en portail `fixed`.
- **Focus-visible manquant** : pipeline-picker, matrice cells, échéancier ModeBtn, pilotage toggles, CivilitePicker, grid paramétrage (toggles `aria-pressed`+ring), StatusFilterChip (`aria-pressed`).
- **Focus-trap + role=dialog** manquants : drawer mobile sidebar, drawer Jarvis (`role="dialog" aria-modal` + trap + restauration focus FAB), CommentsPopover.
- **Toast Jarvis** : `<span role="button">` imbriqué dans `<button>` (HTML invalide, croix inopérante clavier) → 2 `<button>` frères (résolu via sonner).
- **Cibles tactiles** <44px : grip kanban/SpaceCard, croix modales (`p-1`→`p-2`), mini-pills facturation (9px), chevron Production sidebar, poignée resize. Élargir via marges négatives compensées.
- **aria-live** : fil Jarvis `aria-live="polite"`, bloc erreur `role="alert"`. `aria-current="page"` sur onboarding-tabs/fiche-tabs.
- **`aria-label`** sur `<select>` nus (grid Régime/TVA) et boutons-icônes sans texte.

---

## 5. RÈGLES DE PERFORMANCE

### Back / data
- **Parallélisation** : `app/facturation/page.tsx` = 6 requêtes Supabase EN SÉRIE (44/90/154/208/268/315) → un seul `Promise.all` (pattern Finance/IR/Dashboard). Layout fiche : `loadContactsLink`+liste nav en parallèle après `loadClient`.
- **Sidebar badges** (`sidebar-badges-loader.ts`) : 9 requêtes à CHAQUE navigation (dep `[pathname]`). Déclencher sur event `moon:badges-stale` émis par les mutations, sinon throttle 30s. Retirer `console.log("[sidebar-badges]")`.
- **Mutations chaudes** : `updateObligationStatus` = 3 round-trips série (SELECT type, SELECT statut_logique, UPDATE) → passer `statut_logique` en argument (déjà connu via `statusOptions`) → 1 UPDATE. Idem statut virtuel échéances.
- **`revalidateFinanceViews`** invalide /finance + /facturation à CHAQUE chip → ne revalider que sur transitions facturables (vers/depuis TERMINE ou `etat_facturation`), via `revalidateTag('finance-data')`.
- **`router.refresh()`** (139 occurrences) : supprimer du chemin nominal kanban (`kanban.tsx:198`) et échéances mount (`echeances-list.tsx:77`) ; sur tables, débouncer/coalescer.
- **`select("*")`** unique : `app/api/chat/tools.ts:265,272` → select explicite.
- **Modèle Jarvis** : `app/api/chat/route.ts:116` hardcode `claude-opus-4-7` malgré le commit "Sonnet 4.7" → corriger + `process.env.ANTHROPIC_MODEL`.
- Supprimer dépendance morte `@tanstack/react-table` (0 import).

### Front / rendu
- **StatusCell memo cassé** (`tracker-table.tsx:1782,1784`) : `options={statusOptions[c.type] ?? []}` (nouveau `[]`/render) + `rowLabel` inline → ~960 cellules re-render/frappe. Fix : constante `EMPTY` module, rowLabel DANS la cellule, `Map<colKey,col>` mémoïsé (remplace 3× `cols.find()`/cellule), comparateur memo explicite.
- **Recharts en bundle initial** : `finance/page.tsx` importe `FinanceDashboard` statiquement → lazy-loader comme le dashboard (`next/dynamic ssr:false`+skeleton). Sparklines hero finance (4× ResponsiveContainer) → SVG `<path>` maison.
- **Listes non mémoïsées** : `EcheanceRow`/`Section`, `MatrixCell` (~650 cellules), `ClientRow`, Pickers (~237 instances) → `React.memo` + clés stables + primitives (commentCount number) pas le dict entier ; `useMemo` des options.
- **Frontière use client** : `ChatBubble` (gros JS Speech/TTS, invisible au load) → `next/dynamic ssr:false`.
- **clients-table** : `new URLSearchParams()` par ligne ×2 → un `useMemo` du préfixe nav.
- **tracker-table.tsx** (113 KB monolithe) : extraire `<TrackerToolbar>`, `<SelectionBar>`, picker/comments en imports dynamiques.

---

## 6. ORDRE D'EXÉCUTION
1. Fondations (S/M, débloquent tout) : reduced-motion, tokens (z-index/motion/focus/typo/sémantique), fix indigo, sonner thème résolu, retirer Fraunces.
2. Primitives : ModalShell, Card/Badge unifiés, Picker ARIA+memo, EmptyState/Skeletons, StatusFilterChip aria-pressed+doré.
3. Perf back rapide : Promise.all facturation, badges event-driven, modèle Jarvis, revalidate ciblé, kill `@tanstack/react-table`.
4. Surfaces critiques : sidebar collapse, kanban clavier, StatusCell memo + roving tabindex, charts theme-aware, drill-down pipeline.
5. Cohérence fine : pastilles unifiées (missions), "en cours" sky, focus pills, états vides, hovers tokenisés, migration tokens grandes tables.

Chaque chantier livré doit être vérifiable dans les 3 thèmes (clair/dark/navy), au clavier ET à la souris.