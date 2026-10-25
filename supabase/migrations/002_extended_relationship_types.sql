-- Run once in Supabase Dashboard -> SQL Editor to enable uncle/aunt and niece/nephew links.
-- Safe to run on an existing project.
alter table public.relationships drop constraint if exists relationships_type_check;
alter table public.relationships add constraint relationships_type_check
  check (type in ('parent', 'sibling', 'spouse', 'uncle_aunt', 'niece_nephew'));
