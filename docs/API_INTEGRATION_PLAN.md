# API Integration Plan

The current MVP runs without external services. It uses a curated London pub seed dataset, local geocoding for common areas and stations, and an estimated travel-time model. This keeps the recommendation flow testable before paid API keys are added.

## Phase 1: Google Maps-backed Search

Use these services behind API routes so keys never ship to the browser:

- Geocoding API: turn address, postcode, station and area input into coordinates.
- Places API Text Search or Nearby Search: discover pubs around the target point.
- Places Details API: hydrate rating, review count, website, opening hours, price level and current opening status.
- Distance Matrix API or Routes API: calculate per-person journey times to each pub.

Recommended endpoint shape:

- `POST /api/geocode` with `{ input }`
- `POST /api/recommendations` with `{ people, preferences, meetupStyle }`
- `GET /api/pubs/:id`
- `PATCH /api/admin/pubs/:id`

## Phase 2: Hybrid Pub Data

Google data should populate public facts. Manual pub features should remain first-party:

- beer garden
- dog friendly
- Sunday roast
- pub quiz
- live music
- craft beer
- dart board
- pool table
- showing football
- estimated pint price
- admin notes

Merge order for the recommendation response:

1. Google place facts
2. First-party admin tags
3. Search-session calculations

## Phase 3: Travel-Time Quality

Replace the local estimator with public transport duration data. The scoring model can stay stable:

```text
travel score =
40% average journey time
30% fairness / journey spread
20% longest journey
10% distance from target point
```

Cache matrix results by rounded origin/destination coordinates and departure time bucket to control cost.

## Phase 4: Reviews and Sentiment

Policy check, 2026-05-07:

- Google Places API policy says not to pre-fetch, cache or store Places API content beyond allowed exceptions; `place_id` is exempt and can be stored indefinitely.
- If the app displays Place Details, photos or reviews obtained from Google, it must display the required attributions.
- A Place response can include up to five reviews, and displayed Google-user reviews should show the author's name near the review. Google also recommends showing how reviews are sorted.
- Google-provided AI summaries have separate disclosure, reporting-link and reference-link requirements.

Official references:

- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.google.com/maps/documentation/places/web-service/legacy/details

Do not store or republish Google review text until the exact production implementation has been checked against the active Google Maps Platform agreement for the billing region. Safer MVP options:

- Store rating and review count.
- Store your own manual review summary.
- Generate sentiment only from review text the app is allowed to process.
- Store derived labels separately from raw third-party snippets.

## Phase 5: Live or Estimated Busyness

Google Places does not provide a dependable official live "popular times" feed for this MVP architecture. Keep busyness labelled as estimated unless a licensed provider is added.

Initial busyness signals:

- Friday and Saturday evening
- Sunday lunch for roast pubs
- quiz night
- sport fixture windows for football pubs
- review volume
- centrality score
- user-submitted crowd reports
