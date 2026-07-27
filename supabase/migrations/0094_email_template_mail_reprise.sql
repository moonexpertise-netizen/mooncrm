-- ============================================================================
-- Ajoute la clé 'mail_reprise' aux modèles système d'e-mails.
--
-- C'est le mail adressé au CONFRÈRE sortant, ouvert directement dans Outlook
-- (mailto) au moment de générer la lettre de reprise déontologique. Il rejoint
-- les 2 guides existants dans /parametrage/emails pour devenir editable.
--
-- Pas de seed : si la ligne est absente, le code retombe sur le défaut de
-- lib/email-templates-defaults.ts et la crée au 1er enregistrement.
-- ============================================================================

alter table public.email_templates
  drop constraint if exists email_templates_key_check;

alter table public.email_templates
  add constraint email_templates_key_check
  check (key in ('guide_creation', 'guide_reprise', 'mail_reprise'));
