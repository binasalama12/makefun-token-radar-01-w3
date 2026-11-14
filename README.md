# Early Scout — below-the-floor hunter

A token launch radar for make.fun's token-radar-01 bounty. It ranks pre-token protocols by
an implied value derived only from the sealed DefiLlama snapshot, and gives every protocol a
five-step farm plan with a cost and a time for each step.

## What it does

- Covers all 40 watchlist protocols (TVL at or above the $50M floor, no token on record) and
  adds the 200 pre-token protocols below the floor with the most TVL — the early finds.
- Ranks all 240 rows by implied value, strongest first.
- Shows an "Early finds" section with the top early protocols, a sortable and filterable board,
  and a detail view per protocol with the model's inputs and its farm plan.

## The model

```
growth     = clamp(change_7d, -50, 200) per cent
growthMult = 1 + (growth / 100) x 0.8
maturity   = 0.5 + 0.5 x min(age_days, 1460) / 1460   (age unknown: 365 days)
implied    = max(1, round(tvl_usd x 0.28 x growthMult x maturity))
```

Age matters most: a protocol that has run for years with no token earns up to twice the
maturity multiplier of a brand-new one. No protocol name is special-cased; one function scores
every row from the snapshot's own figures.

## The farm plan

Five steps per protocol, derived from its category, chains, TVL and age. Young protocols get
the longest holding window (180 days under a year old) because a farm only counts if the
activity spans the snapshots that decide an airdrop.

## How to run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22, standard library only, no network. It writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` (last) into the output directory. Run it twice into two
different directories: `board.json` and `dossier.json` must be byte-identical.

## The dashboard

`dashboard/` is a static page with no network: `index.html`, `app.css`, `app.js`, reading
`data.js` written beside it. Views: `?view=board` (default), `?view=detail&slug=<slug>`,
`?view=filtered&f=<text>`.
