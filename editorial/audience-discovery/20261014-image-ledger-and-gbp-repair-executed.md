# Editorial sheet / GBP production repair — 2026-10-14 JST

## Executed
- Read live Master Sheets, CMS assets, GitHub code, and Caption Studio source kit / Phase5 source Doc.
- Root cause: live `v068SortArticleImagesNewestFirst_` physically sorted A:O array formulas and deleted O helper column contents every 15 minutes. Anchors moved from row 2 to row 9, with I containing a mismatched unbounded spill.
- Restored A2:O2; bounded I to 500 display IDs; retained stable newest article sorting / ID joins and CMS GBP asset fallback when no GBP copy record exists.
- Backfilled existing CMS drafts BLOG-20261014-MEDIA-TRIAL and BLOG-20261014-AD08-POSTURE into the image ledger without granting theme approval or publishing.
- Live Phase9 handler now repairs the derived formula view rather than sorting it. CMS-confirmed IDs from output / GBP / Queue enter the ledger; newest five plus five older records are refreshed on a rotating cursor. Invalid or legacy aliases are not appended.
- 12:49:57 manual execution: 10 checked, 10 synced, errors 0; formula row 2 and latest trial ID verified. Existing 15-minute trigger count = 1. The 12:50:17 scheduled trigger completed, independently confirming the automatic handler.
- Actual preview images for trial and posture visible in rows 2 and 3.
- Rewrote GBP source rows 1008-1010 (DENBA, warmup, trial), retaining existing publication / URL hold states. Google posts were not sent.
- GBP-only voice adapter deployed inside the live Phase9 file; canonical standalone source: GoogleBusinessVoice_v081.gs. Preserves parent facts, adds concrete reader decisions and recent draft context, removes routine repetitive intro/ending instructions, normalizes literal newline escapes. Instagram canon was not promoted.
- 13:05:35: actual model request returned 306-character GBP copy with voice_runtime GBP_VOICE_V081, status GENERATED_NOT_POSTED. This was a verification using current CMS article excerpts, not a new article pipeline completion.
- Regression check PASS: shifted anchors repaired, second repair idempotent, live / canonical formula contract consistent, unrelated Blog requests preserved, GBP copy newline normalization.
- No article/GBP publishing or Vercel deployment performed in this repair.

## Failed attempts / correction
- Initial discovery probe checked ten legacy IDs, synced zero. Corrected ID selection / CMS existence checks and removed only newly created recovery rows for invalid aliases.
- GAS dropdown displayed the GBP function while actual execution remained the asset verifier. Execution history exposed the mismatch. Native menu selection and committed selection produced the actual successful GBP request at 13:05.

## Daily pipeline status at follow-up
- TP-20261015 records owner-selected candidate BT-20261014-AUD08-LIVE-3 and supplied interview; Queue BLOG-20261015-fac1fd exists.
- Writer / Editor already ran; output row 20 is REVIEW_REQUIRED because independent QC did not receive first-party interview and verified official excerpts.
- The canonical v0.8 QC evidence repair exists in GitHub but was absent from the actual live GAS bundle. Full article / image / Xserver completion is not claimed; follow-up recovery continues from the existing draft.
