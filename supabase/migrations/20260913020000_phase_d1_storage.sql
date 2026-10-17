-- THE REV. Editorial Console — Phase D.1: 画像アップロード（Supabase Storage）
--
-- 役割：
--   Adminから記事のサムネイル・OGP画像・本文中の画像をアップロードするための
--   Supabase Storageバケットと、そのアクセスポリシーを作成する。
--
-- 設計方針（Phase D.1の要件どおり）：
--   - 記事MarkdownのSource of Truthは引き続きGitHub。画像ファイルのみSupabase Storageに置く。
--   - service_role は使用しない。ブラウザから既存のSupabase session（publishable key + ユーザーの
--     アクセストークン）で直接Storageへアップロードする。認可の実体はこのファイルのRLSが担う。
--   - Storageのオブジェクトパスは `blog/{draft-id}/{filename}` に統一する（Admin側のコードで強制）。
--     draft-idはUUID（ユーザー入力ではない）、filenameもAdmin側で生成する値のみを許可し、
--     ユーザー入力の生ファイル名は使用しない（パストラバーサル対策）。
--   - 読み取りはバケット全体を公開（public）にする。公開Blogページの<img>から直接参照できる
--     必要があり、Phase D.1はDraft単位でread可否を出し分ける仕組み（例:
--     admin_article_drafts.source_pathの有無でread可否を分岐するポリシー）までは持たない
--     （既存のBlog画像 /assets/images/blog/*.jpg も同様に無認証で誰でも読めるため、
--     整合する設計と判断）。書き込み（insert/update/delete）のみ認証済みユーザーに限定する。
--   - Phase Dの既存機能（Publish処理・GitHub SHA conflict防止・slug lock・publisher user制限）
--     には一切変更を加えない。このmigrationはStorage関連のみを追加する。

-- ---------------------------------------------------------------------------
-- 1. バケット作成（存在すれば設定を更新するだけ。何度実行しても安全）
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-images',
  'blog-images',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Storage Policy（storage.objects。RLSはSupabaseにより常時有効）
--    パスは常に `blog/...` から始まる前提で書き込みを絞る
--    （storage.foldername(name) はスラッシュ区切りのフォルダ部分を配列で返すSupabase組込み関数）。
-- ---------------------------------------------------------------------------

-- 読み取り：バケット全体を公開（公開Blogページの<img>から認証なしで参照できるようにするため）
drop policy if exists "blog-images public read" on storage.objects;
create policy "blog-images public read"
  on storage.objects
  for select
  using (bucket_id = 'blog-images');

-- 書き込み（新規アップロード）：認証済みユーザーのみ、かつ blog/ 配下のみ
drop policy if exists "blog-images authenticated insert" on storage.objects;
create policy "blog-images authenticated insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'blog-images'
    and (storage.foldername(name))[1] = 'blog'
  );

-- 更新（同一パスへの再アップロード等）：認証済みユーザーのみ、かつ blog/ 配下のみ
drop policy if exists "blog-images authenticated update" on storage.objects;
create policy "blog-images authenticated update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'blog-images')
  with check (
    bucket_id = 'blog-images'
    and (storage.foldername(name))[1] = 'blog'
  );

-- 削除：認証済みユーザーのみ（誤アップロードの取り消し等に使用）
drop policy if exists "blog-images authenticated delete" on storage.objects;
create policy "blog-images authenticated delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'blog-images');
