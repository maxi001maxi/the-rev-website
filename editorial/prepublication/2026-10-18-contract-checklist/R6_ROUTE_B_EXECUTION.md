# BLOG-20261018-082d82 — Route B R6 execution / QC FAIL

## Current result — NOT ready for publication

Executed 2026-10-17 JST using the existing `Auto Editorial Hybrid Images` workflow.
Run: https://github.com/maxi001maxi/the-rev-website/actions/runs/39005183154
Input commit: `95ef2c80ab17f96b03d14713d3cce984ba335892`.
Operator result commit: `35995db` (other authorized work advanced main during execution; operator rebased its output).
One OpenAI image-generation tool call completed. One scene was rendered offline to Thumbnail 1200x675, OGP 1200x630 and GBP 1200x900, with 320/400px previews.
Independent Visual QC rejected the result. Human visual inspection also rejects it. No additional image generation was performed.

## Verified quality findings

| Check | Result |
|---|---|
| Article visual relevance | 5/10 |
| Main claim visualization | 4/10 |
| Real facility consistency / authenticity | 7/10 / 7/10 |
| Human/environment integration / scale / ground-contact / light | 8/10 each |
| Anatomy | 9/10 |
| Typography / series consistency | 9/10 / 9/10 |
| Independent equipment-zone observation | PASS; rack remains in rear training area |
| Generic passive pose | true — FAIL |
| Article-specific visible action | false — FAIL |

The man faces the LEFT logo wall rather than the actual rear training space on the RIGHT. The result is a generic standing portrait. The narrow equipment inventory check passed, but the broader Visual QC did not: this distinction must not be described as overall facility or image acceptance.

Likely design cause (inference): the brief said “towards the rear training area” but did not lock screen-right gaze/torso orientation; the empty-hands pose lacked a visible checking action. The image model also reinterpreted some room details. A typography-only crop/flip cannot repair these defects: horizontal mirroring would reverse the real logo/room and would not satisfy source fidelity.

## Preservation / costs / safety

- Rejected media and all formats are quarantined in artifact `12091036086`, `editorial-rejected-image-evidence-39005183154` (7-day retention).
- Recovery checkpoint artifact: `12090926398`.
- `R6_API_USAGE.jsonl`: three Responses requests total, exactly ONE image-generation tool call; two further calls were independent visual and source/history QC.
- Reported orchestration/QC usage totals: input 46,956 tokens; output 4,874 tokens; 51,830 total. Image-tool usage/currency charges were not returned. Do not estimate a yen total from these records.
- GitHub stores the failure state, usage evidence and planning changes; rejected images were NOT committed to public assets or deployed to Xserver.
- Supabase update returned `NOT_PUBLISHED`, `image_status=ERROR`, `image_asset_ready=false`, R6 version, `image_qa.pass=false`, `manual_visual_rejection=true`. GBP is blocked by the same rejection.
- Existing article text remains unchanged. Source SHA256 `e772344b92253cd013075e3d6c55c947db9cc7c0785dfb8e4284a1cf59ad0854`; source/Supabase body SHA256 `5335b6e3dd556e6ff1b19deecb14602ef435081622da09c7204772bf4323f467`; independent text QC 20/20 PASS.
- Browser reached the Editorial Console login at the real review URL; authenticated Preflight has NOT run. No authentication bypass, Blog Publish, GBP post or Vercel deployment occurred.
- Required local checks passed: image system, Phase 9 (164), daily state contract, state machine (73), daily creator (120), scene/route-B regression (17), Blog build, diff whitespace check. These are NOT image acceptance.

## Concrete next correction — proposed only, NOT authorized or executed

Keep Route B and the authentic lobby source. Lock the customer's torso and gaze to screen-RIGHT toward the actual rear training space, with a visible three-item personal-checking action instead of an idle pose (a small personal checklist with three blank boxes, no generated Japanese text). The visitor stays in front of reception; all equipment remains behind, with no contact.

Use only the original verified room photo as image-edit content; do not feed finished style cards as competing spatial references. Preserve photographic mood through the existing deterministic rendering. Use the existing OpenAI Responses edit route, explicit GPT image model, medium 1536x1024, high input fidelity where supported, no hard ellipse compositor. Add `max_tool_calls=1` to bound built-in calls within the single generation response, in addition to the persisted one-attempt job limit. Source: official Responses API reference https://developers.openai.com/api/reference/resources/responses/methods/create .

One further paid image edit requires owner review at this QC checkpoint under the v3 brief's `extra_generation_requires_separate_owner_review=true`. Do NOT increment asset version or retry automatically. If approved: revise the concrete shot/prop contract, free-preflight, execute once, independently QC again, and proceed to formal staging and authenticated browser Preflight only on actual PASS. All existing image quality thresholds and the final human Publish boundary remain mandatory.
