-- THE REV. COLUMN Category Architecture v1.0
-- admin_article_drafts.category を 5 カテゴリー（training / health / gym-guide / recovery / boxing）へ移行する。
-- 正本: assets/js/blog-taxonomy.mjs。body-knowledge は廃止。古いmigrationは編集しない。
-- 単一トランザクション。分類できない body-knowledge 行があれば推測せず例外で全体をロールバックする。

begin;

-- 1. category を参照する既存CHECK制約を名前に依存せず外す
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.admin_article_drafts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
      and pg_get_constraintdef(oid) not ilike '%category_label%'
  loop
    execute format('alter table public.admin_article_drafts drop constraint %I', c.conname);
  end loop;
end $$;

-- 2. 既存行の再分類（slug正本 = Category Architecture v1.0 Section 5）
with mapping(slug, new_category) as (
  values
    ('beginner-strength-training-few-exercises-frequency', 'training'),
    ('muscle-mass-not-increasing-progress-signs',          'training'),
    ('strength-training-to-failure-when-to-stop',          'training'),
    ('training-how-hard-to-push',                          'training'),
    ('self-training-form-check',                           'training'),
    ('after-work-tired-strength-training',                 'health'),
    ('health-check-results-before-starting-exercise',      'health'),
    ('kenshin-ketsuatsu-takame-kinntore-hajimekata',       'health'),
    ('exercise-start-fatigue-anxiety-next-day-plan',       'gym-guide'),
    ('no-time-for-gym-starting-friction',                  'gym-guide'),
    ('personal-gym-trial-checkpoints',                     'gym-guide'),
    ('personal-training-frequency',                        'gym-guide'),
    ('shinomiya-gym-erabikata-dosen',                      'gym-guide'),
    ('shinomiya-personal-gym-reservation-facility-the-rev','gym-guide'),
    ('oxygen-room-what-is-it',                             'recovery'),
    ('oxygen-room-how-to-spend-time',                      'recovery'),
    ('denba-health-what-is-it-the-rev',                    'recovery'),
    ('denba-electric-potential-space-radio-wave-difference','recovery'),
    ('boxing-beginner-first-step',                         'boxing')
)
update public.admin_article_drafts d
set category = m.new_category
from mapping m
where d.slug = m.slug;

-- 3. 上記mappingに無い body-knowledge 行は推測せず中断（個別に内容を確認して分類すること）
do $$
declare
  leftovers text;
begin
  select string_agg(coalesce(nullif(slug, ''), id::text), ', ')
    into leftovers
  from public.admin_article_drafts
  where category = 'body-knowledge';
  if leftovers is not null then
    raise exception 'body-knowledge rows without a taxonomy decision: %. Classify them explicitly and rerun.', leftovers;
  end if;
end $$;

-- 4. category_label を正本表記へ統一
update public.admin_article_drafts
set category_label = case category
  when 'training'  then 'TRAINING'
  when 'health'    then 'HEALTH'
  when 'gym-guide' then 'GYM GUIDE'
  when 'recovery'  then 'RECOVERY'
  when 'boxing'    then 'BOXING'
  else category_label
end
where category is not null;

-- 5. 新CHECK制約（nullは従来どおり許容。新規入力は5カテゴリーのみ）
alter table public.admin_article_drafts
  add constraint admin_article_drafts_category_check
  check (category is null or category in ('training', 'health', 'gym-guide', 'recovery', 'boxing'));

commit;

-- 検証クエリ（適用後に手動実行）:
--   select category, count(*) from public.admin_article_drafts group by 1 order by 1;
--   select count(*) from public.admin_article_drafts where category = 'body-knowledge';  -- 0
