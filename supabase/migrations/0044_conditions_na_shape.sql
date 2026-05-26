-- ============================================================================
-- Refonte du format JSON des conditions_na sur onboarding_etape.
--
-- Avant (migration 0040) :
--   Tableau plat de conditions évaluées en OR, avec ops 'eq' | 'neq' | 'in' | 'not_in'.
--   Champ `reason` libre.
--   [
--     {"field":"origine","op":"not_in","value":["1 - Création"],"reason":"..."},
--     {"field":"gestion_tns","op":"neq","value":true,"reason":"..."}
--   ]
--
-- Après :
--   Objet avec un combinator AND/OR explicite, ops simplifiés à 'eq' | 'neq',
--   et multi-valeurs implicites OR au sein d'un item.
--   {
--     "combinator": "OR",
--     "items": [
--       {"field":"origine","op":"neq","values":["1 - Création"]},
--       {"field":"gestion_tns","op":"neq","values":[true]}
--     ]
--   }
--
-- Mapping legacy → nouveau :
--   op=eq, value=X         → op=eq, values=[X]
--   op=neq, value=X        → op=neq, values=[X]
--   op=in, value=[X,Y]     → op=eq, values=[X,Y]
--   op=not_in, value=[X,Y] → op=neq, values=[X,Y]
-- ============================================================================

-- Transforme les array non vides
update public.onboarding_etape
   set conditions_na = jsonb_build_object(
     'combinator', 'OR',
     'items', (
       select jsonb_agg(
         jsonb_build_object(
           'field', c->>'field',
           'op',
             case
               when c->>'op' in ('in', 'eq') then 'eq'
               when c->>'op' in ('not_in', 'neq') then 'neq'
               else 'eq'
             end,
           'values',
             case
               when c->>'op' in ('in', 'not_in') and jsonb_typeof(c->'value') = 'array' then c->'value'
               else jsonb_build_array(c->'value')
             end
         )
       )
       from jsonb_array_elements(conditions_na) c
     )
   )
 where jsonb_typeof(conditions_na) = 'array'
   and jsonb_array_length(conditions_na) > 0;

-- Transforme les array vides en objet vide
update public.onboarding_etape
   set conditions_na = '{"combinator":"OR","items":[]}'::jsonb
 where jsonb_typeof(conditions_na) = 'array'
   and jsonb_array_length(conditions_na) = 0;

-- Met à jour le commentaire de colonne
comment on column public.onboarding_etape.conditions_na is
  'Conditions de N/A automatique. Format :
    {
      "combinator": "AND" | "OR",
      "items": [
        { "field": "origine"|"gestion_tns"|"forme"|"activite",
          "op": "eq" | "neq",
          "values": [...] }
      ]
    }
  Sémantique :
    - op=eq matche si la valeur du client est ∈ values
    - op=neq matche si la valeur du client est ∉ values
    - combinator combine les items (OR : au moins un / AND : tous)';
