# Health Inequality Dashboard

An animated, interactive bubble chart visualizing the relationship between healthcare spending and life expectancy across 217 countries from 1990 to 2023 — built with D3.js and static World Bank data.

**Live demo**: deploy to GitHub Pages or Netlify (see below)

## What it shows

- **X-axis**: Health expenditure per capita (log scale, USD)
- **Y-axis**: Life expectancy at birth (years)
- **Bubble size**: Population
- **Bubble color**: Income group (Low / Lower-middle / Upper-middle / High)
- **Animation**: Step through 1990–2023 with Play/Pause and a year slider
- **Click a bubble**: Pin a country and trace its trajectory; a detail panel shows its life expectancy vs. the global average over time
- **Legend**: Click income groups to isolate them

## Data source

**World Bank Open Data — World Development Indicators**, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Indicators used:

| Indicator | Code |
|---|---|
| Life expectancy at birth, total | `SP.DYN.LE00.IN` |
| Current health expenditure per capita | `SH.XPD.CHEX.PC.CD` |
| Mortality rate, infant | `SP.DYN.IMRT.IN` |
| Out-of-pocket health expenditure (% of CHE) | `SH.XPD.OOPC.CH.ZS` |
| Physicians per 1,000 people | `SH.MED.PHYS.ZS` |
| Population, total | `SP.POP.TOTL` |
| GNI per capita, Atlas method | `NY.GNP.PCAP.CD` |

## Refreshing the data

```bash
cd health-inequality-dashboard
source .venv/bin/activate   # or: .venv/bin/python fetch_and_clean.py
python fetch_and_clean.py
```

This re-fetches all indicators from the World Bank API and overwrites `data/data.json` and `data/years_available.json`. No API key required.

Requirements: Python 3.13+, see `requirements.txt` (`pip install -r requirements.txt`).

## Local development

Browsers block `fetch()` on `file://` URLs. Serve locally with:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deployment (GitHub Pages)

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source**: set to `main` branch, root `/`
3. The dashboard will be live at `https://<username>.github.io/<repo>/health-inequality-dashboard/`

Or deploy only the `health-inequality-dashboard/` subfolder to Netlify via drag-and-drop.
