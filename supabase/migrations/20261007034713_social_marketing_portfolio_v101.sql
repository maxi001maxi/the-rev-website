begin;

create table if not exists public.social_marketing_inventory (
  inventory_key text primary key,
  label text not null,
  inventory_type text not null,
  description text not null,
  aliases text[] not null default '{}'::text[],
  preferred_channels text[] not null default '{}'::text[],
  status text not null default 'ACTIVE',
  priority_band text not null default 'CORE',
  evidence_policy text not null default 'FACT_OR_FIRST_PARTY',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_marketing_inventory_type_chk check (
    inventory_type in ('OFFERING','EXPERIENCE','PROOF','ACCESS','PROCESS','POSITIONING')
  ),
  constraint social_marketing_inventory_status_chk check (
    status in ('ACTIVE','INACTIVE')
  ),
  constraint social_marketing_inventory_priority_chk check (
    priority_band in ('CORE','SECONDARY','EXPERIMENTAL')
  )
);

create table if not exists public.social_portfolio_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  target_date date not null unique,
  business_phase text not null,
  status text not null default 'OPEN',
  portfolio_signal text,
  summary jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  source_context jsonb not null default '{}'::jsonb,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_portfolio_daily_snapshots_status_chk check (
    status in ('OPEN','READY','HOLD')
  ),
  constraint social_portfolio_daily_snapshots_signal_chk check (
    portfolio_signal is null or portfolio_signal in (
      'KNOWLEDGE_HEAVY','STORE_HEAVY','BALANCED','SPARSE','UNKNOWN'
    )
  )
);

create table if not exists public.social_portfolio_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.social_portfolio_daily_snapshots(id) on delete cascade,
  inventory_key text not null references public.social_marketing_inventory(inventory_key) on delete restrict,
  count_14d integer not null default 0,
  count_30d integer not null default 0,
  last_published_at timestamptz,
  exposure_signal text not null default 'UNKNOWN',
  recent_angles text[] not null default '{}'::text[],
  recent_formats text[] not null default '{}'::text[],
  source_post_ids uuid[] not null default '{}'::uuid[],
  performance_summary jsonb not null default '{}'::jsonb,
  strategic_signal text,
  confidence numeric not null default 0.5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(snapshot_id,inventory_key),
  constraint social_portfolio_snapshot_items_count_chk check (
    count_14d >= 0 and count_30d >= 0
  ),
  constraint social_portfolio_snapshot_items_exposure_chk check (
    exposure_signal in ('ABSENT_30D','ABSENT_14D','RECENT','FREQUENT_14D','UNKNOWN')
  ),
  constraint social_portfolio_snapshot_items_confidence_chk check (
    confidence >= 0 and confidence <= 1
  )
);

create index if not exists social_portfolio_snapshot_items_snapshot_idx
  on public.social_portfolio_snapshot_items(snapshot_id,exposure_signal,inventory_key);

create table if not exists public.social_opportunity_portfolio_rankings (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.social_portfolio_daily_snapshots(id) on delete cascade,
  opportunity_id uuid not null references public.social_opportunities(id) on delete cascade,
  inventory_keys text[] not null default '{}'::text[],
  priority_signal text not null default 'NEUTRAL',
  phase_fit text,
  recent_saturation text,
  underexposure_signal text,
  editorial_collision text,
  performance_prior text,
  asset_feasibility text,
  rationale text not null,
  confidence numeric not null default 0.5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(snapshot_id,opportunity_id),
  constraint social_opportunity_portfolio_rankings_priority_chk check (
    priority_signal in ('PROMOTE','NEUTRAL','DEMOTE','REVIEW')
  ),
  constraint social_opportunity_portfolio_rankings_confidence_chk check (
    confidence >= 0 and confidence <= 1
  )
);

create index if not exists social_opportunity_portfolio_rankings_snapshot_idx
  on public.social_opportunity_portfolio_rankings(snapshot_id,priority_signal,opportunity_id);

alter table public.social_director_daily_plans
  add column if not exists portfolio_snapshot_id uuid
  references public.social_portfolio_daily_snapshots(id) on delete set null;

alter table public.social_director_daily_plans
  add column if not exists portfolio_decision jsonb not null default '{}'::jsonb;

alter table public.social_marketing_inventory enable row level security;
alter table public.social_portfolio_daily_snapshots enable row level security;
alter table public.social_portfolio_snapshot_items enable row level security;
alter table public.social_opportunity_portfolio_rankings enable row level security;

revoke all on table public.social_marketing_inventory from anon, authenticated;
revoke all on table public.social_portfolio_daily_snapshots from anon, authenticated;
revoke all on table public.social_portfolio_snapshot_items from anon, authenticated;
revoke all on table public.social_opportunity_portfolio_rankings from anon, authenticated;

grant select,insert,update,delete on table public.social_marketing_inventory to service_role;
grant select,insert,update,delete on table public.social_portfolio_daily_snapshots to service_role;
grant select,insert,update,delete on table public.social_portfolio_snapshot_items to service_role;
grant select,insert,update,delete on table public.social_opportunity_portfolio_rankings to service_role;

insert into public.social_marketing_inventory (
  inventory_key,label,inventory_type,description,aliases,preferred_channels,status,priority_band,evidence_policy,metadata,updated_at
) values
  ('PERSONAL_TRAINING','パーソナルトレーニング','OFFERING',
   'THE REV.の中核サービス。トレーニングそのものだけでなく、個別判断・継続設計・動作改善まで含む。',
   array['パーソナル','パーソナルトレーニング','トレーニング','筋トレ'],
   array['REEL','STORIES','THREADS'],'ACTIVE','CORE','FACT_OR_FIRST_PARTY','{}'::jsonb,now()),
  ('BOXING','パーソナルボクシング','OFFERING',
   '初心者から経験者まで、構え・足運び・パンチ・ミット等を個別に進めるサービス。',
   array['ボクシング','ミット','パンチ','構え','足運び'],
   array['REEL','STORIES','THREADS'],'ACTIVE','CORE','FACT_OR_FIRST_PARTY','{}'::jsonb,now()),
  ('OXYGEN_ROOM','酸素ルーム','OFFERING',
   'THE REV.のコンディショニング設備・サービス。利用体験や位置づけを中心に扱う。',
   array['酸素ルーム','酸素','O2 BOX','O2BOX'],
   array['REEL','STORIES','THREADS'],'ACTIVE','CORE','FACT_OR_FIRST_PARTY','{}'::jsonb,now()),
  ('DENBA','DENBA Health','OFFERING',
   'THE REV.に設置するDENBA Health。設備カタログではなく利用場面・位置づけで扱う。',
   array['DENBA','DENBA Health','電場'],
   array['REEL','STORIES','THREADS'],'ACTIVE','CORE','FACT_OR_FIRST_PARTY','{}'::jsonb,now()),
  ('TRAINER_JUDGMENT','トレーナー判断','PROOF',
   '回数・負荷・内容をその日の状態に合わせて変える等、パーソナル指導の判断価値。',
   array['フォーム','回数','負荷','判断','その日の状態','個別対応'],
   array['REEL','STORIES','THREADS'],'ACTIVE','CORE','FIRST_PARTY_PREFERRED','{}'::jsonb,now()),
  ('STORE_SPACE_EQUIPMENT','店内・設備・空間','EXPERIENCE',
   '店舗空間、ラック、照明、導線など、THE REV.がどんな場所か理解するためのPhysical Evidence。',
   array['店内','設備','ラック','EVOLGEAR','空間','照明','店舗'],
   array['REEL','STORIES'],'ACTIVE','CORE','FACT_OR_FIRST_PARTY','{}'::jsonb,now()),
  ('FIRST_VISIT_EXPERIENCE','初回体験','EXPERIENCE',
   '初めて来る人が何をするか、何を準備するか、どんな流れかを理解するための体験情報。',
   array['初回体験','体験','初めて','カウンセリング'],
   array['REEL','STORIES','THREADS'],'ACTIVE','CORE','FACT_OR_FIRST_PARTY','{}'::jsonb,now()),
  ('ACCESS_CONVENIENCE','通いやすさ・利便性','ACCESS',
   '営業時間、導線、シャワー・更衣スペース等、生活に組み込みやすいかを理解するための価値。',
   array['通いやす','シャワー','更衣','仕事帰り','営業時間','アクセス'],
   array['REEL','STORIES','THREADS'],'ACTIVE','SECONDARY','FACT_OR_FIRST_PARTY','{}'::jsonb,now()),
  ('RECOVERY_CONDITIONING','回復・コンディショニング','POSITIONING',
   '鍛えるだけで終わらず、休養・回復・コンディショニングまで含むTHE REV.の位置づけ。',
   array['コンディショニング','回復','休む','休養','何もしない時間'],
   array['REEL','STORIES','THREADS'],'ACTIVE','CORE','FACT_OR_FIRST_PARTY','{}'::jsonb,now()),
  ('SESSION_PROCESS','セッションの進め方','PROCESS',
   'メニュー、時間、種目、進行を固定せず個別に調整するセッションProcess。',
   array['セッション','メニュー','30分','進め方','内容を変える','ルーティン'],
   array['REEL','STORIES','THREADS'],'ACTIVE','CORE','FIRST_PARTY_PREFERRED','{}'::jsonb,now())
on conflict (inventory_key) do update set
  label=excluded.label,
  inventory_type=excluded.inventory_type,
  description=excluded.description,
  aliases=excluded.aliases,
  preferred_channels=excluded.preferred_channels,
  status=excluded.status,
  priority_band=excluded.priority_band,
  evidence_policy=excluded.evidence_policy,
  metadata=excluded.metadata,
  updated_at=now();

commit;
