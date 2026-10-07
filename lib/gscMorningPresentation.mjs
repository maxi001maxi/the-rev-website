const number = (value, digits = 0) => new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: digits, maximumFractionDigits: digits
}).format(value);
const available = (window) => window?.status === 'VALUE' && window.days_present === window.expected_days;

export function buildGscMorningPresentation(report) {
  const settled = report?.freshness?.settled_through;
  const compare = (current, previous) => {
    if (!available(current) || !available(previous)) {
      return { ready: false, message: '比較に必要な確定日のデータが不足しています。',
        currentDays: current?.days_present ?? 0, previousDays: previous?.days_present ?? 0 };
    }
    const row = (key, label, unit = '') => {
      const before = previous[key], after = current[key];
      if (!Number.isFinite(before) || !Number.isFinite(after)) {
        return { label, text: '算出できません', change: '比較できません' };
      }
      if (key === 'ctr') {
        const points = (after - before) * 100;
        return { label, text: `${number(before * 100, 1)}% → ${number(after * 100, 1)}%`,
          change: `${points > 0 ? '+' : ''}${number(points, 1)}ポイント ${points > 0 ? '↑' : points < 0 ? '↓' : '変化なし'}` };
      }
      if (key === 'position') {
        const improvement = before - after;
        return { label, text: `${number(before, 1)}位 → ${number(after, 1)}位`,
          change: improvement === 0 ? '変化なし' : `${number(Math.abs(improvement), 1)}順位${improvement > 0 ? '改善 ↑' : '低下 ↓'}` };
      }
      const rate = before > 0 ? (after - before) / before * 100 : null;
      return { label, text: `${number(before)}${unit} → ${number(after)}${unit}`,
        change: rate === null ? (after === 0 ? '変化なし' : '前の期間が0回のため増加率は算出できません') :
          `${rate > 0 ? '+' : ''}${number(rate, 1)}% ${rate > 0 ? '↑' : rate < 0 ? '↓' : '変化なし'}` };
    };
    return { ready: true, metrics: [row('impressions', '表示された回数', '回'),
      row('clicks', 'サイトがクリックされた回数', '回'), row('ctr', 'クリック率'),
      row('position', '検索結果の平均順位')] };
  };
  return { title: 'Google検索',
    freshness: settled ? `データは${Number(settled.slice(5, 7))}月${Number(settled.slice(8, 10))}日まで確定（検索サービスの日付）` : '検索データは未取得です',
    sevenDays: compare(report?.recent_7_final_days, report?.previous_7_final_days),
    twentyEightDays: compare(report?.recent_28_final_days, report?.previous_28_final_days) };
}
