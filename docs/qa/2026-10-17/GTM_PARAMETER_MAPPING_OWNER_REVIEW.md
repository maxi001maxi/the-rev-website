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
