-- Remember which side of each person node a relationship is attached to.
alter table public.relationships
  add column if not exists source_handle text default 'source-bottom',
  add column if not exists target_handle text default 'target-top';

alter table public.relationships
  drop constraint if exists relationships_source_handle_check,
  drop constraint if exists relationships_target_handle_check;
alter table public.relationships
  add constraint relationships_source_handle_check check (source_handle in ('source-top', 'source-bottom')),
  add constraint relationships_target_handle_check check (target_handle in ('target-top', 'target-bottom'));
