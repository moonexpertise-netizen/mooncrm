-- Retire la colonne creation_sous_moon : champ "année de création sous MOON"
-- importé depuis Notion mais jamais utilisé dans l'app.
alter table public.clients drop column if exists creation_sous_moon;
