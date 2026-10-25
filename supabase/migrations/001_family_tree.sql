-- Run once in Supabase Dashboard -> SQL Editor.
-- Keep the photo bucket PRIVATE: the app stores object paths and uses signed URLs.

create extension if not exists pgcrypto;

create table if not exists public.family_trees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text,
  birth_date date,
  death_date date,
  birth_place text,
  photo_path text,
  biography text,
  gender text not null default 'unspecified'
    check (gender in ('male', 'female', 'other', 'unspecified')),
  created_at timestamptz not null default now(),
  check (birth_date is null or death_date is null or death_date >= birth_date)
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  from_person_id uuid not null references public.persons(id) on delete cascade,
  to_person_id uuid not null references public.persons(id) on delete cascade,
  type text not null check (type in ('parent', 'sibling', 'spouse')),
  created_at timestamptz not null default now(),
  check (from_person_id <> to_person_id),
  unique (tree_id, from_person_id, to_person_id, type)
);

create index if not exists persons_tree_id_idx on public.persons(tree_id);
create index if not exists relationships_tree_id_idx on public.relationships(tree_id);
create index if not exists relationships_from_idx on public.relationships(from_person_id);
create index if not exists relationships_to_idx on public.relationships(to_person_id);

alter table public.family_trees enable row level security;
alter table public.persons enable row level security;
alter table public.relationships enable row level security;

-- A signed-in user can access only trees they own.
drop policy if exists "Users manage their own family trees" on public.family_trees;
create policy "Users manage their own family trees"
on public.family_trees for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- A person can be accessed only when their parent tree belongs to the user.
drop policy if exists "Users manage persons in own trees" on public.persons;
create policy "Users manage persons in own trees"
on public.persons for all to authenticated
using (exists (
  select 1 from public.family_trees t
  where t.id = persons.tree_id and t.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.family_trees t
  where t.id = persons.tree_id and t.user_id = (select auth.uid())
));

-- Both ends of a relationship must belong to the same tree owned by the user.
drop policy if exists "Users manage relationships in own trees" on public.relationships;
create policy "Users manage relationships in own trees"
on public.relationships for all to authenticated
using (exists (
  select 1 from public.family_trees t
  where t.id = relationships.tree_id and t.user_id = (select auth.uid())
))
with check (
  exists (select 1 from public.family_trees t
    where t.id = relationships.tree_id and t.user_id = (select auth.uid()))
  and exists (select 1 from public.persons p
    where p.id = relationships.from_person_id and p.tree_id = relationships.tree_id)
  and exists (select 1 from public.persons p
    where p.id = relationships.to_person_id and p.tree_id = relationships.tree_id)
);

-- Private photo bucket, maximum 10 MB original upload, image MIME types only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-photos', 'family-photos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored under: <auth.uid()>/<person_uuid>/<filename>.jpg
drop policy if exists "Users read own family photos" on storage.objects;
create policy "Users read own family photos"
on storage.objects for select to authenticated
using (bucket_id = 'family-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users upload own family photos" on storage.objects;
create policy "Users upload own family photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'family-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users update own family photos" on storage.objects;
create policy "Users update own family photos"
on storage.objects for update to authenticated
using (bucket_id = 'family-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'family-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete own family photos" on storage.objects;
create policy "Users delete own family photos"
on storage.objects for delete to authenticated
using (bucket_id = 'family-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Notes:
-- * parent relationship direction: from_person_id = parent, to_person_id = child.
-- * sibling and spouse links are stored once; the UI draws the stored direction.
-- * Never put a Supabase service_role/secret key in the frontend.
