-- Run once in Supabase SQL Editor after deploying this app update.
alter table public.persons add column if not exists patronymic text;

create table if not exists public.tree_photos (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  photo_path text not null,
  caption text not null default '',
  photo_date date,
  created_at timestamptz not null default now()
);
create index if not exists tree_photos_tree_id_idx on public.tree_photos(tree_id);
alter table public.tree_photos enable row level security;
drop policy if exists "Users manage photos in own trees" on public.tree_photos;
create policy "Users manage photos in own trees" on public.tree_photos for all to authenticated
using (exists (select 1 from public.family_trees t where t.id = tree_photos.tree_id and t.user_id = (select auth.uid())))
with check (exists (select 1 from public.family_trees t where t.id = tree_photos.tree_id and t.user_id = (select auth.uid())));

alter table public.family_trees add column if not exists share_name text;
alter table public.family_trees add column if not exists share_key_hash text;
create unique index if not exists family_trees_share_name_unique on public.family_trees(lower(share_name)) where share_name is not null;

create or replace function public.set_tree_share(p_tree_id uuid, p_share_name text, p_access_key text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Необходимо войти в аккаунт.'; end if;
  if length(trim(p_share_name)) < 2 or length(trim(p_share_name)) > 100 then raise exception 'Название должно содержать от 2 до 100 символов.'; end if;
  if length(p_access_key) < 6 or length(p_access_key) > 200 then raise exception 'Ключ должен содержать от 6 до 200 символов.'; end if;
  update public.family_trees set share_name = trim(p_share_name), share_key_hash = encode(digest(p_access_key, 'sha256'), 'hex')
  where id = p_tree_id and user_id = auth.uid();
  if not found then raise exception 'Древо не найдено или нет доступа.'; end if;
end; $$;
revoke all on function public.set_tree_share(uuid,text,text) from public;
grant execute on function public.set_tree_share(uuid,text,text) to authenticated;

create or replace function public.get_shared_tree(p_share_name text, p_access_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'name', t.name,
    'persons', coalesce((select jsonb_agg(to_jsonb(p) - 'photo_path' order by p.created_at) from public.persons p where p.tree_id = t.id), '[]'::jsonb)
  ) into result
  from public.family_trees t
  where lower(t.share_name) = lower(trim(p_share_name))
    and t.share_key_hash = encode(digest(p_access_key, 'sha256'), 'hex');
  return result;
end; $$;
revoke all on function public.get_shared_tree(text,text) from public;
grant execute on function public.get_shared_tree(text,text) to anon, authenticated;
