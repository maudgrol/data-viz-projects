# Data Viz Projects

A collection of personal data visualization mini-projects. Each project lives in its own subfolder and is fully self-contained — no shared dependencies between projects, so any one can be deployed independently (e.g. as its own GitHub Pages path).

## Projects

| Project | Description | Status |
|---|---|---|
| [health-inequality-dashboard](./health-inequality-dashboard/) | Global health spending vs. outcomes — Gapminder-style animated bubble chart using World Bank data | Complete |

## Stack

- **Data**: Python (requests + pandas) for one-time fetch/clean, output to static JSON
- **Frontend**: Vanilla D3.js, no build step required
- **Deployment**: Any static host (GitHub Pages, Netlify, Vercel)
