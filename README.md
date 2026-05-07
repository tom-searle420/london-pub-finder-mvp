# London Pub Finder MVP

A working static prototype for group pub recommendations in London. It lets 2-6 people add starting points, calculates a meetup target, ranks pubs by convenience and preferences, shows a simple map, supports admin pub tagging, and creates shareable shortlists.

## What is included

- Multi-person location entry with local London area/station matching.
- Meetup styles: middle, best overall, closest to me, closest to selected person, near area.
- Recommendation scoring using travel convenience, feature match, rating quality, opening status and estimated busyness.
- 30-pub London seed dataset with manual tags.
- Filters for Sunday roast, dog friendly, beer garden, pub quiz, live music, craft beer, darts, pool, football, open now, price, rating and quieter picks.
- Pub cards, pub detail dialog, travel-time breakdown and "why this pub" explanation.
- Admin tagging screen with local persistence.
- Share link and copyable shortlist.
- PostgreSQL schema in `schema.sql`.
- API integration plan in `docs/API_INTEGRATION_PLAN.md`.

## Run locally

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:4173
```

No build step or API key is required.

If `npm` is not available, run the same server directly:

```bash
node server.js
```

## Deployment

This is a static app. Deploy the folder as-is to Netlify, Vercel, GitHub Pages or any static host. `netlify.toml` and `vercel.json` are included for basic static hosting.

## Recommendation model

Each pub gets a score out of 100:

```text
Total score =
35% travel convenience
25% preference match
20% rating/review quality
10% opening availability
10% busyness suitability
```

Travel convenience uses:

```text
Convenience score =
40% average travel time
30% fairness / journey spread
20% longest journey
10% distance from target point
```

The MVP uses an estimated travel-time model because no API keys are configured. The model includes distance, transit connectivity, central hubs and a river-crossing penalty. Replace it with Google Distance Matrix, Routes API, Citymapper or TfL data when keys are available.

## Data notes

The seed dataset is intentionally small but useful. Google-style fields such as rating and review count are represented, while detailed pub traits come from manual admin tags. Local admin edits are saved in browser storage so the prototype can be tested without a backend.

Review snippets are not stored in this MVP. The review summary fields are manual placeholders until third-party review-data permissions are confirmed.
