// THE REV. Editorial Brand QC regression tests
import { validateBrandAlignmentForPublish } from '../lib/blogMarkdown.mjs';

let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error('✕ ' + message);
  } else {
    console.log('✓ ' + message);
  }
}

const weakArticle = {
  title: '新大宮でジムを選ぶなら｜設備より「帰宅までの流れ」を見る理由',
  description: '新大宮でジムを比較する記事。',
  keywords: ['新大宮 ジム 選び方'],
  body_markdown: `## 見学ポイント

新大宮でジムを選ぶときは通いやすさを確認します。

## THE REV. CONDITIONING LAB.で確認できること

THE REV. CONDITIONING LAB.は完全予約制です。`
};

const weakErrors = validateBrandAlignmentForPublish(weakArticle);
assert(weakErrors.some((x) => x.includes('下位化')), '「設備より」でブランド資産を下位化する記事を拒否');
assert(weakErrors.some((x) => x.includes('1600字')), '薄い地域比較記事を拒否');
assert(weakErrors.some((x) => x.includes('固有の設備')), 'THE REV.固有資産が不足した記事を拒否');

const strongBody = `
## 新大宮でジムを選ぶときは、設備か通いやすさかの二択にしない

新大宮でジムを比較するときは、目的に合う設備があり、その設備を自分に合う使い方にでき、生活の中で続けられるかを一緒に見ます。
設備は重要です。だからこそ数だけではなく、自分の目的に必要か、どう使うのかまで確認します。

## 忙しい平日の動線を見る

仕事帰りの移動、着替え、運動、帰宅までを一続きで考えます。近さだけでなく、毎週繰り返せるかを確認します。
予約方法や更衣スペース、シャワーの使い方も、実際の利用時間に含めて考えます。

## 設備を目的と使い方で見る

筋力づくり、姿勢や動きの見直し、スポーツの補強など、目的によって必要な設備は変わります。
設備があることと、自分に合う使い方ができることは別です。見学では自分の目的ならどう使うかまで確認します。

## THE REV. CONDITIONING LAB.の考え方

THE REV. CONDITIONING LAB.では、EVOLGEARをはじめとしたトレーニング設備、酸素ルーム、DENBA、シャワー・更衣スペースを備え、完全予約制で運営しています。
設備を置くなら、なぜ置くのか、どう使うのか、その時間を利用する方にどう過ごしてほしいのかまでつなげて考えます。

トレーニング設備は目的に合わせた運動を行うために使い、酸素ルームやDENBAは医学的効果を断定するのではなく、トレーニング後に静かに過ごせる回復環境の選択肢として位置づけます。
設備だけ、通いやすさだけの一方で決めず、目的に合う設備、自分に合う使い方、生活の中で続けられることの三つがそろうかを確認します。
`.repeat(3);

const strongArticle = {
  title: '新大宮でジムを選ぶなら｜設備・通いやすさ・使い方で見る5つのポイント',
  description: '新大宮でジムを比較する記事。',
  keywords: ['新大宮 ジム 選び方'],
  body_markdown: strongBody
};

const strongErrors = validateBrandAlignmentForPublish(strongArticle);
assert(strongErrors.length === 0, '設備価値・固有資産・意味・十分な本文量を満たす記事はPASS');

if (failed) {
  console.error(`Editorial Brand QC tests failed: ${failed}`);
  process.exit(1);
}
console.log('Editorial Brand QC tests: PASS');
