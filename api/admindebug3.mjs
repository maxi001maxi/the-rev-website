// 診断用・一時ファイル。クエリ文字列でidを受け取る方式が機能するか確認する。
export default function handler(req, res) {
  res.status(200).json({
    method: req.method,
    url: req.url,
    query: req.query
  });
}
