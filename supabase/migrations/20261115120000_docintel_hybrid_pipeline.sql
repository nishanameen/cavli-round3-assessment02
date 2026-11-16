-- Assignment 2: hybrid retrieval (pgvector + full text, fused with reciprocal rank fusion) and pipeline visibility.
-- Embeddings: Supabase gte-small (384 dimensions), produced by the cavli-docintel edge function.

alter table docintel.passages add column if not exists embedding extensions.vector(384);
alter table docintel.passages add column if not exists embedding_model text;
create index if not exists passages_embedding_idx on docintel.passages using hnsw (embedding extensions.vector_cosine_ops);
alter table docintel.revisions add column if not exists watch jsonb;     -- change-detection fingerprint taken at publish

-- Hybrid search: keyword candidates (ts_rank) and vector candidates (cosine) fused with RRF (k = 60).
create or replace function public.docintel_search_hybrid(
  p_view text, p_terms text[], p_phrases text[], p_embedding extensions.vector, p_include_superseded boolean, p_limit int)
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
  return coalesce((
    with scope as (
      select p.pid, p.tsv, p.embedding
      from docintel.passages p
      join docintel.revisions r on r.doc_id = p.doc_id and r.revision = p.revision
      where (case when p_view = 'sim' then r.status_sim else r.status_main end) = any (wanted)
    ),
    kw as (
      select s.pid, ts_rank(s.tsv, q) as rank, row_number() over (order by ts_rank(s.tsv, q) desc) as kr
      from scope s where q is not null and s.tsv @@ q
      order by rank desc limit 60
    ),
    vec as (
      select s.pid, row_number() over (order by s.embedding operator(extensions.<=>) p_embedding) as vr
      from scope s where s.embedding is not null and p_embedding is not null
      order by s.embedding operator(extensions.<=>) p_embedding limit 30
    ),
    fused as (
      select coalesce(kw.pid, vec.pid) as pid, coalesce(kw.rank, 0) as rank, kw.kr, vec.vr,
             coalesce(1.0 / (60 + kw.kr), 0) + coalesce(1.0 / (60 + vec.vr), 0) as rrf
      from kw full outer join vec on vec.pid = kw.pid
    )
    select jsonb_agg(to_jsonb(x) order by x.rrf desc)
    from (
      select p.pid, p.doc_id, p.revision, p.pdf_page, p.printed_page, p.section_no, p.section_title, p.anchor,
             p.body as text, d.code, d.title, d.doc_type, d.scope as doc_scope, r.url, r.simulated,
             case when p_view = 'sim' then r.status_sim else r.status_main end as status,
             f.rank, f.kr as keyword_rank, f.vr as vector_rank, f.rrf,
             case when p.embedding is null or p_embedding is null then null
                  else 1 - (p.embedding operator(extensions.<=>) p_embedding) end as similarity
      from fused f
      join docintel.passages p on p.pid = f.pid
      join docintel.revisions r on r.doc_id = p.doc_id and r.revision = p.revision
      join docintel.documents d on d.doc_id = p.doc_id
      order by f.rrf desc
      limit least(greatest(coalesce(p_limit, 60), 1), 100)
    ) x), '[]'::jsonb);
end;
$$;

create or replace function public.docintel_embed_queue(p_limit int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('pid', x.pid, 'text', x.text)), '[]'::jsonb)
  from (
    select p.pid, left(coalesce(p.section_title, '') || ': ' || p.body, 1200) as text
    from docintel.passages p where p.embedding is null order by p.pid limit least(greatest(p_limit, 1), 10)
  ) x;
$$;

create or replace function public.docintel_set_embeddings(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update docintel.passages t
     set embedding = (x.embedding)::text::extensions.vector, embedding_model = 'gte-small'
    from jsonb_to_recordset(p) as x(pid text, embedding jsonb)
   where t.pid = x.pid;
  get diagnostics n = row_count;
  return jsonb_build_object('updated', n,
    'remaining', (select count(*) from docintel.passages where embedding is null));
end;
$$;

create or replace function public.docintel_pipeline(p_view text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'runs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'published_at', r.published_at, 'summary', r.summary)
                                       order by r.id desc)
                      from (select * from docintel.publish_runs order by id desc limit 10) r), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(x) order by x.code, x.revision) from (
        select d.code, d.title, d.doc_type, r.doc_id, r.revision, r.revision_date, r.url, r.host, r.acquired_via, r.simulated,
               r.page_count, r.label_offset, r.file_sha256, r.text_sha256, r.watch, r.published_at,
               case when p_view = 'sim' then r.status_sim else r.status_main end as status,
               (select count(*) from docintel.passages p where p.doc_id = r.doc_id and p.revision = r.revision) as passages,
               (select count(*) from docintel.passages p where p.doc_id = r.doc_id and p.revision = r.revision
                  and p.embedding is not null) as embedded
        from docintel.revisions r join docintel.documents d on d.doc_id = r.doc_id
        where (case when p_view = 'sim' then r.status_sim else r.status_main end) is not null) x), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('kind', k.kind, 'status', k.status, 'items', k.n))
                         from (select kind, status, count(*) as n from docintel.review_items
                               where view = p_view group by kind, status) k), '[]'::jsonb));
$$;

-- Publishing now carries the change-detection fingerprint and drops stale embeddings when a passage's text changes.
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
      file_sha256, text_sha256, acquired_via, ingested_at, simulated, page_count, label_offset, notes, status_main, status_sim, watch)
    select x.doc_id, x.revision, x.revision_label, x.revision_date, x.date_source, x.url, x.host, x.format,
      x.file_sha256, x.text_sha256, x.acquired_via, x.ingested_at, coalesce(x.simulated, false), x.page_count,
      x.label_offset, x.notes, x.status_main, x.status_sim, x.watch
    from jsonb_to_recordset(p->'rows') as x(doc_id text, revision text, revision_label text, revision_date date,
      date_source text, url text, host text, format text, file_sha256 text, text_sha256 text, acquired_via text,
      ingested_at timestamptz, simulated boolean, page_count int, label_offset int, notes text, status_main text,
      status_sim text, watch jsonb)
    on conflict (doc_id, revision) do update set revision_label = excluded.revision_label,
      revision_date = excluded.revision_date, date_source = excluded.date_source, url = excluded.url,
      host = excluded.host, format = excluded.format, file_sha256 = excluded.file_sha256,
      text_sha256 = excluded.text_sha256, acquired_via = excluded.acquired_via, ingested_at = excluded.ingested_at,
      simulated = excluded.simulated, page_count = excluded.page_count, label_offset = excluded.label_offset,
      notes = excluded.notes, status_main = excluded.status_main, status_sim = excluded.status_sim,
      watch = coalesce(excluded.watch, docintel.revisions.watch), published_at = now();
    get diagnostics n = row_count;
  elsif v_kind = 'passages' then
    insert into docintel.passages (pid, doc_id, revision, pdf_page, printed_page, section_no, section_title, anchor, body)
    select x.pid, x.doc_id, x.revision, x.pdf_page, x.printed_page, x.section_no, x.section_title, x.anchor, x.body
    from jsonb_to_recordset(p->'rows') as x(pid text, doc_id text, revision text, pdf_page int, printed_page text,
      section_no text, section_title text, anchor text, body text)
    on conflict (pid) do update set doc_id = excluded.doc_id, revision = excluded.revision, pdf_page = excluded.pdf_page,
      printed_page = excluded.printed_page, section_no = excluded.section_no, section_title = excluded.section_title,
      anchor = excluded.anchor, body = excluded.body,
      embedding = case when docintel.passages.body = excluded.body
                        and docintel.passages.section_title is not distinct from excluded.section_title
                       then docintel.passages.embedding end,
      embedding_model = case when docintel.passages.body = excluded.body
                              and docintel.passages.section_title is not distinct from excluded.section_title
                             then docintel.passages.embedding_model end;
    get diagnostics n = row_count;
  elsif v_kind = 'reviews' then
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
    'public.docintel_search_hybrid(text, text[], text[], extensions.vector, boolean, int)',
    'public.docintel_embed_queue(int)',
    'public.docintel_set_embeddings(jsonb)',
    'public.docintel_pipeline(text)',
    'public.docintel_publish(jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
