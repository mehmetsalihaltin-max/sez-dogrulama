# SEZ — evidence check for a flight route

SEZ answers one question for an airline operations team: *is there verified evidence of something on this route, on this date, that should make us look again?* It covers weather, volcanic ash, flooding, earthquakes, strikes, fuel supply, airport faults, airspace restrictions and conflict-related airspace risk.

It does not say a route is safe. It says what evidence exists, how strong it is, and what is still unconfirmed.

Built for the Meta Global AI Developer Hackathon (Startup track, "Build for Your World").

## Built during the hackathon

Everything in this repository was written during the building period. The first commit is dated 1 November 2026; `git log` shows the full history. SEZ also has a separate, older daily briefing product (not in this repository). No code from it was copied here.

## How it works

1. **Question → route.** The question can be typed or spoken: "Ask by voice" records the microphone in the browser, Meta Muse Voice Transcribe turns it into text, and the audio is not stored. If the spoken question names the places and year of a saved example, the saved run opens at no cost. Muse Spark reads the question (route, country, date). The route is drawn in code from real airport coordinates and, when available, a real flight track.
2. **Scan.** Muse Spark with web search lists events that could affect flights at or over the airports and countries on the route.
3. **Evidence gate.** Each event becomes a checkable claim. The claim is searched in local languages on Google News. Muse Spark judges each headline in groups of 15 and must quote the exact words that prove it. Code then checks that the quote is really in the headline, the publish date is inside the window, and the place name appears. The level (confirmed by news, partial, single source, contradicted, no evidence) is decided in code, not by the model. Publishers are counted by distinct domain; aggregators, social posts and near-identical headlines (re-posted agency stories) are not counted.
4. **Article body channel.** If headlines are not enough, Muse Spark web search brings sentences from article bodies. Code opens each page itself and searches for the sentence. The page text is never sent to the model.
5. **Official sources to check.** In our test, every official page we found (airport operators, aviation authorities, volcanic ash centres) returned 403 or did not respond, with or without a VPN. We did not test every official site. So SEZ does not claim official confirmation. NOTAMs are read live in code. For everything else, Muse Spark names up to three official organisations the team should check before deciding, and the screen says these are suggestions SEZ did not open.
6. **Evidence memory.** Sources that passed the gate are kept per event and sent through the same gate again on the next query, so a new query does not lose what an earlier one found. Google News links are resolved to the publisher URL. A source whose page returns 404 or 410 is dropped.
7. **Satellite.** For each airport, the last clear Copernicus Sentinel-2 pass is shown and read by Muse Spark (vision) as a second channel. It never changes the evidence level.
8. **Runway scene (Porto Alegre, May 2024).** Meta SAM 3.1 segments the runway from one human-placed point on a dry-day image. Water on the runway is measured in code with two methods from the same Sentinel-2 pass (NDWI and the ESA scene classification water class). A number is shown only when both agree within 10 points. The three flights and the 10% limit in this scene are fictional.

"Confirmed" in SEZ means *supported by at least three different news publishers*, counted by distinct domain after removing aggregators and re-posted copies. When the screen or the demo says "independent publishers", this is what it means: code does not and cannot prove editorial independence. It is not official confirmation; the screen says so.

## Meta models used

| Model | Where | What it does |
|---|---|---|
| Muse Spark 1.3 | `src/rota.ts`, `src/dogrula.ts`, `src/govde.ts` | Question parsing, event scan with web search, claim extraction, headline matching with exact quotes |
| Muse Spark 1.3 (vision) | `src/meydan.ts` | Reads Sentinel-2 images of airports and event sites |
| SAM 3.1 | `src/sam.ts`, `src/pist.ts` | Runway segmentation from a single point prompt |
| Muse Image 1.0 | `web/tehlike/` | One illustration per hazard type on the finding cards, labelled in code as "AI illustration, not evidence". No text or numbers come from the model. |
| Muse Voice Transcribe 1.0 | `src/muse.ts` (`yaziyaDok`), `src/sunucu.ts` (`/api/ses`), `web/index.html` | Spoken questions from the operations team, with place-name keywords; returns text only |

## Run it

Requires Node.js 24.

```
npm install
node src/sunucu.ts
```

Open http://127.0.0.1:4173. Without any keys the four example questions and the Porto Alegre scene open from saved runs in `demo/`. Each saved result shows when it was evaluated and what that run cost.

For new questions, copy `.env.example` to `.env`, add a Meta Model API key and start with `node --env-file=.env src/sunucu.ts`. Other keys (3D map, live NOTAMs, flight tracks) are optional; the app falls back when they are missing.

Tests: `npm test`.

## Evaluation

`ornek/sinav15.json` holds 15 claims with expected answers: 7 real events from October 2026 and 8 deliberately altered claims: 4 change the cause or scope of a real event (8, 11, 14, 15), 3 are fully invented (9, 10, 13) and 1 inflates the scope of an unverified report (12). Each row says what was changed. Run with:

```
node --env-file=.env src/hat.ts ornek/sinav15.json cikti/sinav.json
```

Evidence memory is off during evaluation so every run is independent.

Run of 3 November 2026, evening Turkish time (claim 4 failed once on a network error and was re-run alone):

| | Claims | Result |
|---|---|---|
| Real events | 7 | Supported (confirmed by news or partial): 4. Not supported: 3 (two "contradicted", one single source) |
| Altered claims | 8 | Rejected: 8. False confirmations: 0 |

Full run output, claim by claim (every query, headline, model quote, rejected source and the code's reason for the level): `sonuc/sinav15-sonuc.json` and, for the re-run of claim 4, `sonuc/sinav15-satir4-yeniden.json`. The `ozet` field holds the counts above. In these published copies the names of two airlines inside third-party headlines are masked as `[havayolu]` (13 places), and the local input path in the re-run's `dosya` field was replaced with the repo path; nothing else was changed.

News links behind the expected answers are in `ornek/sinav15-kaynaklar.json`. They were collected after the run, so they do not affect it; the four altered real events point to the row of the real event; invented claims have no source by design.

Total cost about $5.16 for the 15 claims. SEZ errs on the cautious side: it confirmed none of the altered claims, and it failed to support three real ones. In the Schiphol case nine publishers supported the claim and three Turkish headlines that report the same storm cancellations were misread by the model as contradicting it; any contradiction currently turns the level into "contradicted".

This strictness is a design choice for aviation safety. SEZ exists to cut the noise an operations team works through, so a doubtful event is shown as "contradicted" and sent to the official sources and NOTAMs for a decision, rather than raised to "confirmed". A false confirmation costs more than a missed one. As the code and the models mature, the contradiction rule will be refined (de-duplicating contradicting sources the same way supporting ones are) and the evaluation re-run and published.

## Known limits

- Independence is judged from publisher domain and headline similarity. It does not prove that two publishers did not copy the same source.
- The claim window runs from two days before to five days after the event date (`src/dogrula.ts`); undated questions use the last seven days up to tomorrow. Results for dated questions are a retrospective review of a past event; they are not what was known on the day of the event and are not an early-warning claim.
- The article body channel (`src/govde.ts`) only produces "supports" decisions. A contradicting sentence in an article body is not processed; contradictions come from headlines only.
- Every answered question is saved (`cikti/sorgu/`) and the same question text opens the saved run, with its evaluation date and a "saved" label; a spoken question opens a saved example when its places and year match. There is no re-scan button yet, so asking the same "this week" question a week later shows the earlier run until its file is deleted.
- Contradicting headlines are counted as they come; they are not de-duplicated or filtered for aggregators the way supporting ones are.
- A single contradicting source outweighs any number of supporting ones. This is deliberate caution for a safety domain, and it also hides real events (see Evaluation).
- Some publishers block automated requests (401/403); those sources are kept, not counted as deleted.
- The Google News link resolution uses an undocumented Google endpoint. If it stops working, the check falls back to the Google link.
- Runway water is measured from 10 m Sentinel-2 pixels; the two methods come from the same image, so they are not statistically independent.

## Production notes

This repository is the hackathon build: one server process that runs on the operator's own machine (bound to 127.0.0.1) and stores runs as files. Moving it into an operations centre adds three things: user sign-in, a spend limit per team and per question, and a database with a scheduled re-scan for saved routes. The evidence gate, the evaluation set and the saved-run format stay as they are.

## Data sources

- Copernicus Sentinel-2 data, processed (Earth Search, Element 84).
- Maxar Open Data Program, CC BY-NC 4.0 (Porto Alegre close-up).
- Flight tracks: Flightradar24 API, or tracks traced by hand when no key is set.
- NOTAMs: Autorouter.
- News: Google News search and publisher pages.
- Map: Google Maps 3D, or a 2D map from Natural Earth via world-atlas.
