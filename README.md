# PicCalc — V78 FULL PACKAGE (brand sync + pre-review full-site audit)

BUILD_ID: V78-PICCALC-FINAL-AUDIT   |   2026-11-21   |   baseline: TRAE main-2

Adds the reference hub (examples, need index, glossary, privacy evidence),
site-wide search, dedicated 404 pages, a three-step quickstart with a real
screenshot on all 26 tool pages, and the PicCalc rename. Sitemap: 138 URLs.

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


---

## V78 · 2026-11-21

Baseline is the complete TRAE-revised repository pulled from
`lindong668/TK-bj@main-2` (243 files). Nothing from TRAE was removed.

- Brand synced to **PicCalc** everywhere, including the 58 `picstudio-*` sample
  references inside the long-form guides; six `piccalc-*` samples added and the
  six legacy `picstudio-*` files kept for zero-404 compatibility.
- Fixed: duplicate canonical + conflicting robots on 404 and privacy-evidence
  pages, 31 pages of copied share metadata, non-canonical language-switch
  targets on the guides index pages (`/guides/index`, `/guides//`), two Chinese
  strings left on the English examples page, narrow-screen horizontal overflow.
- `src/index.js`, `wrangler.toml`, `ads.txt`, `robots.txt`, `_headers`,
  `sitemap.xml` (138 URLs), all page URLs, canonical rules, hreflang clusters
  and the ad slot are **byte-identical** to the baseline.

See `docs/CHANGELOG_V78.md` for the full audit and `docs/★一步部署与核对.txt`
for the one-step deploy.
