# THE REV. Admin Domain — Current Truth

Updated: 2026-09-25

## Intended production architecture

- Public website: `https://therev-lab.com/` → Xserver
- Admin: `https://admin.therev-lab.com/` → Vercel project `the-rev-website`
- Admin root behavior: `/` → `/admin/login/`
- Existing session on login page: redirect to `/admin/`
- Dashboard: `/admin/`
- Analytics: `/admin/analytics/`
- API: Vercel Functions under `/api/*`

Xserver production deployment intentionally excludes `dist/admin`.
This separation must remain.

## Git / Vercel

GitHub repository:
`maxi001maxi/the-rev-website`

Vercel project identified from GitHub deployment status:
- Team slug: `htrmaxi0101-9305s-projects`
- Project: `the-rev-website`
- Team ID reported by Vercel API: `team_Tr078zaEJtEFM8mC2epaOchj`

The current ChatGPT Vercel connector is authenticated to a different Vercel scope and returns 403 for this team.
The connector also does not expose project-domain mutation actions, so custom-domain assignment cannot be completed through the current Vercel tool surface.

## DNS Current Truth

Automated DNS audit from GitHub Actions:

- Authoritative nameservers:
  - `ns1.xserver.jp`
  - `ns2.xserver.jp`
  - `ns3.xserver.jp`
  - `ns4.xserver.jp`
  - `ns5.xserver.jp`
- `admin.therev-lab.com` explicit CNAME: none
- `admin.therev-lab.com` currently resolves to `162.43.104.3`
- HTTPS currently fails certificate validation for `admin.therev-lab.com`

This means the `admin` hostname is presently falling through to Xserver rather than Vercel.

## Repository routing

`vercel.json` uses a Vercel host matcher so only the Admin custom hostname root redirects:

```json
{
  "source": "/",
  "destination": "/admin/login/",
  "has": [
    {
      "type": "host",
      "value": "admin\\.therev-lab\\.com"
    }
  ],
  "permanent": false
}
```

The public Vercel project root is not globally redirected.

## External configuration gate

To activate the formal Admin URL:

1. In Vercel project `the-rev-website`, add custom domain:
   `admin.therev-lab.com`
2. In Xserver DNS, replace the current implicit/wildcard resolution for host `admin` with the exact DNS record Vercel requests for that custom domain.
3. Wait for Vercel domain verification and TLS issuance.
4. Run `Admin Domain Audit`.
5. Verify:
   - HTTPS 200/redirect chain
   - root ends at `/admin/login/`
   - unauthenticated Admin API remains 401
   - authenticated session reaches Dashboard
   - Analytics opens for authenticated user

Do not move the apex `therev-lab.com` away from Xserver.
