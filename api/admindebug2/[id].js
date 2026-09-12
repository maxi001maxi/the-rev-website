// 診断用・一時ファイル。認証・DBアクセスなし。
// [id].mjs ではなく [id].js（package.jsonのtype:moduleによりESMとして解釈される）で
// 動的ルートが機能するかを確認するためのもの。原因切り分け後、削除する。
export default function handler(req, res) {
  res.status(200).json({
    method: req.method,
    url: req.url,
    query: req.query
  });
}
