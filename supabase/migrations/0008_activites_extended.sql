-- Extension du référentiel d'activités. Garde les anciennes valeurs, ajoute
-- une liste plus large + "AUTRE" comme fallback.

alter type activite add value if not exists 'IMMOBILIER';
alter type activite add value if not exists 'RESTAURATION';
alter type activite add value if not exists 'TRANSPORT';
alter type activite add value if not exists 'BTP';
alter type activite add value if not exists 'INFORMATIQUE';
alter type activite add value if not exists 'COMMUNICATION';
alter type activite add value if not exists 'AGENCE WEB';
alter type activite add value if not exists 'DESIGN';
alter type activite add value if not exists 'MEDICAL';
alter type activite add value if not exists 'PARAMEDICAL';
alter type activite add value if not exists 'NOTAIRE';
alter type activite add value if not exists 'EXPERTISE COMPTABLE';
alter type activite add value if not exists 'AGRICULTURE';
alter type activite add value if not exists 'ASSOCIATION';
alter type activite add value if not exists 'INVESTISSEMENT';
alter type activite add value if not exists 'COIFFURE';
alter type activite add value if not exists 'ESTHETIQUE';
alter type activite add value if not exists 'BOULANGERIE';
alter type activite add value if not exists 'LOCATION MEUBLEE';
alter type activite add value if not exists 'AGENT IMMOBILIER';
alter type activite add value if not exists 'TRADUCTION';
alter type activite add value if not exists 'AUDIOVISUEL';
alter type activite add value if not exists 'MARKETING';
alter type activite add value if not exists 'BIEN-ETRE';
alter type activite add value if not exists 'CONSEIL EN GESTION';
alter type activite add value if not exists 'IMPORT-EXPORT';
alter type activite add value if not exists 'CRYPTO';
alter type activite add value if not exists 'AVOCAT FISCAL';
alter type activite add value if not exists 'KINESITHERAPEUTE';
alter type activite add value if not exists 'DENTISTE';
alter type activite add value if not exists 'PSYCHOLOGUE';
alter type activite add value if not exists 'INFIRMIER';
alter type activite add value if not exists 'PROFESSIONNEL LIBERAL';
alter type activite add value if not exists 'AUTRE';
