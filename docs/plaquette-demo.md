# MoonCRM

### Le CRM bâti pour les cabinets d'expertise-comptable

*Données présentées : entièrement fictives. Sociétés et chiffres inventés à des fins de démonstration.*

---

## Le constat

Un cabinet d'expertise-comptable moderne pilote en parallèle :

- **Un pipeline commercial** (prospects, LDM à signer, KBIS reçus)
- **Une production récurrente** (TVA, bilans, AGO, IR/IFI, CAA, créations de société)
- **Une facturation transverse** qui agrège toutes ces sources

Et la plupart d'entre nous le font dans **Notion, Trello, Excel, ou un patchwork des trois**. Résultat : on perd du temps à recoller les morceaux, on rate des échéances, et on ne sait jamais en temps réel combien on va facturer le mois prochain.

**MoonCRM est conçu pour qu'un cabinet d'expertise-comptable arrête de faire ce travail de colle.**

---

## En 30 secondes

| | |
|---|---|
| **Stack** | Next.js 15 (App Router) · Supabase (Postgres + RLS) · Vercel |
| **Cible** | Cabinets de 1 à 20 collaborateurs |
| **Modèle** | Relationnel (pas un Notion réécrit) : clients, obligations par exercice, missions, contacts, pipeline, facturation, finance |
| **Données sensibles** | RLS Supabase, auth email+password, approval workflow admin, données hébergées Europe |
| **Mobile** | Full responsive, drawer sidebar, tap natif iOS/Android |
| **Mode sombre** | Premier-class (palette zinc/white équilibrée, pas un afterthought) |

---

## 1. Dashboard / KPI — La vue d'ensemble

À l'ouverture, le tableau de bord montre l'état du cabinet en chiffres :

### KPI globaux (extraits démo)

| Indicateur | Valeur | Évolution |
|---|---|---|
| **Clients actifs** | 87 | +6 vs N-1 |
| **MRR honoraires** (récurrent mensuel) | 54 200 € HT | +8,4 % |
| **ARR estimé** | 650 400 € HT | — |
| **Pipeline pondéré** (prospects × proba) | 38 700 € HT | 12 dossiers |
| **Cash mobilisable** (à facturer immédiat) | 47 800 € HT | 23 lignes |
| **LDM en attente signature** | 4 | dont 2 > 30 j |

### Dashboard BI (Recharts)

Le dashboard intègre nativement :

- **Répartition CA par activité** (donut) : Commerce 32 %, Conseil 24 %, BTP 18 %, Tech 14 %, Autres 12 %
- **Évolution mensuelle facturation** (barres) sur 12 mois glissants
- **Top 10 clients par CA** avec barres horizontales
- **Pipeline par étape** (funnel : Prospect → RDV → LDM envoyée → LDM signée → Onboardé)

Tous les chiffres sont formatés au format français (`54 200 €`, `k€` sur les axes), les ronds sont au milliers près pour éviter le bruit visuel.

---

## 2. Pipeline commercial (Kanban) — De la prospection au KBIS

Vue Kanban drag-drop avec 6 étapes :

```
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│  Prospect    │  RDV pris    │  LDM envoyée │  LDM signée  │  Onboardé    │  Perdu       │
│  (3)         │  (2)         │  (4)         │  (2)         │  (5)         │  (1)         │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

### Exemples démo

| Dossier | Étape | Type | Honoraires prévus | Origine |
|---|---|---|---|---|
| **SAS Atelier Verde** (paysagiste) | RDV pris | Reprise | 2 800 € HT/an | Bouche-à-oreille |
| **SARL Mahé Conseil** | LDM envoyée | Reprise | 4 200 € HT/an | Recommandation associé |
| **EURL Architectures Lafont** | LDM signée | Reprise | 3 600 € HT/an | LinkedIn |
| **SCI Patrimoine Saint-Honoré** | LDM envoyée | Création | 1 500 € one-shot + 1 200 €/an | Réseau apporteur |
| **Boulangerie du Marais SARL** | Prospect | Reprise | 3 200 € HT/an | Site web |
| **SASU Tech Pulse Studio** | LDM signée | Création | 2 200 € one-shot + 2 400 €/an | Confrère |
| **Camille Reynaud (AE)** | Onboardé | Création | 600 € one-shot + 540 €/an | Réseau perso |

### Génération LDM en 1 clic

Sur chaque fiche client : bouton **"Générer LDM"** → produit un `.docx` pré-rempli (adresse, civilité, dates de mission, honoraires) à partir du template du cabinet (powered by `docxtemplater`). Plus de copier-coller depuis Word.

À la **signature LDM**, animation de confettis + déclenchement automatique :
- Création de la liste d'onboarding (questionnaire Tally pré-rempli, attente KBIS, paramétrage)
- Bascule en "Onboardé" dans le pipeline
- Affectation au comptable assigné

---

## 3. Production — Suivi par mission, par exercice

C'est le cœur métier. Six modules distincts mais cohérents, **tous pensés par exercice fiscal**.

### 3.1 TVA · Bilan · AGO · Plaquettes (vue tracker)

Une grille classique, mais avec les bons réflexes EC :

- **1 ligne par client**, colonnes = échéances (mensuelles pour TVA, annuelles pour bilan/AGO)
- **Statut Notion-style** : picker groupé À faire / En cours / Terminé
- **Sélection multi-cellules Excel** (clic + shift + Cmd+A) avec copier-coller TSV vers Excel
- **Commentaires latéraux** par cellule (Notion-style, fond jaune doux)
- **Pastille rouge à échéance proche** (≤ 30 jours) sur les cellules

### 3.2 IR / IFI — Vue Base + vue Année

Module IR conçu pour les dossiers personnes physiques :

- **Vue Base** : tous les clients IR avec pills années (souscription multi-années)
- **Vue Année** : déclarations à traiter pour l'exercice sélectionné, IR + IFI sur 2 colonnes distinctes
- **Statut LDM** sur chaque dossier (En attente / Envoyée / Signée / Pas de LDM)
- **Forfait honoraires** synchronisé IR ↔ IFI sur le même couple (client, année)
- **Recap par année** : compteurs À faire / En cours / Terminé + barre de progression %

### Exemple — vue Année 2025

| Foyer | LDM | IR 2025 | IFI 2025 | Facturation | Honoraires |
|---|---|---|---|---|---|
| M. et Mme **Caron Stéphanie** | ✅ Signée | À faire ● | — | À facturer | 480 € HT |
| M. **Dumas Frédéric** | ✅ Signée | En cours | — | À facturer | 360 € HT |
| Mme **Lemaitre Pauline** | ⏳ Envoyée | À faire ● | — | — | 420 € HT |
| **Famille Roussel** | ✅ Signée | Terminé | Terminé | Facturée | 1 280 € HT |
| M. **Olivier Mathis** | ✅ Signée | Terminé | — | À facturer | 360 € HT |

*● = pastille rouge visible directement à côté du nom : on repère les dossiers à traiter sans scanner toute la colonne statut.*

### 3.3 CAA — Comptes annuels associations

Même structure que IR mais pour les associations / SCI / petites structures. **Mini-pipeline LDM** + statut mission + facturation au forfait.

### 3.4 Créations de société — Suivi des étapes

Module dédié aux dossiers origine "Création" (≠ reprise). Étapes propres :

```
À traiter → Dépôt capital → INPI en cours → INPI terminé → Actée · KBIS reçu
```

À la bascule **"KBIS reçu"**, le système :
- Marque la création comme terminée
- Bascule automatiquement la **facturation à "À facturer"** (via trigger Postgres)
- Pousse l'item dans la **facturation centralisée**

### Exemple — vue Année 2025

| Société | Forme | Statut création | Facturation | Honoraires |
|---|---|---|---|---|
| **SASU Olivier Photographe** | SASU | Actée · KBIS reçu | À facturer | 1 200 € HT |
| **SARL Boulangerie du Marais** | SARL | INPI en cours | — | 1 500 € HT |
| **SCI Patrimoine Saint-Honoré** | SCI | Dépôt capital | — | 900 € HT |
| **Holding Lefèvre Investissements** | SAS | Actée · KBIS reçu | Facturée | 2 400 € HT |
| **EURL Conseil & Stratégie Vidal** | EURL | À traiter ● | — | 800 € HT |

---

## 4. Facturation centralisée — Un seul écran pour tout facturer

C'est la fonctionnalité qui change le quotidien. **Toutes les sources convergent ici** :

| Source | Déclenchement automatique | Montant indicatif |
|---|---|---|
| **CAA** | Mission cloturée (statut Terminé) | `caa_obligations.forfait` |
| **IR / IFI** | Déclaration déposée (Terminé) | `ir_obligations.forfait` |
| **AGO** | Dépôt déposé | `clients.honoraires_jur` |
| **Bilan** | Plaquette transmise + facturation séparée | `clients.forfait_bilan` |
| **Création** | KBIS reçu | `clients.honoraires_creation` |
| **Mission exceptionnelle** | Mission livrée | Forfait OU taux × durée réelle |

### KPI en haut de page

| À facturer | Facturées | Sans facture | Total affiché |
|---|---|---|---|
| **23** lignes / 47 800 € HT (estim.) | **41** lignes / 86 200 € HT (estim.) | **6** lignes | 70 / 87 |

### Filtres État · Source

Onglets en haut : `À facturer / Facturées / Sans facture / Toutes` croisé avec `Toutes / CAA / IR / AGO / Bilan / Création / Mission exc.`

### Exemple — tab "À facturer"

| Source | Client | Détail | Montant HT | État |
|---|---|---|---|---|
| **CAA** | Asso Théâtre du Faubourg | CAA 2024 | 1 200 € | À facturer |
| **IR / IFI** | Famille Roussel | IR + IFI 2024 | 1 280 € | À facturer |
| **AGO** | SAS Atelier Verde | AGO 2024 | 480 € | À facturer |
| **Bilan** | SARL Mahé Conseil | Bilan 2024 | 2 200 € | À facturer |
| **Création** | SASU Olivier Photographe | Création 2025 | 1 200 € | À facturer |
| **Mission exc.** | EURL Architectures Lafont | Transfert siège | 850 € | À facturer |

D'un clic, on passe un item en "Facturée" → il disparaît de l'onglet À facturer, les KPI se mettent à jour, et le revenu remonte dans le dashboard finance.

---

## 5. Les détails qui font la différence

### 5.1 Pastilles rouges contextuelles à la racine du dossier

Sur chaque module (IR / CAA / Créations), un **point rouge à côté du nom du client** s'affiche :

- **Vue Base** : au moins une année du dossier est en À faire
- **Vue Année** : l'année sélectionnée est en À faire

Pas besoin de scanner la colonne statut : on repère le boulot d'un coup d'œil dès le nom.

### 5.2 Sidebar avec badges

Les rubriques **Créations · IR + IFI · CAA** affichent un badge rouge avec le compteur de dossiers à faire — directement dans le menu de gauche. Au premier coup d'œil sur l'app : `Créations 5 · IR + IFI 12 · CAA 3`.

### 5.3 Sélection Excel-style + copier-coller

Toutes les grilles supportent :

- Clic + Shift (étend), Cmd/Ctrl + clic (toggle), Cmd+A (tout)
- Cmd+C → TSV (collable dans Excel/Sheets), Cmd+V → applique un statut en bulk
- Navigation flèches haut/bas
- Bulk action bar sticky en bas avec preview

### 5.4 Mobile pensé sur mobile

- Sidebar drawer avec overlay
- Tap natif (le drag-drop est désactivé sur mobile : pas d'interférence iOS/Android)
- Tables converties en cards sur < 768 px
- Tracker : scroll horizontal préservé
- Kanban : snap-scroll horizontal

### 5.5 Mode sombre premium

Palette zinc/white équilibrée, pas un afterthought. Tous les composants — popovers, tableaux, chips, KPI, dashboard — sont validés en dark mode avec le bon contraste.

### 5.6 Performance

- Server Components Next.js 15 + queries Supabase parallélisées
- Index Postgres critiques sur les hot paths
- Cache Next.js Router + Data avec `revalidatePath` ciblé
- Région Vercel `fra1` (latence Paris ↔ Supabase Europe minimale)
- Loading skeletons sur les 6 routes les plus lourdes

### 5.7 Sécurité

- RLS Supabase activé sur toutes les tables
- Auth Supabase email + password (magic link disponible)
- Workflow d'approbation admin (un nouveau compte attend approbation avant accès)
- Aucun email exposé dans l'UI (déduit du nom uniquement)
- `.env.local` jamais committé, secrets côté server uniquement

---

## 6. Ce que MoonCRM remplace dans un cabinet typique

| Outil | Usage actuel | Remplacé par |
|---|---|---|
| **Notion** | Fiche client, suivi global | Fiche `/clients/[slug]` + obligations par exercice |
| **Excel "Suivi production"** | TVA, bilans, AGO par client/mois | Modules tracker `/obligations/[mission]` |
| **Excel "Facturation"** | Quoi facturer, quand, à qui | `/facturation` centralisée |
| **Trello / Notion Kanban** | Pipeline prospects | `/pipeline` Kanban natif |
| **Word + Mailto** | Lettres de mission | Génération LDM `.docx` en 1 clic |
| **Tally / Google Forms** | Onboarding nouveaux clients | Intégration Inbox Tally + rattachement auto |
| **Notion + Recherche** | "Combien j'ai facturé sur l'IR cette année ?" | Dashboard BI Recharts |

---

## 7. ROI estimé pour un cabinet de 80 clients

*Hypothèses : 1 EC + 1 collaborateur, ~80 clients TPE/PME, modèle récurrent.*

| Tâche | Avant | Avec MoonCRM | Gain mensuel |
|---|---|---|---|
| Compiler les factures à émettre | 2 h | 10 min | **1 h 50** |
| Rédaction LDM (8 LDM/mois) | 4 h | 30 min | **3 h 30** |
| Suivi TVA mensuelle | 3 h | 1 h | **2 h** |
| Reporting CA / activité associés | 2 h | 0 (live) | **2 h** |
| Recherche "où en est le dossier X" | 3 h | 30 min | **2 h 30** |
| **Total mensuel** | **14 h** | **2 h 10** | **≈ 12 h** |

À **~100 € HT / h chargée**, c'est **~1 200 € HT/mois de temps libéré par associé**, donc **~14 k€ HT/an**. Sans compter les erreurs évitées (facture oubliée, échéance ratée, doublons).

---

## 8. Roadmap (en cours)

- **Onboarding métier complet** : refonte du mapping `gestion_tns`, intégration paie
- **Mode multi-cabinet** : un seul login pour plusieurs structures
- **API publique** : webhooks pour intégrer outils tiers (Pennylane, Sellsy, etc.)
- **Module RH** : congés, notes de frais associés
- **App mobile native** (iOS/Android) — en réflexion

---

## En résumé

> **MoonCRM est conçu par un expert-comptable, pour des experts-comptables.**
> Pas un outil générique adapté, pas un Notion magnifié.
> Un vrai produit métier, avec le bon modèle de données, le bon vocabulaire,
> et les bons réflexes — pour qu'on arrête de faire du tableur et qu'on revienne au conseil.

---

*Démo personnalisée sur demande. Données et chiffres présentés : fictifs.*
*Contact · Benjamin Perez · MOON Expertise · Paris*
