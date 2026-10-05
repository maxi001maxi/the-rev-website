# THE REV. Social Director v0.5 — Live History + Daily 5 Candidates

Status: implementation branch
Branch: `feature/social-history-candidate-system`

## Why this exists

Social Director must not invent a Reel that was already posted.

The previous source `01_POST_HISTORY` was a useful backfill, but its latest row was 2026-09-12.
That is not sufficient for a high-frequency Reel B workflow.

This system separates:

- **actual published history** from planned Social runs
- **performance snapshots** from content definitions
- **five morning candidates** from the final selected production package

## Runtime source of truth

### Supabase

`social_published_posts`
- only actually published posts
- planned content never enters this table

`social_post_metrics`
- observed metric snapshots

`social_reel_candidate_batches`
- one daily five-candidate batch

`social_reel_candidates`
- five choices and selection state

### Google Sheets

Existing:
- `01_POST_HISTORY`
- `04_PERFORMANCE`

New human view:
- `39_SOCIAL_REEL_CANDIDATES`

Sheets remain useful as a human-readable source / backfill.
Supabase becomes the Social runtime store.

## Bridge

No new Vercel Function was added.

The existing authenticated endpoint:

`POST /api/integrations/editorial-status`

now supports:

- `social_history_upsert`
- `social_history_list`
- `social_candidates_prepare`
- `social_candidates_poll`
- `social_candidates_choose`
- `social_candidates_notification_ack`

Authentication remains the existing server-to-server Bearer bridge.

## Morning flow

```text
actual published history sync
        ↓
history freshness check
        ↓
Blog / Social history supplied to candidate generator
        ↓
exactly five Reel B concepts
        ↓
Supabase batch
        ↓
39_SOCIAL_REEL_CANDIDATES
        ↓
official LINE push
        ↓
user selects in ChatGPT
        ↓
selected candidate becomes the production brief
        ↓
Social Director creates shot / text / edit / caption package
```

## Current Reel ownership

Reel A:
external Discovery / Knowledge line.

Reel B:
THE REV. owned Store / Experience / Proof line.

Current phase:
`STORE_AWARENESS_BUILD`.

## Duplicate protection

The morning flow stops with:

`HISTORY_STALE`

when actual published history is older than the allowed freshness window.

This is intentional.

The system must not quietly assume an old history is current.

## Apps Script add-on

File:

`editorial/gas/SocialDirector_v0.5_ONE_PASTE.gs`

It reuses:
- existing Editorial candidate generator
- existing Bridge authentication
- existing LINE token / owner
- existing Spreadsheet

Install entry point:

`installSocialDirectorV050()`

Diagnostics:

`inspectSocialDirectorV050()`

Manual candidate refresh:

`refreshSocialReelCandidatesV050()`

History backfill:

`syncSocialPublishedHistoryV050()`

Manual choice inside GAS if ever needed:

`chooseSocialCandidateV050(3)`

Instagram publishing is not implemented.

## Remaining live-data adapter

The architecture does not depend on Windsor.ai.

However, a live Instagram source still has to feed recent actual posts into the canonical history.

Accepted adapter contract:

```json
{
  "action": "social_history_upsert",
  "posts": [
    {
      "platform": "Instagram",
      "platform_media_id": "...",
      "permalink": "...",
      "published_at": "...",
      "format": "Reel",
      "caption": "...",
      "metrics": {
        "views": 0,
        "reach": 0
      }
    }
  ]
}
```

Possible adapters:
- direct Meta / Instagram API
- Metricool
- Windsor
- another verified provider

The Social runtime does not care which provider supplied the post.
Provider-specific data is an adapter, not the source of truth.

## Safety

- no automatic Instagram publishing
- no DM sending
- no fabricated current post history
- stale history blocks candidate generation
- selection is not publishing
