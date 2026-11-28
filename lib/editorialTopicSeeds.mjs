// Editorial idea bank, not evidence of search volume or product efficacy.
// Each idea still passes the all-history overlap gate and owner selection.
// Stable IDs prevent reusing a consumed idea when the calendar week changes.
const ideas = [
  ['BOXING','ミット打ちで肩に力が入るとき、最初に見直すこと','ミット打ち 肩 力み','強く打とうとして肩や腕だけで頑張ってしまう人の悩みに答える。','ボクシングの初回紹介ではなく、ミット打ち中の力みと現場の声かけに絞る。'],
  ['BOXING','ミット打ちのあと、何を振り返ると上達につながる？','ミット打ち 上達 振り返り','運動した満足感に加え、自分の変化を振り返りたい人に練習の見方を伝える。','初心者へのサービス紹介とは分け、練習後に振り返る具体的な観察項目を聞く。'],
  ['BOXING','ボクシングの足運びが難しいとき、どう練習を分ける？','ボクシング フットワーク 初心者','足と手を同時に動かす難しさに対する、THE REV.の指導の考え方を説明する。','全体の始め方ではなく、足運びとパンチを分ける練習設計を扱う。'],
  ['BOXING','パンチを打つと息を止めてしまう。練習で意識すること','ボクシング パンチ 呼吸','練習中の身近なつまずきからボクシングの現場を具体的に伝える。','息切れの医療判断や効果の断定をせず、練習での呼吸と声かけを一次情報で確認する。'],
  ['BOXING','ミット打ちのテンポについていけないとき、どう調整する？','ミット打ち テンポ 初心者','周囲のペースが気になる人に、個別指導の調整方法を伝える。','予約や初回の流れとは分け、テンポ・組み合わせの調整だけを扱う。'],
  ['DENBA','DENBA Healthの機器とマット、それぞれ何をするもの？','DENBA Health 機器 マット','写真だけでは分かりにくい製品の構成を一次資料に沿って説明する。','商品の総合紹介ではなく構成部品の役割と用語を整理し、健康効果を推測しない。'],
  ['DENBA','DENBA Healthで説明できること・まだ断定できないこと','DENBA Health 説明 効果','商品について知りたい人に、説明の根拠と限界を明確に伝える。','初回の使い方とは分け、製品仕様と医療・生理効果の主張の境界を一次資料で整理する。'],
  ['DENBA','DENBA Healthを使う場所について、店舗で確認したいこと','DENBA Health 使用場所','設備への関心を、実際の店舗での利用条件を確認する行動につなげる。','製品原理の紹介とは分け、THE REV.の使用場所・配置・案内を確認して説明する。'],
  ['OXYGEN_ROOM','酸素ルームに入る前、スタッフへ伝えておきたいこと','酸素ルーム 利用前 確認','初めて利用する人が当日の確認をしやすくする。','耳抜きや過ごし方の記事とは分け、利用前の相談事項を運用マニュアルで確認する。'],
  ['OXYGEN_ROOM','酸素ルームから出るまで、終了時はどんな流れ？','酸素ルーム 終了 減圧','入口だけでは分からない利用終了時の流れを一次資料で伝える。','初回の全体紹介とは分け、終了・減圧・退室の順序に限定する。'],
  ['OXYGEN_ROOM','酸素ルーム利用中に困ったとき、どう連絡する？','酸素ルーム 利用中 連絡','利用中の不安を減らすため、店舗での連絡方法を確認して伝える。','過ごし方や耳抜きの一般説明とは分け、実際の連絡・対応手順に限定する。'],
  ['FACILITY_THE_REV','予約した日に予定が変わったら、どう相談する？','新大宮 パーソナルジム 予約変更','サービスを選ぶ前に知りたい運用の疑問を解消する。','設備紹介とは分け、予約変更の実際のルールを確認し、未確認の規約は書かない。'],
  ['FACILITY_THE_REV','トレーニングの目標がまだ曖昧でも、最初に相談できる？','パーソナルトレーニング 目標 相談','始めたいが目標を決めきれない人に、相談時の整理の仕方を伝える。','ジム選びの記事とは分け、初回相談で確認する質問と目標づくりを聞く。']
];

// Registered product manuals cover general terminology, not every local
// operating rule. These seeds deliberately require a topic-specific interview.
export function topicSeeds(now = new Date()) {
  const iso = new Date(now).toISOString();
  return ideas.map(([lane, title, query, reason, angle], i) => ({
    candidate_id: `IDEA-V070-${String(i + 1).padStart(3,'0')}`,
    generated_at: iso, week_start: iso, rank: i + 1,
    status: 'CANDIDATE', decision: 'PUBLISH', route_lane: 'WEB_BLOG',
    title_candidate: title, topic: title, primary_query: query,
    audience_question: title, why_now: reason, selection_reason: reason, unique_angle: angle,
    editorial_lane: lane, content_cluster: lane, article_type: 'STANDARD',
    total_score: 70, portfolio_final_score: 70,
    topic_specific_interview_required: true,
    notes: 'AI editorial idea bank; score is editorial priority, not measured search volume. Confirm local procedures before drafting.'
  }));
}
