# THE REV. | Xserver Deploy Optimization v2 | 2026-10-13

## What actually changed
1. **Safe FULL_DELTA lane:** Only image-only (assets/images/*), known-parent, ≤30-path, non-deletion main pushes. Live public preimage MUST match Git parent content byte-for-byte before upload. Backup exactly the old changed bytes in a 14-day GitHub Actions artifact, upload changed images only, verify live SHA256, automatically attempt old-byte restore on upload/verification failures. Otherwise FULL remains unchanged.
2. **BLOG_FAST changed-output sync:** Regenerate prior Blog dist from the exact parent commit, compare SHA256 to current dist, and transfer ONLY changed blog outputs, removing deleted pages after new pages and index files are uploaded. Upload .htaccess and sitemap at the documented safe end. If parent build or diff is incomplete or >50 files, fall back to the existing full Blog mirror. For BLOG_FAST, verify all published links through the full blog index while fetching only changed article pages individually. All unpublished-page guards and category checks remain.
3. **Admin publish progress:** GitHub Actions real jobs/step states are read via the authenticated status API and shown with elapsed time and real current stage. Do not claim a 15-minute cap or invented ETA. Observation safety cap is 35 minutes and does not mark publish failure. PUBLISHED requires the exact workflow run's successful completion and the actual live article URL, same as before.
4. **Workflow-only updates:** SKIP Xserver uploads on GitHub Actions/admin/backend-only changes, avoiding a gratuitous 18–22 minute FULL deployment.

## Rollback / safety
- FULL (templates, CSS, build changes, unknown changes, deletions, unknown parent) retains complete FTPS backup, image-first deployment, blog-last switch and verification.
- FULL_DELTA aborts **before** upload on any previous-byte mismatch. Changed-file preimages and manifest are retained as xserver-delta-backup-${run_id}; attempted automatic rollback is verified against original hashes. If verification fails, the workflow is visibly red.
- BLOG_FAST compares exact prior/current generated output and fails over to the previous mirror method for preparation problems; no unverified article is marked published. An FTP failure remains a failed deployment (partial publication is not promoted).
- Owner's Review & Publish confirmation is unchanged. No queued or draft article auto-publishes because of these improvements.

## Tests performed
- 16/16 new + existing Xserver planning tests PASS.
- Publish Phase D 75/75 PASS; Phase E PASS.
- Vercel builder PASS; Github Actions YAML + 23 Bash steps parse PASS; Review UI JavaScript syntax PASS.
- Real two-version static build replay: 31 previous blog files, 31 current; one altered article generates exactly one changed page.
- lftp 4.9.2 supports source scripts and mkdir -p.
- **Not yet measured:** real production runtime of FULL_DELTA and BLOG_FAST exact diff. Do not claim guaranteed 1–3 minutes or faster FULL design page releases.

## Activation / observations
- A code-only merge should make the Xserver workflow plan classify SKIP; Vercel Production still needs its deployment READY.
- The next published blog article takes the BLOG_FAST delta path if prior dist can be generated; inspect actions step "Build previous Blog snapshot" and Blog transfer minutes.
- The next image-only site change tests FULL_DELTA with old public bytes. Do not create a fake production change just to benchmark.
- Complex FULL changes intentionally keep prior proven heavyweight path. Further optimizations need rollback equivalence proof and measured samples.
