/**
 * Import Notion CSV -> Supabase (Phase 2).
 *
 * Lecture du CSV exporté de la base Notion "Prospects Clients" et alimentation
 * relationnelle des tables clients / contacts / groupes / obligation_subscriptions
 * / obligations / onboarding_tasks.
 *
 * Lancement :
 *   npm run import-notion           # exécute l'import (purge + réinsertion)
 *   npm run import-notion -- --dry  # parse + analyse, n'écrit rien
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ----------------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Variables manquantes : NEXT_PUBLIC_SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY');
  console.error('Lance le script avec : node --env-file=.env.local ...');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CSV_PATH = path.resolve(
  'notion/raw/notion_export_2/Prospects Clients 143aff9738b480e39327fdd102f210eb_all.csv',
);

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

type TypeObligation =
  | 'TVA_MENSUELLE' | 'TVA_TRIMESTRIELLE' | 'TVA_ANNUELLE_CA12' | 'TVA_NON_SOUMIS'
  | 'TVS'
  | 'IS_ACOMPTE' | 'IS_SOLDE'
  | 'CVAE' | 'CVAE_ACOMPTE'
  | 'CFE'
  | 'DAS2' | 'DECL_2561' | 'DECL_2777' | 'OSS' | 'DES'
  | 'COMPTA' | 'LIASSE_PLAQUETTE' | 'AGO_DEPOT' | 'DEPOT_COMPTES'
  | 'FACTURATION_JUR'
  | 'ETAT_CREATION';

type OnboardingTaskKey =
  | 'tally_crea_pdc' | 'abo_moon' | 'mandat_moon' | 'mandat_impots' | 'impot_gouv'
  | 'cfe_1447' | 'acces_pennylane' | 'ob_pennylane'
  | 'depot_kbis_banque'
  | 'confrere' | 'reprise_compta'
  | 'affiliation_tns' | 'option_ir_is' | 'previ_tns';

type Cat = '2G' | '2C' | '2R' | '2T';
type StatutLogique = 'A_FAIRE' | 'EN_COURS' | 'TERMINE' | 'NON_APPLICABLE';

// ----------------------------------------------------------------------------
// MAPPINGS
// ----------------------------------------------------------------------------

// "<TYPE> (YYYY)" -> obligation par année (subscription + instance annuelle)
const YEARLY_PATTERNS: Array<{ regex: RegExp; type: TypeObligation }> = [
  { regex: /^Compta \((\d{4})\)$/, type: 'COMPTA' },
  { regex: /^Dépôt \((\d{4})\)$/, type: 'DEPOT_COMPTES' },
  { regex: /^CFE \((\d{4})\)$/, type: 'CFE' },
  { regex: /^CVAE \((\d{4})\)$/, type: 'CVAE' },
  { regex: /^Solde IS \((\d{4})\)$/, type: 'IS_SOLDE' },
  { regex: /^2561 \((\d{4})\)$/, type: 'DECL_2561' },
  { regex: /^2777 \((\d{4})\)$/, type: 'DECL_2777' },
  { regex: /^DAS2 \((\d{4})\)$/, type: 'DAS2' },
  { regex: /^Facturation Jur \((\d{4})\)$/, type: 'FACTURATION_JUR' },
  { regex: /^Création \((\d{4})\)$/, type: 'ETAT_CREATION' },
  { regex: /^CA12 \((\d{4})\)$/, type: 'TVA_ANNUELLE_CA12' },
];

// Colonnes "liste d'années" -> 1 subscription par année listée
const YEARLIST_PATTERNS: Array<{ col: string; type: TypeObligation }> = [
  { col: '1 - TVA Mensuelle', type: 'TVA_MENSUELLE' },
  { col: '1 - TVA Trimestrielle', type: 'TVA_TRIMESTRIELLE' },
  { col: '1 - TVA Annuelle', type: 'TVA_ANNUELLE_CA12' },
  { col: '1 - TVA Non soumis', type: 'TVA_NON_SOUMIS' },
  { col: '1 - Solde IS', type: 'IS_SOLDE' },
  { col: '1 - Acomptes CVAE', type: 'CVAE_ACOMPTE' },
  { col: '1 - DAS2', type: 'DAS2' },
  { col: '1 - DES', type: 'DES' },
  { col: '1 - OSS', type: 'OSS' },
  { col: '1 - AGO + dépôt', type: 'AGO_DEPOT' },
  { col: '1 - Liasse / Plaquette', type: 'LIASSE_PLAQUETTE' },
];

// Colonnes "TVAM 01-26", "OSS T1-26", etc. -> 1 instance par cellule remplie
type PeriodKind = 'month' | 'quarter-direct' | 'acompte-tvaa';
const SERIES_PATTERNS: Array<{ regex: RegExp; type: TypeObligation; kind: PeriodKind }> = [
  { regex: /^TVAM (\d{2})-(\d{2})$/, type: 'TVA_MENSUELLE', kind: 'month' },
  { regex: /^TVAT (\d{2})-(\d{2})$/, type: 'TVA_TRIMESTRIELLE', kind: 'month' },
  { regex: /^A-IS (\d{2})-(\d{2})$/, type: 'IS_ACOMPTE', kind: 'month' },
  { regex: /^A-CVAE (\d{2})-(\d{2})$/, type: 'CVAE_ACOMPTE', kind: 'month' },
  { regex: /^DES (\d{2})-(\d{2})$/, type: 'DES', kind: 'month' },
  { regex: /^OSS T(\d)-(\d{2})$/, type: 'OSS', kind: 'quarter-direct' },
  { regex: /^TVSM (\d{2})-(\d{2})$/, type: 'TVS', kind: 'month' },
  { regex: /^TVST (\d{2})-(\d{2})$/, type: 'TVS', kind: 'month' },
  { regex: /^A-TVAA (\d{2})-(\d{2})$/, type: 'TVA_ANNUELLE_CA12', kind: 'acompte-tvaa' },
];

const ONBOARDING_MAP: Record<string, { key: OnboardingTaskKey; cat: Cat }> = {
  '2G - Tally Créa / PDC': { key: 'tally_crea_pdc', cat: '2G' },
  '2G - Abo MOON': { key: 'abo_moon', cat: '2G' },
  '2G - Mandat MOON': { key: 'mandat_moon', cat: '2G' },
  '2G - Mandat Impôts': { key: 'mandat_impots', cat: '2G' },
  '2G - Impot.gouv': { key: 'impot_gouv', cat: '2G' },
  '2G - CFE 1447': { key: 'cfe_1447', cat: '2G' },
  '2G - Accès Pennylane': { key: 'acces_pennylane', cat: '2G' },
  '2G - OB Pennylane': { key: 'ob_pennylane', cat: '2G' },
  '2C - Dépôt KBIS Banque': { key: 'depot_kbis_banque', cat: '2C' },
  '2R - Confrère': { key: 'confrere', cat: '2R' },
  '2R - Reprise compta': { key: 'reprise_compta', cat: '2R' },
  '2T - Affiliation TNS': { key: 'affiliation_tns', cat: '2T' },
  "2T - Lettre d'option IR/IS": { key: 'option_ir_is', cat: '2T' },
  '2T - Prévi TNS': { key: 'previ_tns', cat: '2T' },
};

const FORME_VALUES = new Set([
  'ASSO', 'SA', 'SCI', 'EI', 'SARL', 'SAS', 'SELARL', 'SELAS',
  'SCM', 'SC', 'EURL', 'SASU', 'INDIV', 'AARPI', 'LMNP',
]);

const ACTIVITE_VALUES = new Set([
  'STARTUP', 'COMMERCE', 'FORMATION', 'HOLDING', 'LMNP', 'INFLUENCEUR',
  'COACHING SPORTIF', 'ARCHITECTE', 'SANTE', 'ENERGIES', 'CONSULTANT',
  'E-COMMERCE', 'PHOTOGRAPHE', 'ARTISAN', 'AVOCAT',
]);

const ORIGINE_VALUES = new Set([
  '1 - Création', '2 - Création par Tiers', '3 - Reprise',
  '4 - Reprise sans EC', 'Z - Sous-traitance',
]);

const PIPELINE_VALUES = new Set([
  '1 - PC Préparée', '5 - LDM Envoyée', '6 - LDM Signée',
  'Z - Interne', 'Z - Prospect perdu', 'Z - Résiliée',
]);

const VITESSE_TVA_VALUES = new Set([
  '1 - Express', '2 - Traitement + long', '3 - Tableau de bord',
]);

// ----------------------------------------------------------------------------
// PARSERS
// ----------------------------------------------------------------------------

const isBlank = (s: string | undefined | null): boolean =>
  s == null || s.trim() === '' || s.trim() === '-';

function parseEuro(s: string | undefined): number {
  if (isBlank(s)) return 0;
  const cleaned = s!.replace(/[€\s ]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function parseDateFr(s: string | undefined): string | null {
  if (isBlank(s)) return null;
  const m = s!.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseClotMonthDay(s: string | undefined): { jour: number; mois: number } | null {
  if (isBlank(s)) return null;
  const m = s!.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const jour = parseInt(m[1], 10);
  const mois = parseInt(m[2], 10);
  if (jour < 1 || jour > 31 || mois < 1 || mois > 12) return null;
  return { jour, mois };
}

function parseYearList(s: string | undefined): number[] {
  if (isBlank(s)) return [];
  return s!
    .split(/[,\s]+/)
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => n >= 2020 && n <= 2099);
}

function parseInt2(s: string | undefined): number | null {
  if (isBlank(s)) return null;
  const n = parseInt(s!.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

function enumOrNull<T>(s: string | undefined, allowed: Set<string>): T | null {
  if (isBlank(s)) return null;
  const v = s!.trim();
  return allowed.has(v) ? (v as T) : null;
}

function cleanText(s: string | undefined): string | null {
  if (isBlank(s)) return null;
  return s!.trim();
}

// Pappers / INPI : la cellule contient soit un emoji + libellé ("🏢 Pappers")
// soit une URL. Notion exporte seulement le libellé, l'URL est dans l'export
// HTML. Pour l'instant on conserve la cellule brute si non vide.
function cleanLinkCell(s: string | undefined): string | null {
  if (isBlank(s)) return null;
  const v = s!.trim();
  // Heuristique : si ça ressemble à une URL, on garde, sinon on met null
  if (/^https?:\/\//i.test(v)) return v;
  // On garde quand même le libellé (info "présence d'un lien" préservée)
  return v;
}

// Construit la période string à partir d'une cellule série
function buildPeriod(kind: PeriodKind, mm: string, yy: string): string {
  const year = 2000 + parseInt(yy, 10);
  if (kind === 'quarter-direct') {
    // OSS T1-26 -> "T1-2026"
    return `T${mm}-${year}`;
  }
  if (kind === 'acompte-tvaa') {
    // A-TVAA 07-25 -> "A-07-2025"
    return `A-${mm}-${year}`;
  }
  // month : "2026-01"
  return `${year}-${mm}`;
}

// Construit la période pour TVAT (trimestre déduit du mois)
function buildPeriodTVAT(mm: string, yy: string): string {
  const year = 2000 + parseInt(yy, 10);
  const month = parseInt(mm, 10);
  const q = Math.ceil(month / 3); // 03 -> Q1, 06 -> Q2, etc.
  return `T${q}-${year}`;
}

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------

type StatusKey = string; // `${scope}|${type_code}|${libelle}`
type StatusMap = Map<StatusKey, StatutLogique>;

async function loadStatusOptions(): Promise<StatusMap> {
  const { data, error } = await sb
    .from('status_options')
    .select('scope, type_code, libelle, statut_logique');
  if (error) throw error;
  const m: StatusMap = new Map();
  for (const r of data ?? []) {
    m.set(`${r.scope}|${r.type_code}|${r.libelle}`, r.statut_logique as StatutLogique);
  }
  return m;
}

function mapStatus(
  statusMap: StatusMap,
  scope: 'obligation' | 'onboarding',
  typeCode: string,
  libelle: string,
): { statut_logique: StatutLogique; statut_detail: string } {
  const key = `${scope}|${typeCode}|${libelle}`;
  const known = statusMap.get(key);
  if (known) return { statut_logique: known, statut_detail: libelle };

  // Heuristiques de secours pour les libellés non seedés
  const l = libelle.toLowerCase();
  if (l.includes('terminé') || l.includes('déposé') || l.includes('validé')
      || l.includes('facturé') || l.includes('signé') || l.includes('actif')
      || l.includes('rempli') || l.startsWith('ok')) {
    return { statut_logique: 'TERMINE', statut_detail: libelle };
  }
  if (l.startsWith('n/a') || l === 'n/a' || l.includes('non soumis')
      || l.includes('dispense') || l.includes('pas d\'avis')) {
    return { statut_logique: 'NON_APPLICABLE', statut_detail: libelle };
  }
  if (l.includes('en cours') || l.includes('transmis') || l.includes('plaquette')
      || l.includes('demand')) {
    return { statut_logique: 'EN_COURS', statut_detail: libelle };
  }
  return { statut_logique: 'A_FAIRE', statut_detail: libelle };
}

async function purgeData() {
  console.log('Purge des tables...');
  // Order matters because of FKs. client_contacts a une clé composite,
  // toutes les autres tables ont un id uuid.
  const tables: Array<{ name: string; filterCol: string }> = [
    { name: 'obligations', filterCol: 'id' },
    { name: 'obligation_subscriptions', filterCol: 'id' },
    { name: 'onboarding_tasks', filterCol: 'id' },
    { name: 'client_contacts', filterCol: 'client_id' },
    { name: 'clients', filterCol: 'id' },
    { name: 'contacts', filterCol: 'id' },
    { name: 'groupes', filterCol: 'id' },
  ];
  for (const { name, filterCol } of tables) {
    const { error } = await sb
      .from(name)
      .delete()
      .neq(filterCol, '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`Erreur purge ${name}:`, error.message);
      throw error;
    }
  }
  console.log('  -> tables vidées');
}

async function ensureGroupe(nom: string, cache: Map<string, string>): Promise<string> {
  if (cache.has(nom)) return cache.get(nom)!;
  const { data, error } = await sb
    .from('groupes')
    .insert({ nom })
    .select('id')
    .single();
  if (error) throw error;
  cache.set(nom, data!.id);
  return data!.id;
}

async function ensureContact(nom: string, cache: Map<string, string>): Promise<string> {
  if (cache.has(nom)) return cache.get(nom)!;
  const { data, error } = await sb
    .from('contacts')
    .insert({ nom })
    .select('id')
    .single();
  if (error) throw error;
  cache.set(nom, data!.id);
  return data!.id;
}

interface ImportStats {
  clients: number;
  contacts: number;
  groupes: number;
  subscriptions: number;
  obligations: number;
  onboarding: number;
  skippedColumns: Set<string>;
  unknownStatuses: Set<string>;
}

async function importRow(
  row: Record<string, string>,
  statusMap: StatusMap,
  groupesCache: Map<string, string>,
  contactsCache: Map<string, string>,
  stats: ImportStats,
) {
  const denomination = cleanText(row['0 - Dénomination']);
  if (!denomination) return; // ligne vide

  // -------- groupe
  const groupeNom = cleanText(row['Groupe']);
  let groupe_id: string | null = null;
  if (groupeNom && groupeNom.toLowerCase() !== 'n/a') {
    groupe_id = await ensureGroupe(groupeNom, groupesCache);
  }

  // -------- clôture
  const clot = parseClotMonthDay(row['0 - Clot']);

  // -------- pipeline / origine / régime
  const pipeline = enumOrNull<string>(row['0 - PC > LDM'], PIPELINE_VALUES);
  const origine = enumOrNull<string>(row['0 - Origine'], ORIGINE_VALUES);
  const regime = row['1 - Régime']?.trim() === 'IS' ? 'IS'
               : row['1 - Régime']?.trim() === 'IR' ? 'IR' : null;
  const forme = enumOrNull<string>(row['0 - Forme'], FORME_VALUES);
  const activite = enumOrNull<string>(row['0 - Activité'], ACTIVITE_VALUES);
  const vitesseTva = enumOrNull<string>(row['VitesseTVA'], VITESSE_TVA_VALUES);

  // -------- insert client
  const clientPayload = {
    denomination,
    siren: cleanText(row['0 - Siren']),
    pappers_url: cleanLinkCell(row['Pappers']),
    inpi_url: cleanLinkCell(row['INPI']),
    forme,
    activite,
    email: cleanText(row['E-mail']),
    origine,
    regime,
    jour_cloture: clot?.jour ?? null,
    mois_cloture: clot?.mois ?? null,
    mois_signature: parseDateFr(row['Mois signature']),
    groupe_id,
    pipeline_statut: pipeline,
    vitesse_tva: vitesseTva,
    note_pdc: cleanText(row['0 - Note PDC']),
    ldm_social: cleanText(row['0 - Ldm social']),
    // mrr/arr sont des colonnes GENERATED depuis :
    //   honoraires_compta (mensuel, Notion "€ - MRR (M€)")
    //   forfait_bilan     (annuel, Notion "€ - Bilan (A€)")
    //   forfait_pilotage  (mensuel, Notion "€ - Dash MRR (M€)")
    //   honoraires_jur    (annuel, Notion "€ - Jur (A€)")
    honoraires_compta: parseEuro(row['€ - MRR (M€)']),
    forfait_bilan: parseEuro(row['€ - Bilan (A€)']),
    forfait_pilotage: parseEuro(row['€ - Dash MRR (M€)']),
    honoraires_jur: parseEuro(row['€ - Jur (A€)']),
    exceptionnel: parseEuro(row['€ - Exc (A€)']),
  };

  let client_id: string;
  if (DRY_RUN) {
    client_id = '00000000-0000-0000-0000-000000000000';
  } else {
    const { data, error } = await sb
      .from('clients')
      .insert(clientPayload)
      .select('id')
      .single();
    if (error) {
      console.error(`Erreur client "${denomination}":`, error.message);
      return;
    }
    client_id = data!.id;
  }
  stats.clients++;

  // -------- interlocuteur(s)
  const interlocs = cleanText(row['0 - Interlocuteur']);
  if (interlocs) {
    const noms = interlocs.split(/[,;\/]| et /i).map((s) => s.trim()).filter(Boolean);
    for (const nom of noms) {
      if (DRY_RUN) continue;
      const contact_id = await ensureContact(nom, contactsCache);
      const { error } = await sb
        .from('client_contacts')
        .insert({ client_id, contact_id })
        .select();
      if (error && !error.message.includes('duplicate')) {
        console.error(`Erreur client_contact ${denomination} <-> ${nom}:`, error.message);
      }
    }
    stats.contacts += noms.length;
  }

  // -------- abonnements depuis colonnes "liste d'années"
  // Map (type, annee) -> subscription_id pour relier les instances ensuite
  const subKey = (t: TypeObligation, y: number) => `${t}|${y}`;
  const subIds = new Map<string, string>();

  async function ensureSub(type: TypeObligation, annee: number): Promise<string> {
    const k = subKey(type, annee);
    if (subIds.has(k)) return subIds.get(k)!;
    if (DRY_RUN) {
      subIds.set(k, '00000000-0000-0000-0000-000000000000');
      return '00000000-0000-0000-0000-000000000000';
    }
    const { data, error } = await sb
      .from('obligation_subscriptions')
      .insert({ client_id, type, annee })
      .select('id')
      .single();
    if (error) {
      console.error(`Erreur sub ${denomination} ${type} ${annee}:`, error.message);
      throw error;
    }
    subIds.set(k, data!.id);
    stats.subscriptions++;
    return data!.id;
  }

  for (const { col, type } of YEARLIST_PATTERNS) {
    const years = parseYearList(row[col]);
    for (const y of years) await ensureSub(type, y);
  }

  // -------- obligations annuelles "<TYPE> (YYYY)"
  for (const [colname, value] of Object.entries(row)) {
    if (isBlank(value)) continue;
    for (const { regex, type } of YEARLY_PATTERNS) {
      const m = colname.match(regex);
      if (!m) continue;
      const annee = parseInt(m[1], 10);
      const sub_id = await ensureSub(type, annee);
      const status = mapStatus(statusMap, 'obligation', type, value);
      if (status.statut_detail === value
          && !statusMap.has(`obligation|${type}|${value}`)) {
        stats.unknownStatuses.add(`${type} | ${value}`);
      }
      if (!DRY_RUN) {
        const { error } = await sb.from('obligations').insert({
          subscription_id: sub_id,
          client_id,
          type,
          periode: String(annee),
          annee,
          statut_logique: status.statut_logique,
          statut_detail: status.statut_detail,
        });
        if (error) console.error(`Erreur obligation ${denomination} ${type} ${annee}:`, error.message);
      }
      stats.obligations++;
      break;
    }
  }

  // -------- obligations séries (TVAM 01-26, etc.)
  for (const [colname, value] of Object.entries(row)) {
    if (isBlank(value)) continue;
    for (const { regex, type, kind } of SERIES_PATTERNS) {
      const m = colname.match(regex);
      if (!m) continue;
      const mm = m[1];
      const yy = m[2];
      const annee = 2000 + parseInt(yy, 10);
      const periode = type === 'TVA_TRIMESTRIELLE'
        ? buildPeriodTVAT(mm, yy)
        : buildPeriod(kind, mm, yy);
      const sub_id = await ensureSub(type, annee);
      const status = mapStatus(statusMap, 'obligation', type, value);
      if (!statusMap.has(`obligation|${type}|${value}`)) {
        stats.unknownStatuses.add(`${type} | ${value}`);
      }
      if (!DRY_RUN) {
        const { error } = await sb.from('obligations').insert({
          subscription_id: sub_id,
          client_id,
          type,
          periode,
          annee,
          statut_logique: status.statut_logique,
          statut_detail: status.statut_detail,
        });
        if (error) console.error(`Erreur obligation ${denomination} ${type} ${periode}:`, error.message);
      }
      stats.obligations++;
      break;
    }
  }

  // -------- onboarding tasks
  for (const [colname, mapping] of Object.entries(ONBOARDING_MAP)) {
    const value = row[colname];
    if (isBlank(value)) continue;
    const status = mapStatus(statusMap, 'onboarding', mapping.key, value!);
    if (!statusMap.has(`onboarding|${mapping.key}|${value}`)) {
      stats.unknownStatuses.add(`${mapping.key} | ${value}`);
    }
    if (!DRY_RUN) {
      const { error } = await sb.from('onboarding_tasks').insert({
        client_id,
        task_key: mapping.key,
        categorie: mapping.cat,
        statut_logique: status.statut_logique,
        statut_detail: status.statut_detail,
      });
      if (error) console.error(`Erreur onboarding ${denomination} ${mapping.key}:`, error.message);
    }
    stats.onboarding++;
  }

  // Repérer les colonnes non mappées (pour stats)
  const knownStatic = new Set([
    '0 - Dénomination', '0 - Activité', '0 - Clot', '0 - Clôture',
    '0 - Création sous MOON', '0 - Forme', '0 - Interlocuteur', '0 - Intéressé ?',
    '0 - Ldm social', '0 - Note PDC', '0 - Origine', '0 - PC > LDM', '0 - Siren',
    '1 - Régime', '1 - Type TVA',
    '2G - Statut Auto', '2T - Statut Auto TNS',
    'Collaborateur', 'E-mail', 'Groupe', 'INPI', 'Mois signature', 'Pappers', 'VitesseTVA',
    '€ - ARR (A€)', '€ - Bilan (A€)', '€ - Dash MRR (M€)', '€ - Exc (A€)',
    '€ - Jur (A€)', '€ - MRR (M€)',
  ]);

  for (const colname of Object.keys(row)) {
    if (knownStatic.has(colname)) continue;
    if (colname in ONBOARDING_MAP) continue;
    if (YEARLIST_PATTERNS.find((p) => p.col === colname)) continue;
    if (YEARLY_PATTERNS.find((p) => p.regex.test(colname))) continue;
    if (SERIES_PATTERNS.find((p) => p.regex.test(colname))) continue;
    stats.skippedColumns.add(colname);
  }
}

async function main() {
  console.log(`\n=== Import Notion -> Supabase ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  console.log('Lecture CSV :', CSV_PATH);
  const csvRaw = readFileSync(CSV_PATH, 'utf8');
  const rows: Record<string, string>[] = parse(csvRaw, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: false,
  });
  console.log(`  -> ${rows.length} lignes\n`);

  console.log('Chargement status_options...');
  const statusMap = await loadStatusOptions();
  console.log(`  -> ${statusMap.size} libellés seedés\n`);

  if (!DRY_RUN) {
    await purgeData();
  }

  const stats: ImportStats = {
    clients: 0, contacts: 0, groupes: 0,
    subscriptions: 0, obligations: 0, onboarding: 0,
    skippedColumns: new Set(),
    unknownStatuses: new Set(),
  };
  const groupesCache = new Map<string, string>();
  const contactsCache = new Map<string, string>();

  console.log('Import des clients...');
  let idx = 0;
  for (const row of rows) {
    idx++;
    try {
      await importRow(row, statusMap, groupesCache, contactsCache, stats);
      if (idx % 10 === 0) console.log(`  ${idx}/${rows.length}`);
    } catch (e) {
      console.error(`Erreur ligne ${idx} (${row['0 - Dénomination']}):`, (e as Error).message);
    }
  }

  stats.groupes = groupesCache.size;
  stats.contacts = contactsCache.size;

  console.log('\n=== Récapitulatif ===');
  console.log(`Clients         : ${stats.clients}`);
  console.log(`Groupes         : ${stats.groupes}`);
  console.log(`Contacts        : ${stats.contacts}`);
  console.log(`Subscriptions   : ${stats.subscriptions}`);
  console.log(`Obligations     : ${stats.obligations}`);
  console.log(`Onboarding tasks: ${stats.onboarding}`);

  if (stats.skippedColumns.size) {
    console.log('\nColonnes non mappées :');
    for (const c of [...stats.skippedColumns].sort()) console.log(`  - ${c}`);
  }

  if (stats.unknownStatuses.size) {
    console.log('\nLibellés de statut non seedés (mappés par heuristique) :');
    for (const s of [...stats.unknownStatuses].sort().slice(0, 30)) console.log(`  - ${s}`);
    if (stats.unknownStatuses.size > 30) console.log(`  ... +${stats.unknownStatuses.size - 30}`);
  }

  console.log(`\n${DRY_RUN ? 'Dry run terminé.' : 'Import terminé.'}`);
}

main().catch((e) => {
  console.error('\nErreur fatale :', e);
  process.exit(1);
});
