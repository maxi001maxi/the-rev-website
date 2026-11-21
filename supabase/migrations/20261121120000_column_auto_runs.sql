-- コラム朝の自動実行（column-auto v1）の実行記録と学習状態。
-- サービスロール専用（RLS有効・ポリシーなし）。GSCの数字や原稿はここに置き、公開リポジトリには書かない。

create table if not exists public.column_auto_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique,              -- 記事の対象日（JST）。1日1本の二重作成防止キー
  status text not null default 'STARTED',     -- STARTED / WRITING / IMAGE_QUEUED / FINALIZING / DELIVERED / FAILED / STOPPED_BUDGET / SKIPPED
  attempt integer not null default 1,         -- 実行回数（再実行は1回まで = 最大2）
  slug text,
  topic jsonb,                                -- 選定の根拠（配分・実績・候補・選ばなかった理由）
  article jsonb,                              -- 合格した原稿（再実行時に書き直さないため）
  qc jsonb,                                   -- 品質チェックの合否と理由
  image jsonb,                                -- 画像ジョブ・QC結果
  delivery jsonb,                             -- 受け渡し先（Issue URL など）
  cost jsonb,                                 -- APIごとの費用明細
  cost_jpy numeric(10,2) not null default 0,
  error text,
  error_kind text,                            -- TRANSIENT / TERMINAL
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.column_auto_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.column_auto_runs enable row level security;
alter table public.column_auto_state enable row level security;

revoke all on public.column_auto_runs from anon, authenticated;
revoke all on public.column_auto_state from anon, authenticated;
