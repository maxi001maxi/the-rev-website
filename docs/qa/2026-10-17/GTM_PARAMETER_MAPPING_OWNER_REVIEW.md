# Existing GTM parameter gap — Owner review only / NOT APPLIED

The public current container GTM-WFD7R8BT resource version 3 has the expected Google tag and custom-event name trigger, but no controlled event-parameter map. The published resource snapshot is in GTM_PUBLISHED_RESOURCE_AUDIT.json. Browser collection probes see event names; page_type / placement are absent from the constructed GA4 requests. This predates the native TOP migration; it is not solved merely by restoring dataLayer pushes.

## Concrete proposed setting difference (requires Owner approval)

Keep the same container, measurement ID G-Q6ZSSJMEZ2, Google base tag, custom-event trigger regex, event names and consent configuration. In the existing GA4 event forwarding tag only, map the following existing fields with Data Layer Variables Version 2, exactly as the already documented GTM_GA4_IMPLEMENTATION.md contract specifies:

| Parameter | Data Layer Variable |
|---|---|
| event_version | DLV - event_version → event_version |
| site_version | DLV - site_version → site_version |
| page_path | DLV - page_path → page_path |
| page_type | DLV - page_type → page_type |
| placement | DLV - placement → placement |
| component | DLV - component → component |
| destination_type | DLV - destination_type → destination_type |
| article_slug | DLV - article_slug → article_slug |
| cta_type | DLV - cta_type → cta_type |
| section_id | DLV - section_id → section_id |
| faq_id | DLV - faq_id → faq_id |
| faq_topic | DLV - faq_topic → faq_topic |

Do not add link_text, free text, customer data, new events, booking completion, an additional Google tag or a direct gtag implementation. No GA4 custom dimension registration, tag edit/publish or other production setting mutation has been made in this task.

## Impact and acceptance

- Existing Company OS Direct Read primary reports aggregate the existing event names. They do not require these custom parameter fields and their implementation/metric definitions remain unchanged.
- Price control capture intentionally uses page-scoped section_view sessions and production hostname; it does not invent custom-dimension availability. Keep existing 25% once-only exposure and control metadata. No treatment launch.
- Mapping improves parameter availability but is a production settings change, so the Owner must approve it separately. After approval, inspect a GTM workspace diff and consent behavior, then repeat the safe collection probe and separately verify receipt without fabricating booking completion.
- Current website regression checks may pass while this external configuration gap and GA4 real receipt remain unresolved. **Production readiness is HOLD.**

## 2026-10-17 最終受入での位置づけ

上の包括的HOLDは履歴。[FINAL_ACCEPTANCE.md](FINAL_ACCEPTANCE.md)が最新のサイト公開判定を定める。公開v3のmacros/tags/predicates/rulesは本日再取得して一致。既存の詳細属性不足はFAILのまま、基本eventName計測・Company OS標準集計と区別し、サイト公開を無期限に止める条件から分離した。GTM変更自体は未承認・未適用である。

### Owner/既存GTM担当に渡す操作票

1. Ownerが「GTM-WFD7R8BTの既存GA4イベント転送タグに上記12パラメータを対応させる変更」を別途承認する。新しいGoogleタグ、イベント名、予約完了推定、同意設定、GA4カスタム定義の作成は承認範囲に含めない。
2. GTMの対象コンテナを開き、既存workspace変更と現在の公開バージョンを確認・書き出して保存する。公開リソースv3の番号と管理画面のコンテナバージョン番号は同じと決めつけない。
3. 既存担当にはコンテナのEdit（編集）権限、公開担当にはPublish権限が必要。Approve権限のみでは公開できない。今回Workは認証付き管理権限を確認できておらず、勝手な招待や権限変更はしない。
4. Data Layer Variable Version 2を必要なものだけ既存変数と重複せず作成。既存GA4イベントタグ（公開resourceではtag_id=6、measurement ID G-Q6ZSSJMEZ2、Eventをそのままイベント名にするタグ）のEvent Parameters欄へ上表を対応させる。Google base tag/trigger regex/consentに差分がないことを確認。
5. Workspace差分が12項目と必要変数に限ることをレビュー。Tag Assistantでpayload・単一発火を確認する。Preview hostnameではサイトの本番GTMガードが作動するので、「Previewでタグが発火しない」は意図した挙動。ガードや同意を外してテスト送信しない。本番確認は既存の内部除外が確認された検証枠、または受動確認で行う。
6. Publish権限を持つ担当が承認済み差分だけ公開し、公開日時/前後バージョン/workspace差分を保存する。タグ実行、collect要求のイベント名/属性、GA4受信、Company OS反映は別々に判定する。未受信をPASSにしない。
7. 二重page_viewやイベント増殖・誤分類が出たら、直前コンテナへ戻し、同じ条件で確認する。サイトを旧版に戻して既存GTM設定不足を隠さない。

参照：[GTM権限の公式説明](https://support.google.com/tagmanager/answer/6107011?hl=en)。この操作票を既存担当へ渡せばOwner自身のコード編集は不要。サイト公開承認と、この別設定の公開承認は別である。
