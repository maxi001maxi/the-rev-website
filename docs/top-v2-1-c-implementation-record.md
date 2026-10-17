# TOP v2.1 C implementation record (2026-10-11)
Design truth: 737e61c on claude/the-rev-top-v2-1-c-design-4k6uwo.
Owner explicitly approved C Hero, Person after Pricing, and removal of mobile fixed CTA.
Phase 6 Final Implementation Spec original (2026-10-08) was read separately. Owner's later C decision overrides Phase 6 visual choices; operational facts, tariff restrictions, security and tracking remain binding.
- Removed mobile rev-fixed-cta and deprecated home_fixed_cta. Old placement counts cannot be compared directly with new placement totals.
- FAQ accordion nine questions replaced by C Questions articles; faq_open on TOP retires. Preserve inbound #faq via anchor alias; price/trial key answers remain within their sections.
- Removed trust, empathy, recovery section_view definitions. Added method, questions. Retained trainer/access/final_cta label values with updated selectors. Trial now means dedicated section; Pricing ongoing rates.
- Mock CTA hrefs replaced with Gym's click-outs (utm_content matching data-placement) and LINE URL, with delegated main.js data-track. No booking completion claim.
- Existing main GTM, JSON-LD, loader, drawer behavior, event_version=e1_v1, Price experiment selector remain.
- home-c.css and home-c.js are top-only; current style.css and other page HTML left unchanged.
- IMPORTANT: draft implementation is NOT production acceptance. Validate visual 1440/390, real images, keyboard/drawer, no-JS tabs, HTML/CSS/JS, all CTA analytics in browser, production live links, reviewed Google Voice summary and REV-EXP-2026-001 deployment boundary.
- Do not merge main or deploy without separate Owner approval.
