-- Assignment 2: second embedding model. gemini-embedding-001 (768 dims, normalised) beat gte-small on the paraphrase
-- dev set (expected passage in top 5: 12/14 vs 9/14), so hybrid search can use either column; Gemini is the default.

alter table docintel.passages add column if not exists embedding_gem extensions.vector(768);
create index if not exists passages_embedding_gem_idx on docintel.passages using hnsw (embedding_gem extensions.vector_cosine_ops);

drop function if exists public.docintel_search_hybrid(text, text[], text[], extensions.vector, boolean, int);

create or replace function public.docintel_search_hybrid(
  p_view text, p_terms text[], p_phrases text[], p_embedding extensions.vector, p_include_superseded boolean, p_limit int,
  p_model text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  q tsquery;
  part tsquery;
  t text;
  wanted text[] := case when p_include_superseded then array['current', 'superseded'] else array['current'] end;
  gem boolean := p_model = 'gemini';
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
      select p.pid, p.tsv, case when gem then p.embedding_gem::extensions.vector else p.embedding::extensions.vector end as emb
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
      select s.pid, 1 - (s.emb operator(extensions.<=>) p_embedding) as sim,
             row_number() over (order by s.emb operator(extensions.<=>) p_embedding) as vr
      from scope s where s.emb is not null and p_embedding is not null
      order by s.emb operator(extensions.<=>) p_embedding limit 30
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
             case when p_embedding is null then null
                  when gem and p.embedding_gem is not null then 1 - (p.embedding_gem::extensions.vector operator(extensions.<=>) p_embedding)
                  when not gem and p.embedding is not null then 1 - (p.embedding::extensions.vector operator(extensions.<=>) p_embedding)
             end as similarity
      from fused f
      join docintel.passages p on p.pid = f.pid
      join docintel.revisions r on r.doc_id = p.doc_id and r.revision = p.revision
      join docintel.documents d on d.doc_id = p.doc_id
      order by f.rrf desc
      limit least(greatest(coalesce(p_limit, 60), 1), 100)
    ) x), '[]'::jsonb);
end;
$$;

-- Gemini document vectors are computed by the Python pipeline (it holds the key) and stored through the edge function.
create or replace function public.docintel_set_gem_embeddings(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update docintel.passages t set embedding_gem = (x.embedding)::text::extensions.vector
    from jsonb_to_recordset(p) as x(pid text, embedding jsonb)
   where t.pid = x.pid;
  get diagnostics n = row_count;
  return jsonb_build_object('updated', n,
    'remaining', (select count(*) from docintel.passages where embedding_gem is null));
end;
$$;

-- Clear Gemini vectors when a passage's text changes (the gte column is already handled by docintel_publish).
create or replace function docintel.clear_stale_gem() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body or new.section_title is distinct from old.section_title then
    new.embedding_gem := null;
  end if;
  return new;
end;
$$;
drop trigger if exists passages_clear_stale_gem on docintel.passages;
create trigger passages_clear_stale_gem before update on docintel.passages
  for each row execute function docintel.clear_stale_gem();

-- Pipeline view reports vectors for both models.
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
                  and p.embedding_gem is not null) as embedded,
               (select count(*) from docintel.passages p where p.doc_id = r.doc_id and p.revision = r.revision
                  and p.embedding is not null) as embedded_gte
        from docintel.revisions r join docintel.documents d on d.doc_id = r.doc_id
        where (case when p_view = 'sim' then r.status_sim else r.status_main end) is not null) x), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('kind', k.kind, 'status', k.status, 'items', k.n))
                         from (select kind, status, count(*) as n from docintel.review_items
                               where view = p_view group by kind, status) k), '[]'::jsonb));
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.docintel_search_hybrid(text, text[], text[], extensions.vector, boolean, int, text)',
    'public.docintel_set_gem_embeddings(jsonb)',
    'public.docintel_pipeline(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke all on function docintel.clear_stale_gem() from public, anon, authenticated;
