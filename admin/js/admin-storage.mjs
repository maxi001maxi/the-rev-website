// THE REV. Editorial Console — Phase D.1: 画像アップロード（Supabase Storage）共有ヘルパー。
//
// ブラウザから、既存のSupabase session（admin-auth.mjsのクライアント。publishable key +
// ログイン中ユーザーのアクセストークン）で直接 Supabase Storage へアップロードする。
// service_role は一切使用しない。認可の実体はSupabase側のStorage Policy（RLS）が担う
// （supabase/migrations/20260913020000_phase_d1_storage.sql 参照）。
//
// このファイルの前半（検証ロジック・パス生成）はブラウザ専用APIに依存しない純粋関数にしてあり、
// Node（scripts/test-phase-d.mjs）から直接importしてテストできる。
// admin-auth.mjs（CDNからSupabase SDKをimportする）は uploadImage() の中でのみ動的importする。
// トップレベルで静的importすると、Node側のテストがこのファイルをimportしただけでCDNへの
// ネットワークアクセスが発生してしまうため。

export const BUCKET = 'blog-images';

// Supabase Storageバケット側（migration）の allowed_mime_types / file_size_limit と
// 必ず同じ値にしておくこと。ここでの検証はUXのため（早期に分かりやすいエラーを出す）であり、
// 実際のセキュリティ境界はバケット側の設定とStorage Policy。
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export function extensionForMimeType(mimeType) {
  return EXTENSION_BY_MIME[mimeType] || null;
}

// file は File/Blob、またはテスト用に { type, size, name? } のプレーンオブジェクトでもよい。
export function validateImageFile(file) {
  if (!file) return { ok: false, message: '画像ファイルが選択されていません。' };
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, message: 'JPEG / PNG / WebP 形式の画像のみアップロードできます。' };
  }
  if (typeof file.size === 'number' && file.size > MAX_FILE_SIZE_BYTES) {
    const maxMb = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    return { ok: false, message: `ファイルサイズが大きすぎます（上限 ${maxMb}MB）。` };
  }
  if (typeof file.size === 'number' && file.size <= 0) {
    return { ok: false, message: 'ファイルが空です。' };
  }
  return { ok: true };
}

// draftId（UUID。ユーザー入力ではなくAdmin側が保持する値）とMIME種別だけからパスを生成する。
// 元のファイル名は一切使用しない（パストラバーサル対策。フォルダは常に `blog/{draftId}/`）。
export function buildStoragePath(draftId, mimeType) {
  if (!draftId || typeof draftId !== 'string') {
    throw new Error('draftId が指定されていません。先にDraftを保存してください。');
  }
  const ext = extensionForMimeType(mimeType);
  if (!ext) throw new Error(`サポートされていないファイル形式です: ${mimeType}`);
  const stamp = Date.now();
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : `${Math.random()}`.slice(2, 10);
  return `blog/${draftId}/${stamp}-${rand}.${ext}`;
}

class StorageUploadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StorageUploadError';
  }
}

// アップロード本体。成功時は { url, path } を返す。
export async function uploadImage({ draftId, file }) {
  const validation = validateImageFile(file);
  if (!validation.ok) throw new StorageUploadError(validation.message);

  const path = buildStoragePath(draftId, file.type);
  const { getSupabaseClient } = await import('./admin-auth.mjs');
  const supabase = await getSupabaseClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new StorageUploadError('ログインが必要です。');

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    throw new StorageUploadError(uploadError.message || '画像のアップロードに失敗しました。');
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new StorageUploadError('アップロードした画像のURL取得に失敗しました。');

  return { url: data.publicUrl, path };
}

export { StorageUploadError };
