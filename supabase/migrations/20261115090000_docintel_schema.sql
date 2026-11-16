-- Assignment 2 (C16QS documentation intelligence). Lives in its own schema; Assignment 1 tables are untouched.
-- The schema is not exposed through the Data API. The edge function reaches it only through the
-- SECURITY DEFINER functions below, which only service_role may execute.

create schema if not exists docintel;
revoke all on schema docintel from public, anon, authenticated;
grant usage on schema docintel to service_role;

create table docintel.documents (
  doc_id text primary key,
  code text not null,
  title text not null,
  publisher text,
  doc_type text not null,
  scope text not null,
  module text not null
);

create table docintel.revisions (
  doc_id text not null references docintel.documents (doc_id) on delete cascade,
  revision text not null,
  revision_label text,
  revision_date date,
  date_source text,
  url text not null,
  host text,
  format text,
  file_sha256 text,
  text_sha256 text not null,
  acquired_via text,
  ingested_at timestamptz,
  simulated boolean not null default false,
  page_count int,
  label_offset int,
  notes text,
  status_main text check (status_main in ('current', 'superseded')),   -- null: not part of this view
  status_sim text check (status_sim in ('current', 'superseded')),
  published_at timestamptz not null default now(),
  primary key (doc_id, revision)
);

create table docintel.passages (
  pid text primary key,
  doc_id text not null,
  revision text not null,
  pdf_page int,
  printed_page text,
  section_no text,
  section_title text,
  anchor text,
  body text not null,
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(section_no, '') || ' ' || coalesce(section_title, '')), 'A') ||
    setweight(to_tsvector('english', body), 'B')) stored,
  foreign key (doc_id, revision) references docintel.revisions (doc_id, revision) on delete cascade
);
create index passages_tsv_idx on docintel.passages using gin (tsv);
create index passages_revision_idx on docintel.passages (doc_id, revision);

create table docintel.review_items (
  id bigint generated always as identity primary key,
  view text not null check (view in ('main', 'sim')),
  fingerprint text not null,
  kind text not null,
  severity text not null,
  topic text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'auto-closed')),
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (view, fingerprint)
);

create table docintel.band_claims (
  view text not null check (view in ('main', 'sim')),
  variant text not null,
  pid text not null,
  bands int[] not null,
  doc_id text not null,
  title text not null,
  revision text not null,
  printed_page text,
  section text,
  excerpt text,
  primary key (view, variant, pid)
);

create table docintel.runtime_keys (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  can_publish boolean not null default false,
  expires_at timestamptz
);

create table docintel.publish_runs (
  id bigint generated always as identity primary key,
  published_at timestamptz not null default now(),
  summary jsonb not null
);

do $$
declare t text;
begin
  foreach t in array array['documents','revisions','passages','review_items','band_claims','runtime_keys','publish_runs'] loop
    execute format('alter table docintel.%I enable row level security', t);
    execute format('revoke all on docintel.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Access functions -------------------------------------------------------------------------------

create or replace function public.docintel_key(p_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('can_publish', k.can_publish)
  from docintel.runtime_keys k
  where k.token_hash = p_hash and (k.expires_at is null or k.expires_at > now());
$$;

create or replace function public.docintel_search(
  p_view text, p_terms text[], p_phrases text[], p_include_superseded boolean, p_limit int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  q tsquery;
  part tsquery;
  t text;
  wanted text[] := case when p_include_superseded then array['current', 'superseded'] else array['current'] end;
begin
  foreach t in array coalesce(p_terms, '{}'::text[]) loop
    part := plainto_tsquery('english', t);
    if numnode(part) > 0 then q := case when q is null then part else q || part end; end if;
  end loop;
  foreach t in array coalesce(p_phrases, '{}'::text[]) loop
    part := phraseto_tsquery('english', t);
    if numnode(part) > 0 then q := case when q is null then part else q || part end; end if;
  end loop;
  if q is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.rank desc)
    from (
      select p.pid, p.doc_id, p.revision, p.pdf_page, p.printed_page, p.section_no, p.section_title, p.anchor,
             p.body as text, d.code, d.title, d.doc_type, d.scope as doc_scope, r.url, r.simulated,
             case when p_view = 'sim' then r.status_sim else r.status_main end as status,
             ts_rank(p.tsv, q) as rank
      from docintel.passages p
      join docintel.revisions r on r.doc_id = p.doc_id and r.revision = p.revision
      join docintel.documents d on d.doc_id = p.doc_id
      where p.tsv @@ q
        and (case when p_view = 'sim' then r.status_sim else r.status_main end) = any (wanted)
      order by rank desc
      limit least(greatest(coalesce(p_limit, 60), 1), 100)
    ) x), '[]'::jsonb);
end;
$$;

create or replace function public.docintel_passages(p_view text, p_pids text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  from (
    select p.pid, p.doc_id, p.revision, p.pdf_page, p.printed_page, p.section_no, p.section_title, p.anchor,
           p.body as text, d.code, d.title, d.doc_type, d.scope as doc_scope, r.url, r.simulated,
           case when p_view = 'sim' then r.status_sim else r.status_main end as status
    from docintel.passages p
    join docintel.revisions r on r.doc_id = p.doc_id and r.revision = p.revision
    join docintel.documents d on d.doc_id = p.doc_id
    where p.pid = any (p_pids)
  ) x;
$$;

create or replace function public.docintel_bundle(p_view text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'claims', coalesce((select jsonb_agg(to_jsonb(c) - 'view') from docintel.band_claims c where c.view = p_view), '[]'::jsonb),
    'review', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'severity', i.severity,
                         'topic', i.topic, 'summary', i.summary, 'details', i.details) order by i.id)
                        from docintel.review_items i where i.view = p_view and i.status = 'open'), '[]'::jsonb),
    'passage_docs', coalesce((select jsonb_object_agg(p.pid, p.doc_id) from docintel.passages p
                        where p.pid in (select i.details->>'referencing_pid' from docintel.review_items i
                                        where i.view = p_view and i.kind = 'outdated_reference')), '{}'::jsonb));
$$;

create or replace function public.docintel_sources(p_view text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.code, x.revision), '[]'::jsonb)
  from (
    select d.doc_id, d.code, d.title, d.publisher, d.doc_type, d.scope, r.revision, r.revision_label, r.revision_date,
           r.date_source, r.url, r.host, r.file_sha256, r.text_sha256, r.acquired_via, r.simulated, r.page_count,
           r.label_offset, r.notes, r.published_at,
           case when p_view = 'sim' then r.status_sim else r.status_main end as status,
           (select count(*) from docintel.passages p where p.doc_id = r.doc_id and p.revision = r.revision) as passages
    from docintel.revisions r join docintel.documents d on d.doc_id = r.doc_id
    where (case when p_view = 'sim' then r.status_sim else r.status_main end) is not null
  ) x;
$$;

create or replace function public.docintel_review(p_view text, p_all boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(i) - 'fingerprint' order by i.id), '[]'::jsonb)
  from docintel.review_items i
  where i.view = p_view and (p_all or i.status = 'open');
$$;

create or replace function public.docintel_set_review(p_id bigint, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rec docintel.review_items;
begin
  if p_status not in ('open', 'resolved') then
    raise exception 'invalid status';
  end if;
  update docintel.review_items
     set status = p_status,
         resolution = case when p_status = 'resolved' then left(p_note, 500) else null end,
         resolved_at = case when p_status = 'resolved' then now() else null end,
         updated_at = now()
   where id = p_id and status <> 'auto-closed'
  returning * into rec;
  return to_jsonb(rec) - 'fingerprint';
end;
$$;

-- Publishing (called by `python -m docintel publish` through the edge function, publish token only).
create or replace function public.docintel_publish(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p->>'kind';
  n int := 0;
begin
  if v_kind = 'documents' then
    insert into docintel.documents (doc_id, code, title, publisher, doc_type, scope, module)
    select x.doc_id, x.code, x.title, x.publisher, x.doc_type, x.scope, x.module
    from jsonb_to_recordset(p->'rows') as x(doc_id text, code text, title text, publisher text, doc_type text, scope text, module text)
    on conflict (doc_id) do update set code = excluded.code, title = excluded.title, publisher = excluded.publisher,
      doc_type = excluded.doc_type, scope = excluded.scope, module = excluded.module;
    get diagnostics n = row_count;
  elsif v_kind = 'revisions' then
    insert into docintel.revisions (doc_id, revision, revision_label, revision_date, date_source, url, host, format,
      file_sha256, text_sha256, acquired_via, ingested_at, simulated, page_count, label_offset, notes, status_main, status_sim)
    select x.doc_id, x.revision, x.revision_label, x.revision_date, x.date_source, x.url, x.host, x.format,
      x.file_sha256, x.text_sha256, x.acquired_via, x.ingested_at, coalesce(x.simulated, false), x.page_count,
      x.label_offset, x.notes, x.status_main, x.status_sim
    from jsonb_to_recordset(p->'rows') as x(doc_id text, revision text, revision_label text, revision_date date,
      date_source text, url text, host text, format text, file_sha256 text, text_sha256 text, acquired_via text,
      ingested_at timestamptz, simulated boolean, page_count int, label_offset int, notes text, status_main text, status_sim text)
    on conflict (doc_id, revision) do update set revision_label = excluded.revision_label,
      revision_date = excluded.revision_date, date_source = excluded.date_source, url = excluded.url,
      host = excluded.host, format = excluded.format, file_sha256 = excluded.file_sha256,
      text_sha256 = excluded.text_sha256, acquired_via = excluded.acquired_via, ingested_at = excluded.ingested_at,
      simulated = excluded.simulated, page_count = excluded.page_count, label_offset = excluded.label_offset,
      notes = excluded.notes, status_main = excluded.status_main, status_sim = excluded.status_sim, published_at = now();
    get diagnostics n = row_count;
  elsif v_kind = 'passages' then
    insert into docintel.passages (pid, doc_id, revision, pdf_page, printed_page, section_no, section_title, anchor, body)
    select x.pid, x.doc_id, x.revision, x.pdf_page, x.printed_page, x.section_no, x.section_title, x.anchor, x.body
    from jsonb_to_recordset(p->'rows') as x(pid text, doc_id text, revision text, pdf_page int, printed_page text,
      section_no text, section_title text, anchor text, body text)
    on conflict (pid) do update set doc_id = excluded.doc_id, revision = excluded.revision, pdf_page = excluded.pdf_page,
      printed_page = excluded.printed_page, section_no = excluded.section_no, section_title = excluded.section_title,
      anchor = excluded.anchor, body = excluded.body;
    get diagnostics n = row_count;
  elsif v_kind = 'reviews' then
    -- An expert's resolution survives re-publishing; everything else follows the local pipeline.
    insert into docintel.review_items (view, fingerprint, kind, severity, topic, summary, details, status)
    select p->>'view', x.fingerprint, x.kind, x.severity, x.topic, x.summary, x.details, x.status
    from jsonb_to_recordset(p->'rows') as x(fingerprint text, kind text, severity text, topic text, summary text,
      details jsonb, status text)
    on conflict (view, fingerprint) do update set kind = excluded.kind, severity = excluded.severity,
      topic = excluded.topic, summary = excluded.summary, details = excluded.details,
      status = case when docintel.review_items.status = 'resolved' then 'resolved' else excluded.status end,
      updated_at = now();
    get diagnostics n = row_count;
    update docintel.review_items i set status = 'auto-closed', updated_at = now()
     where i.view = p->>'view' and i.status = 'open'
       and not exists (select 1 from jsonb_array_elements(p->'rows') r where r->>'fingerprint' = i.fingerprint);
  elsif v_kind = 'claims' then
    delete from docintel.band_claims where view = p->>'view';
    insert into docintel.band_claims (view, variant, pid, bands, doc_id, title, revision, printed_page, section, excerpt)
    select p->>'view', x.variant, x.pid, array(select jsonb_array_elements_text(x.bands)::int), x.doc_id, x.title,
      x.revision, x.printed_page, x.section, x.excerpt
    from jsonb_to_recordset(p->'rows') as x(variant text, pid text, bands jsonb, doc_id text, title text,
      revision text, printed_page text, section text, excerpt text)
    on conflict do nothing;
    get diagnostics n = row_count;
  elsif v_kind = 'finish' then
    delete from docintel.passages where not (pid = any (array(select jsonb_array_elements_text(p->'pids'))));
    delete from docintel.revisions r where not exists (
      select 1 from jsonb_array_elements(p->'revisions') v where v->>0 = r.doc_id and v->>1 = r.revision);
    insert into docintel.publish_runs (summary) values (p->'summary');
    n := 1;
  else
    raise exception 'unknown publish kind';
  end if;
  return jsonb_build_object('kind', v_kind, 'rows', n);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.docintel_key(text)',
    'public.docintel_search(text, text[], text[], boolean, int)',
    'public.docintel_passages(text, text[])',
    'public.docintel_bundle(text)',
    'public.docintel_sources(text)',
    'public.docintel_review(text, boolean)',
    'public.docintel_set_review(bigint, text, text)',
    'public.docintel_publish(jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
