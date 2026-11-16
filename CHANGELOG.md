# Changelog

## 0.7.0 (2026-11-16)
Fixes and additions from a second full audit (code and UI/UX).

Safety and numbers
- **A low day that is only low because of cloud now says so.** When the forecast stays under UV 3 but the clear-sky figure is 3 or more, the status line reads "only because of cloud. If it clears, UV could reach X" instead of "sun protection isn't needed today". Days with a protection window also mention a much higher clear-sky ceiling.
- **Tomorrow's forecast.** Two days are fetched. A Today / Tomorrow switch moves the whole page to tomorrow, and once today's sun protection is over the status line says when it is needed tomorrow.
- **Softer wording below UV 1.** "No Burn Risk", "Safe Outdoors" and "UV too low to cause sunburn" became "Burn unlikely", "Not needed" and "UV is too low to burn most skin".
- **UV raised to ARPANSA's level in Australia.** Open-Meteo's UV was checked against ARPANSA's clear-sky UV Index model at eight sites and reads 13 to 27% low from December to February (Sydney in January 9.2 against 11.3, Darwin in February 9.8 against 13.6), never going above 10. Each day's forecast and clear-sky UV are now scaled up together so the clear-sky peak matches a model fitted to ARPANSA's figures. The effect of cloud is kept as forecast. The correction only ever raises: winter figures, where Open-Meteo reads higher than ARPANSA, are left alone. It applies inside Australia only, is capped at +60%, reaches the seasonal chart too, and `?raw` turns it off. The badge reads "Live UV, adjusted to ARPANSA" when it is in effect.
- **Offline estimate rebuilt on the same model.** The clear-sky fallback uses the ARPANSA-fitted model (within 0.2 UV of ARPANSA's figures on average, 10% at worst, across 11 sites). The old one was capped at about UV 11 for an overhead sun.
- A gap in the forecast is no longer shown as UV 0 (the clear-sky value stands in), a day that is mostly missing counts as a failed fetch, and missing cloud or temperature shows "n/a" instead of an invented 12% and 21°C.

Finding a place
- **Country setting** (under Personalise, default Australia). Suburb searches look in that country first, and postcodes are looked up there. This replaces the old rule where any 5-digit number was treated as a US zip code.
- **No more needless "which place?" list.** When every place under a postcode is within about 10 km (so they share a forecast), the app just loads it. Typing 2000 no longer asks you to choose between six spots in the Sydney CBD.
- **Recent places** replace the fixed city chips. The last five places you picked appear under the search box; new Australian visitors still get the six starter cities. The row hides when it would only show the place already on screen.
- A slow postcode lookup now shows "Looking up 2450..." instead of nothing.
- The "Get Location" button no longer stays on "Locating..." when the permission prompt is dismissed without an answer.
- ACT postcodes 2900 to 2920 are no longer guessed as regional NSW.

Layout and messages
- **Fixed the desktop summary card**, where the location name and status were squeezed into a narrow column beside the three pills. The card is now stacked at every width.
- **Messages are pinned to the bottom of the screen** and go away by themselves (6 seconds, 12 for warnings). They used to sit at the top of the page, out of sight when you were scrolled down.
- A paused reapply timer no longer shows the old due time, and timer times use am/pm like the rest of the app.
- The burn card has a "Change" link to the skin type choice.
- Hour buttons now cover 7 am to 6 pm (two even rows on a phone), the chart marks the current time, and the seasonal chart fades while another place's data loads.
- The date and "Updated" time are the location's own, and say so when it differs from your device's.
- Plainer wording throughout: "Your skin type" (was "Fitzpatrick Skin Phototype"), "Surface around you" (was "Albedo"), "Until skin starts to redden", and so on. The guidance cards are no longer labelled as a Cancer Council / ARPANSA protocol, or as five steps when there are four cards.

Accessibility
- The hour slider announces "10:00 AM, UV 4.2" rather than "10".
- The skin type, sunscreen and surface button groups are labelled as groups.
- Larger tap targets for the close buttons, "Reset to Now" and "Reset Defaults".
- The smallest text went from 10px to 11px, and 11px text to 12px.
- Animations are turned off for people who ask their device for reduced motion.

Under the hood
- The forecast refreshes as soon as the device comes back online, instead of up to 30 minutes later.
- Service worker: a slow network no longer hangs the page (the cached copy is shown after 4 seconds), and `index.html` is no longer pre-cached separately, which could store a redirect on hosts with clean URLs.
- Link-preview tags, and the page description no longer says "Australian".
- 20 new tests (47 in total).

Still open: the reference is ARPANSA's clear-sky model, not its measured readings, and the corrected figures have not been compared with live measurements on a summer day (see the README).

## 0.6.4 (2026-11-16)
Fixes from a full audit.
- **Surface boost now reaches the protection window.** The UV 3 window, the day's peak and the "now" line use the same boosted UV as the gauge and chart. Before, with Fresh Snow selected the gauge could read "Moderate" while the status line said protection wasn't needed.
- **No made-up readings while loading.** The page no longer shows sample numbers (UV 4.7, "~32 mins", "9:15 AM – 4:45 PM") before real data arrives or when the script can't run; it shows dashes and "Loading" instead.
- **Evening UV is no longer clamped to 0.2 from 8 pm to 5 am.** The timing adjustment now applies to every hour, so places where the clock runs ahead of the sun keep their real evening UV.
- **A failed postcode lookup no longer sticks.** A regional guess is remembered as a guess and looked up again next time, instead of being reused forever.
- Low-UV wording no longer says "without burn risk" next to a burn time.
- The reapply timer's note and the README now say plainly that the notification only works while the page is still running, and suggest a phone alarm as a backup.
- Privacy: coordinates are rounded before they are sent (about 1 km for the forecast, about 100 m for the suburb lookup), and a GPS fix is stored at about 100 m.
- Accessibility: darker UV colours for the hour buttons and one section label (now at least 4.5:1), keyboard focus stays put when you pick an hour or skin type, messages are announced to screen readers, the "now" line is announced only when its answer changes, and the collapsed mobile search controls leave the tab order.
- Added `npm test` (Node's built-in test runner, no new dependencies) and a GitHub Actions workflow.
- README: noted that the UV model still needs checking against official summer measurements.

## 0.6.3 (2026-10-23)
- Seasonal chart legend now explains the outlined bar (the current month).

## 0.6.2 (2026-10-23)
- Seasonal planner is more cautious: a month is only called "usually low" when its typical peak is below 2.7 (and under 3 on most days), leaving a margin for model values that read a little under official figures. Checked against Bureau of Meteorology hourly UV and sun protection times for Windang, Sydney and Bacchus Marsh: the app's protection windows contained the Bureau's on all three days.

## 0.6.1 (2026-10-23)
- Fixed stale styles after updates: the stylesheet is now fetched with a version tag and is no longer cached for a year (only the fonts are). When you change `assets/tailwind.css`, bump the `?v=` number in `index.html` and `sw.js`.

## 0.6.0 (2026-10-23)
- New "Typical UV through the year" chart: average daily peak UV for each month at your location (three-year average), with the clear-sky ceiling, a UV 3 line, the percentage of days reaching UV 3, and a plain-English note on which months are usually low and when to start watching. Loads only when you scroll to it, and is cached on your device.

## 0.5.3 (2026-10-23)
- When a typed postcode covers several places, SolGuard now asks which one you mean instead of guessing.
- Removed the 2528 Shellharbour quick chip.

## 0.5.2 (2026-10-23)
- Reapply notification now goes through the service worker, which is the only way Android Chrome and installed PWAs allow it (the old call failed silently there).

## 0.5.1 (2026-10-23)
- Default location is now 2000 Sydney.

## 0.5.0 (2026-10-23)
- PWA: web app manifest, icons (including a maskable icon), and a service worker so SolGuard can be installed on Android and works offline.

## 0.4.0 (2026-10-23)
- Replaced the Tailwind Play CDN with a precompiled stylesheet (about 29 KB), and bundled Chart.js and the Inter font locally. No third-party scripts or fonts load at runtime.
- Added a Content Security Policy and asset caching in `vercel.json`.
- Fixed the header flickering when scrolling quickly: it is now fixed-position with a spacer, so collapsing it no longer changes the page layout.

## 0.3.0 (2026-10-23)
- UV smoothing now matches Open-Meteo's timestamps: hourly UV is a mean over the preceding hour, so every daylight hour (6 am to 7 pm) is blended halfway toward the next hour. Previously only 3 pm onward was adjusted, which under-reported morning UV.
- `?raw` URL parameter shows the unadjusted Open-Meteo values.

## 0.2.0
- Suburb and town search (Open-Meteo geocoding), optional postcode.
- Auto-refresh, "now" status line, persistent reapply timer with notifications.
- Surface boosts corrected to Bureau of Meteorology figures (water +10%, dry sand +20%, fresh snow +90%).
- Contrast and accessibility fixes.

## 0.1.0
- Fixes to the original Gemini prototype: Firefox slider, request race conditions, location time zone handling, timer drift, footer disclaimer.
