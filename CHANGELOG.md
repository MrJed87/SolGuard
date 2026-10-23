# Changelog

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
