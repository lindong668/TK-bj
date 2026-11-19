# PicStudio — V71 FULL PACKAGE (AdSense low-value content remediation)

BUILD_ID: V71-49578DC41880   |   2026-11-20   |   baseline V70.10

## Deploy (one command, from THIS directory)
    npx wrangler login        # skip if already logged in
    npx wrangler deploy

It uploads `src/index.js` AND every file under `public/` (HTML, images,
specimens, sitemap, ads.txt, robots.txt, version.txt). Do NOT paste JS into
the Cloudflare editor and do NOT just push to GitHub — neither uploads assets.

## Prove the live site is THIS package
    python3 docs/VERIFY_ONLINE.py https://piccalc.com
Or simply open `https://piccalc.com/version.txt` — V70.10 returns 404.

## What changed
See `docs/CHANGE_VS_V70.10.csv` (per-file sha256 before/after) and
`docs/RESCAN_REPORT.md`. Unchanged: `src/index.js`, `wrangler.toml`,
`ads.txt`, `robots.txt`, `_headers`, ad slots, URL structure, canonical,
hreflang, zh/ pages, the original 10 guides.

## Contents
    wrangler.toml  package.json  src/  public/  docs/
docs/ is documentation only — Wrangler uploads `public/` only.
