# SolGuard UV

A free, single-page sunburn-risk and daily UV tracker. Pick a postcode, suburb or use your location, choose your skin type, and see the UV index hour by hour, how long until you burn, and when to reapply sunscreen.

Built for Australian conditions but works worldwide.

> **Not medical advice.** SolGuard UV gives estimates only. Always follow official sun protection times from the [Bureau of Meteorology](http://www.bom.gov.au/uv/) or [ARPANSA](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radiation-index), and use shade, clothing, a hat, sunglasses and SPF 50+ sunscreen.

## Features
- Hourly UV forecast with a scrubber and a chart, including cloud cover and temperature
- Burn-time estimate by skin type (Fitzpatrick I to VI), SPF and surface (sand, water, snow)
- Seasonal planner: typical UV for each month at your location, so you can see at a glance when sun protection matters
- Reapply timer that survives a page reload, with an optional notification while the page is still running in the background (see the limitations below)
- Postcode, suburb and GPS lookup; your last location is remembered on your device
- Fallback: a clear-sky solar model if the forecast can't be reached
- No account, no tracking, no backend. Settings stay in your browser's local storage. Your coordinates are sent to the data APIs below to fetch the forecast, rounded to about 1 km (about 100 m for the suburb-name lookup after "Get Location").
- Installable as an app (PWA) on Android and desktop Chrome/Edge, and works offline with a clear-sky estimate
- Self-contained: Tailwind CSS is precompiled, and Chart.js and the Inter font are bundled in `assets/`, so the only network calls are to the data APIs below

## Run it
It is a static site with no build step. Serve the folder (opening `index.html` directly also works):

```
npx serve .
```

## Install as an app
Open the deployed site in Chrome on Android, then use the menu and choose **Install app** (or **Add to Home screen**). It needs to be served over https, which Vercel and GitHub Pages both do.

If you change any file in the shell (HTML, CSS, JS, icons), bump the version in `CACHE` at the top of `sw.js` so installed copies refresh. Updates are fetched network-first, so this mostly matters for offline users.

## Develop
The page is `index.html`; styling uses Tailwind utility classes. If you add or change classes, rebuild the stylesheet:

```
npm install
npm run build:css     # or: npm run watch:css
```

`assets/tailwind.css` is committed, so deploying needs no build. `npm run update:vendor` refreshes the bundled Chart.js and Inter font from `node_modules`.

### Test
```
npm test
```

The tests in `test/` pull the script out of `index.html` and run its UV logic in Node with a stubbed page (no browser, no network). They cover the timing adjustment, the protection window, burn times, postcode handling and text contrast. They do not cover layout or real devices. GitHub Actions runs them, and checks that `assets/tailwind.css` is up to date, on every push and pull request.

### Deploy
Any static host works. For Vercel, import the repo and deploy with no build step. `vercel.json` adds security headers, including a Content Security Policy that only allows this site's own files and the four data APIs, and long-term caching for `assets/`. If you add another external service, add its host to `connect-src` there. GitHub Pages and Netlify also work.

## URL options
- `?raw` shows Open-Meteo's UV values without the timing adjustment (see below)

## How the UV numbers work
- **Forecast:** [Open-Meteo](https://open-meteo.com/) hourly `uv_index`, `uv_index_clear_sky` and `cloud_cover`.
- **Timing adjustment:** Open-Meteo's hourly UV is an average over the preceding hour, so the value labelled 1 pm describes about 12:30 pm. SolGuard blends each hour halfway toward the next so the number shown matches that clock time. This was checked against a clear-sky solar model, where a 30 minute shift fit best. It applies to every hour of the day, and night-time values are not forced to zero, so places where the clock runs well ahead of the sun (western China, Spain in summer) keep their real evening UV.
- **Protection window:** the times when UV is 3 or more, the day's peak and the "now" line all use the same UV as the gauge and chart, including any surface boost you have selected.
- **Seasonal chart:** the average of each day's highest UV (and highest clear-sky UV) per month over the last three full years, from Open-Meteo's historical forecast data on a 0.1 degree grid. It is cached per location in your browser. A month is only called "usually low" when UV is under 3 on most days and the typical peak is below 2.7, which leaves a margin for the model reading slightly low.
- **Surface boosts** follow the Bureau of Meteorology: dry sand +20%, water +10%, fresh snow +90%.
- **Burn times** are conservative estimates by skin type and are capped; they are not a substitute for sun protection times.

## Data sources and credits
- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0, free for non-commercial use), including its Historical Forecast API for the seasonal chart
- Place lookup: Open-Meteo geocoding, [Zippopotam.us](https://zippopotam.us/), BigDataCloud reverse geocoding
- [Tailwind CSS](https://tailwindcss.com/) (MIT, compiled into `assets/tailwind.css`), [Chart.js](https://www.chartjs.org/) (MIT) and the [Inter](https://rsms.me/inter/) typeface (SIL OFL 1.1, licence in `assets/fonts/OFL.txt`)

If you run this commercially or at high volume, you need an Open-Meteo commercial plan.

## Known limitations / roadmap
- No dark theme yet.
- Offline, the forecast can't load, so the app shows its clear-sky estimate (no cloud or temperature). Forecast responses are deliberately not cached, to avoid showing stale UV.
- The reapply notification is not a reliable alarm. A web page can only send it while its script is still running, and phones usually pause the page once the screen locks, so the reminder then only appears (as a tone and an on-screen message) when you come back to the app. Set a phone alarm as a backup. A dependable reminder would need a push server, which this app deliberately does not have.
- iOS Safari can add it to the home screen but handles notifications differently.
- The UV model has not been validated against official measurements in summer. The spot checks so far were three October days against Bureau of Meteorology figures. Open-Meteo's clear-sky daily peak for Sydney in January 2026 was 9.2 to 9.5, which looks low for a Sydney summer, so treat peak-season numbers as possibly under-reading until this is checked against ARPANSA data.
- The hour slider and chart cover 5 am to 8 pm. UV outside those hours still counts toward the protection window, but can't be inspected hour by hour.
- Logic is covered by `npm test`; layout and behaviour have not yet been checked on real phones or across browsers.

## Contributing
Issues and pull requests are welcome.

## Licence
[MIT](LICENSE)
