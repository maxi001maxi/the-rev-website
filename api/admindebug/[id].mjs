// 診断用・一時ファイル。認証・DBアクセスなし。
// [id].mjs 形式の動的ルートに、実際のリクエストがどう届くかだけを確認するためのもの。
// 原因切り分け後、削除する。
export default function handler(req, res) {
  res.status(200).json({
    method: req.method,
    url: req.url,
    query: req.query
  });
}
