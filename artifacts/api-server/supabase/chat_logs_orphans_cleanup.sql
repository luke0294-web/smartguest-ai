-- Pulizia una tantum: conversazioni rimaste senza proprietà.
--
-- Prima di ottobre 2026, cancellare o rinominare una proprietà lasciava le sue
-- chat_logs sotto il vecchio slug (nessuna foreign key). Il codice ora le
-- sposta/cancella insieme alla proprietà; questo script elimina quelle rimaste
-- dal passato. Esegui in Supabase → SQL Editor.
--
-- 1) Controlla prima cosa verrebbe eliminato:
select property_slug, count(*) as conversazioni, max(created_at) as ultima
from public.chat_logs
where property_slug not in (select slug from public.properties)
group by property_slug
order by ultima desc;

-- 2) Se l'elenco è quello atteso, elimina:
-- delete from public.chat_logs
-- where property_slug not in (select slug from public.properties);
