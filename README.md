# SolGuard UV

A free, single-page sunburn-risk and daily UV tracker. Pick a postcode, suburb or use your location, choose your skin type, and see the UV index hour by hour, how long until you burn, and when to reapply sunscreen.

Built for Australian conditions but works worldwide.

> **Not medical advice.** SolGuard UV gives estimates only. Always follow official sun protection times from the [Bureau of Meteorology](http://www.bom.gov.au/uv/) or [ARPANSA](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radiation-index), and use shade, clothing, a hat, sunglasses and SPF 50+ sunscreen.

## Features
- Hourly UV forecast for today and tomorrow, with a time slider and a chart, including cloud cover and temperature
- A plain status line: whether sun protection is needed now and until when, with a warning when a low-UV day is only low because of cloud
- Burn-time estimate by skin type (Fitzpatrick I to VI), SPF and surface (sand, water, snow)
- Seasonal planner: typical UV for each month at your location, so you can see at a glance when sun protection matters
- Reapply timer that survives a page reload, with an optional notification while the page is still running in the background (see the limitations below)
- Postcode, suburb and GPS lookup, looking first in the country you choose under Personalise (Australia by default); your last five places are kept on your device as quick chips
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
Any static host works. For Vercel, import the repo and deploy with no build step. `vercel.json` adds security headers, including a Content Security Policy that only allows this site's own files and the four data APIs, and long-term caching for the fonts in `assets/fonts/` (the stylesheet is versioned with `?v=` instead). If you add another external service, add its host to `connect-src` there. GitHub Pages and Netlify also work.

## URL options
- `?raw` shows Open-Meteo's UV values as they arrive: no timing adjustment and no ARPANSA correction (see below)

## How the UV numbers work
- **Forecast:** [Open-Meteo](https://open-meteo.com/) hourly `uv_index`, `uv_index_clear_sky` and `cloud_cover`, for today and tomorrow.
- **Cloud warning:** when the forecast stays under UV 3 but the clear-sky figure reaches 3 or more, the app says the day is only low because of cloud, and what UV could reach if it clears.
- **Correction to ARPANSA's level (Australia only):** Open-Meteo's UV reads low in the Australian summer and in the tropics (see the limitations below). For each day, the app compares Open-Meteo's clear-sky peak with a clear-sky model fitted to ARPANSA's UV Index model, and if Open-Meteo is lower it scales that day's forecast and clear-sky UV up by the same factor, so the effect of cloud stays exactly as forecast. It never scales down, so where Open-Meteo reads higher than ARPANSA (southern winters) nothing changes. The factor is capped at 1.6 and the same correction is applied to the seasonal chart. The header badge reads "Live UV, adjusted to ARPANSA" when it is in effect.
- **The clear-sky model:** Madronich's form, UVI = C x sin(elevation)^p x (ozone / 300)^-1.23 with Earth-Sun distance, where C, p and a latitude-and-season ozone curve were fitted to 264 half-monthly values from ARPANSA's clear-sky model at 11 sites (Darwin to Hobart). It is within 0.2 UV of those values on average and 10% at worst. The ozone curve is a fitted term, not a measurement.
- **Offline estimate:** if the forecast can't be reached, the same clear-sky model is used on its own, with no cloud.
- **Timing adjustment:** Open-Meteo's hourly UV is an average over the preceding hour, so the value labelled 1 pm describes about 12:30 pm. SolGuard blends each hour halfway toward the next so the number shown matches that clock time. This was checked against a clear-sky solar model, where a 30 minute shift fit best. It applies to every hour of the day, and night-time values are not forced to zero, so places where the clock runs well ahead of the sun (western China, Spain in summer) keep their real evening UV.
- **Protection window:** the times when UV is 3 or more, the day's peak and the "now" line all use the same UV as the gauge and chart, including any surface boost you have selected.
- **Seasonal chart:** the average of each day's highest UV (and highest clear-sky UV) per month over the last three full years, from Open-Meteo's historical forecast data on a 0.1 degree grid, with the correction above applied day by day. It is cached per location in your browser. A month is only called "usually low" when UV is under 3 on most days and the typical peak is below 2.7.
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
- **Open-Meteo's UV differs from ARPANSA's, and only the low side is corrected.** Checked on 16 Nov 2026 against ARPANSA's clear-sky UV Index model (typical cloudless solar-noon UV at its monitoring sites), using Open-Meteo's clear-sky daily peak averaged over 2023 to 2025 at the same coordinates:
  - December to February: Open-Meteo is about 16% lower in Sydney and Adelaide, 13% in Melbourne, 20% in Perth, 22% in Brisbane and 27% in Darwin (for example Sydney in January 9.2 against 11.3, Darwin in February 9.8 against 13.6). Its clear-sky peak never went above 10.0 at any of the eight sites in three years. **This is corrected** (see above).
  - June to August: Open-Meteo is higher, by about 35% in Sydney and 55% in Melbourne (Sydney in June 3.4 against 2.4). **This is deliberately left alone**, so winter figures in the southern states read higher than ARPANSA's. That is the cautious direction for a sunburn tool.
  - April and October are close to ARPANSA's figures in the southern capitals.
  - The reference is itself a model of a typical cloudless day, not measurements. The corrected figures have not yet been compared with ARPANSA's live measured readings on a clear summer day; that would be the real test.
  - The correction is one factor per day from the noon peak. It assumes Open-Meteo's shape through the day is right and only its height is wrong.
  - Outside Australia nothing is corrected, because nothing there was checked. Open-Meteo may read low in other sunny places too.
- The hour slider and chart cover 5 am to 8 pm. UV outside those hours still counts toward the protection window, but can't be inspected hour by hour.
- Postcode lookup outside Australia depends on Zippopotam's coverage of the chosen country and has only been tested with stubbed responses. UK and Canadian postcodes are matched on their first half.
- Link previews use a relative image address, which some services ignore; put the deployed site's full address in the `og:image` tag in `index.html` if the preview image doesn't show.
- Logic is covered by `npm test`; layout has been checked in one desktop browser at phone, tablet and desktop widths, but not yet on real phones or across browsers.

## Contributing
Issues and pull requests are welcome.

## Licence
[MIT](LICENSE)
