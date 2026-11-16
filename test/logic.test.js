const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT, HTML, loadApp, json, bellDay, contrast } = require("./harness");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Put a day of UV into the app and render it at a given time
function showDay(app, raw, { hour = 12, surface = 1.0 } = {}) {
  app.state.hourlyData = app.calibrateLiveHourlySeries(raw, raw, [], []);
  app.state.surfaceMultiplier = surface;
  app.state.selectedHour = hour;
  app.state.currentLocalHour = hour;
  app.state.currentFrac = hour;
  app.renderAll();
}

test("timing adjustment blends every hour halfway toward the next", () => {
  const app = loadApp();
  const raw = Array.from({ length: 24 }, (_, h) => h); // 0, 1, 2, ... 23
  const out = app.calibrateLiveHourlySeries(raw, raw, [], []);
  assert.equal(out.length, 24);
  for (let h = 0; h < 23; h++) assert.equal(out[h].uv, h + 0.5, `hour ${h}`);
  assert.equal(out[23].uv, 23, "the last hour has no next value, so it is left as it is");
});

test("evening UV is not clamped where the clock runs ahead of the sun", () => {
  const app = loadApp();
  // Shaped like Kashgar on 21 June: still UV 3 at 8 pm clock time
  const raw = bellDay(8, 16);
  raw[20] = 3; raw[21] = 1.4; raw[22] = 0.2;
  const out = app.calibrateLiveHourlySeries(raw, raw, [], []);
  assert.equal(out[20].uv, 2.2);
  assert.equal(out[21].uv, 0.8);
});

test("?raw shows Open-Meteo's values without the timing adjustment", () => {
  const app = loadApp({ search: "?raw" });
  const raw = bellDay(9);
  const out = app.calibrateLiveHourlySeries(raw, raw, [], []);
  assert.equal(out[12].uv, +raw[12].toFixed(1));
});

test("clear-sky UV is never shown below the forecast UV", () => {
  const app = loadApp();
  const uv = bellDay(9);
  const clear = bellDay(7);
  app.calibrateLiveHourlySeries(uv, clear, [], []).forEach((d) => assert.ok(d.clearSkyUv >= d.uv));
});

test("protection window is found by interpolating the UV 3 crossings", () => {
  const app = loadApp();
  showDay(app, bellDay(9));
  const s = app.computeDailySummary();
  const uv = app.state.hourlyData.map((d) => d.uv);
  // Each crossing lies between the last hour under 3 and the first hour at 3 or more
  assert.ok(uv[Math.floor(s.startCross)] < 3 && uv[Math.ceil(s.startCross)] >= 3, `start ${s.startCross}`);
  assert.ok(uv[Math.floor(s.endCross)] >= 3 && uv[Math.ceil(s.endCross)] < 3, `end ${s.endCross}`);
  assert.ok(s.startCross < 12 && s.endCross > 12);
  assert.equal(s.peakHour, 12);
  assert.match(app.el("nowStatusSentence").textContent, /Sun protection needed for another/);
});

test("a low day says protection isn't needed, and the gauge agrees", () => {
  const app = loadApp();
  showDay(app, bellDay(2));
  assert.equal(app.computeDailySummary().startCross, null);
  assert.match(app.el("nowStatusSentence").textContent, /stays below 3 all day/);
  assert.equal(app.el("uvCategoryPill").textContent, "Low Risk");
});

test("surface boost reaches the protection window, peak and status line", () => {
  const app = loadApp();
  showDay(app, bellDay(2), { surface: 1.9 }); // fresh snow turns a UV 2 day into UV 3.8
  const s = app.computeDailySummary();
  assert.equal(s.peakUv, 3.8);
  assert.notEqual(s.startCross, null);
  assert.equal(app.el("uvIndexBigNumber").textContent, "3.8");
  assert.equal(app.el("uvCategoryPill").textContent, "Moderate Risk");
  assert.match(app.el("peakUvDisplay").textContent, /UV 3\.8 \(Moderate\)/);
  assert.doesNotMatch(app.el("nowStatusSentence").textContent, /isn't needed/);
  assert.notEqual(app.el("protectionWindowDisplay").textContent, "None forecast");
  assert.match(app.el("dailySummarySentence").innerHTML, /\+90% boost/);
});

test("the summary and the gauge agree at every hour for every surface", () => {
  const app = loadApp();
  for (const surface of [1.0, 1.1, 1.2, 1.9]) {
    for (const peak of [1.5, 2.6, 2.9, 3.1, 6, 12]) {
      showDay(app, bellDay(peak), { surface });
      const s = app.computeDailySummary();
      const shown = app.state.hourlyData.map((d) => +(d.uv * surface).toFixed(1));
      assert.equal(s.peakUv, Math.max(...shown));
      assert.equal(s.dangerCount, shown.filter((v) => v >= 3).length);
    }
  }
});

test("burn times follow skin type and UV, within the stated caps", () => {
  const app = loadApp();
  app.state.surfaceMultiplier = 1;
  app.state.skinTypeId = 1;
  app.state.spf = 50;
  assert.equal(app.computeBurnTimes(10).unprotectedMins, 12);
  assert.equal(app.computeBurnTimes(10).protectedMins, 120, "never promises more than the 2 hour reapply window");
  assert.equal(app.computeBurnTimes(40).unprotectedMins, 4, "floor of 4 minutes");
  assert.equal(app.computeBurnTimes(0.5).unprotectedMins, null, "no burn time below UV 0.8");
  app.state.skinTypeId = 6;
  assert.ok(app.computeBurnTimes(10).unprotectedMins > 12);
  app.state.skinTypeId = 1;
  app.state.surfaceMultiplier = 1.9;
  assert.ok(app.computeBurnTimes(5).unprotectedMins < 24, "a surface boost shortens the burn time");
});

test("burn times are never longer than the MED-based figure", () => {
  // Minutes to 1 MED = MED (J/m2) / (UVI x 0.025 W/m2) / 60. Typical MEDs by Fitzpatrick type.
  const app = loadApp();
  const med = { 1: 200, 2: 250, 3: 350, 4: 450, 5: 600, 6: 1000 };
  app.state.surfaceMultiplier = 1;
  for (const id of [1, 2, 3, 4, 5, 6]) {
    app.state.skinTypeId = id;
    for (const uv of [3, 6, 9, 12]) {
      const reference = med[id] / (uv * 0.025) / 60;
      assert.ok(app.computeBurnTimes(uv).unprotectedMins <= Math.ceil(reference), `type ${id} at UV ${uv}`);
    }
  }
});

test("UV bands match the WHO scale", () => {
  const app = loadApp();
  const level = (v) => app.getUvRiskMeta(v).level;
  assert.deepEqual([0, 2.9, 3, 5.9, 6, 7.9, 8, 10.9, 11, 15].map(level),
    ["Low", "Low", "Moderate", "Moderate", "High", "High", "Very High", "Very High", "Extreme", "Extreme"]);
});

test("low-UV wording never promises no burn risk next to a burn time", () => {
  const app = loadApp();
  app.state.skinTypeId = 1;
  const raw = bellDay(2.9);
  showDay(app, raw);
  assert.match(app.el("unprotectedBurnTime").textContent, /mins|hrs/);
  assert.doesNotMatch(app.el("burnUrgencyLabel").textContent, /without burn risk/i);
  assert.doesNotMatch(app.getUvRiskMeta(1).urgency, /without burn risk|safe/i);
});

test("UV text colours meet 4.5:1 contrast on the hour buttons", () => {
  const app = loadApp();
  for (const uv of [1, 4, 7, 9, 12]) {
    const meta = app.getUvRiskMeta(uv);
    for (const bg of ["#ffffff", "#f1f5f9"]) {
      assert.ok(contrast(meta.textHex, bg) >= 4.5, `${meta.level} ${meta.textHex} on ${bg}: ${contrast(meta.textHex, bg).toFixed(2)}`);
    }
  }
});

test("hour buttons are updated in place, so keyboard focus is kept", () => {
  const app = loadApp();
  showDay(app, bellDay(9));
  const before = [...app.el("hourlyStripContainer").children];
  assert.equal(before.length, 12, "7 am to 6 pm");
  before[3].click(); // 10 am
  assert.equal(app.state.selectedHour, 10);
  const after = app.el("hourlyStripContainer").children;
  after.forEach((btn, i) => assert.equal(btn, before[i]));
  assert.equal(after[3].attrs["aria-pressed"], "true");
  assert.equal(after[5].attrs["aria-pressed"], "false");
});

test("screen readers hear the status only when its answer changes", async () => {
  const app = loadApp();
  showDay(app, bellDay(9), { hour: 12 });
  await wait(100);
  assert.equal(app.el("srAnnouncer").textContent, "", "nothing announced on first render");
  app.state.currentFrac = 12.5;
  app.renderAll();
  await wait(100);
  assert.equal(app.el("srAnnouncer").textContent, "", "a countdown tick is not announced");
  app.state.currentFrac = 19;
  app.renderAll();
  await wait(100);
  assert.match(app.el("srAnnouncer").textContent, /isn't needed until tomorrow/);
});

test("a postcode that can't be looked up is flagged as a guess, then fixed on retry", async () => {
  const app = loadApp(); // offline
  await app.loadUvForPostcode("2450", true, { offerChoice: true });
  assert.equal(app.state.postcode, "2450");
  assert.equal(app.state.locationApprox, true);
  assert.equal(JSON.parse(app.store.solguard_uv_user_prefs_v1).approx, true);

  app.setFetch(async (url) => url.includes("zippopotam")
    ? json({ places: [{ "place name": "Coffs Harbour", "state abbreviation": "NSW", latitude: "-30.2963", longitude: "153.1135" }] })
    : json({}, false));
  await app.loadUvForPostcode("2450", true, { offerChoice: true });
  assert.equal(app.state.locationName, "Coffs Harbour, NSW");
  assert.equal(app.state.lat, -30.2963);
  assert.equal(app.state.locationApprox, false);
  assert.equal(JSON.parse(app.store.solguard_uv_user_prefs_v1).approx, false);
});

test("an unknown postcode leaves the current location untouched", async () => {
  const app = loadApp();
  const before = { ...app.state };
  await app.loadUvForPostcode("9999", true, { offerChoice: true });
  assert.equal(app.state.postcode, before.postcode);
  assert.equal(app.state.lat, before.lat);
  assert.match(app.el("statusToastMsg").textContent, /Couldn't find postcode/);
});

test("built-in postcodes resolve without the network", async () => {
  const app = loadApp();
  await app.loadUvForPostcode("800", true); // NT postcodes lose their leading zero
  assert.equal(app.state.postcode, "0800");
  assert.equal(app.state.locationName, "Darwin, NT");
  assert.ok(!app.requests.some((u) => u.includes("zippopotam")));
});

test("offline, the app falls back to a clear-sky estimate and says so", async () => {
  const app = loadApp();
  await app.loadUvForPostcode("2000", false);
  assert.equal(app.state.isLiveApi, false);
  assert.equal(app.state.hourlyData.length, 24);
  assert.equal(app.el("dataSourceText").textContent, "Clear-Sky Estimate (offline)");
  assert.equal(app.el("cloudCoverVal").textContent, "n/a", "no invented cloud figure");
});

test("the forecast request sends coordinates rounded to about 1 km", async () => {
  const app = loadApp();
  app.state.lat = -33.868812;
  app.state.lon = 151.209296;
  await app.fetchUvDataForCurrentCoords();
  const url = new URL(app.requests.find((u) => u.includes("api.open-meteo.com")));
  assert.equal(url.searchParams.get("latitude"), "-33.87");
  assert.equal(url.searchParams.get("longitude"), "151.21");
});

test("a GPS fix is rounded to about 100 m before it is stored or sent", async () => {
  const geolocation = {
    getCurrentPosition: (ok) => ok({ coords: { latitude: -34.5833219, longitude: 150.8667481 } })
  };
  const app = loadApp({
    geolocation,
    fetch: async (url) => url.includes("bigdatacloud")
      ? json({ postcode: "2528", locality: "Shellharbour", principalSubdivisionCode: "AU-NSW" })
      : json({}, false)
  });
  app.requestDeviceLocation(false);
  await wait(50);
  assert.equal(app.state.lat, -34.583);
  assert.equal(app.state.lon, 150.867);
  assert.equal(app.state.locationName, "Shellharbour, NSW");
  const rev = new URL(app.requests.find((u) => u.includes("bigdatacloud")));
  assert.equal(rev.searchParams.get("latitude"), "-34.583");
  for (const u of app.requests) assert.doesNotMatch(u, /\d\.\d{4,}/, `too precise: ${u}`);
  const saved = JSON.parse(app.store.solguard_uv_user_prefs_v1);
  assert.equal(saved.lat, -34.583);
});

test("saved preferences load only when well formed", () => {
  const good = loadApp({ storage: { solguard_uv_user_prefs_v1: JSON.stringify({ postcode: "2533", locationName: "Kiama, NSW", lat: -34.67, lon: 150.85, skinTypeId: 4, spf: 30, surfaceMultiplier: 1.2 }) } });
  good.loadPreferencesFromStorage();
  assert.equal(good.state.locationName, "Kiama, NSW");
  assert.equal(good.state.skinTypeId, 4);
  assert.equal(good.state.spf, 30);
  assert.equal(good.state.surfaceMultiplier, 1.2);

  const bad = loadApp({ storage: { solguard_uv_user_prefs_v1: JSON.stringify({ postcode: "<script>", locationName: "X", lat: "nope", lon: 1, skinTypeId: 99, spf: 7, surfaceMultiplier: 5 }) } });
  bad.loadPreferencesFromStorage();
  assert.equal(bad.state.postcode, "2000");
  assert.equal(bad.state.locationName, "Sydney CBD, NSW");
  assert.equal(bad.state.skinTypeId, 2);
  assert.equal(bad.state.spf, 50);
  assert.equal(bad.state.surfaceMultiplier, 1.0);

  const garbage = loadApp({ storage: { solguard_uv_user_prefs_v1: "{not json" } });
  assert.equal(garbage.loadPreferencesFromStorage(), false);
});

test("seasonal summary only calls a month low when it is clearly under 3", () => {
  const app = loadApp();
  const time = [], uv = [], clear = [];
  const peaks = [11, 10, 8, 5.5, 3.2, 2.2, 2.4, 2.9, 5, 7, 9, 10.5]; // southern-hemisphere shape
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 28; d++) {
      time.push(`2025-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      uv.push(peaks[m]);
      clear.push(peaks[m] + 1);
    }
  }
  const months = app.summariseYearData({ time, uv_index_max: uv, uv_index_clear_sky_max: clear });
  assert.equal(months.length, 12);
  assert.equal(months[5].avg, 2.2);
  const { runs } = app.lowUvRuns(months);
  assert.deepEqual(JSON.parse(JSON.stringify(runs)), [{ start: 5, end: 6 }], "June and July only; August (2.9) is borderline");
  assert.match(app.buildYearInsight(months), /August is borderline/);
});

// ---- 0.7.0 ----

// An Open-Meteo style response covering two days
function twoDayForecast(todayUv, tomorrowUv, { clear } = {}) {
  const uv = todayUv.slice(0, 24).concat(tomorrowUv.slice(0, 24));
  const time = uv.map((_, i) => `2026-11-${i < 24 ? 16 : 17}T${String(i % 24).padStart(2, "0")}:00`);
  return json({
    utc_offset_seconds: 39600,
    hourly: { time, uv_index: uv, uv_index_clear_sky: clear || uv, cloud_cover: uv.map(() => 50), temperature_2m: uv.map(() => 20) }
  });
}

test("a low day that is only low because of cloud says so", () => {
  const app = loadApp();
  app.state.hourlyData = app.calibrateLiveHourlySeries(bellDay(2), bellDay(9), [], []);
  app.state.selectedHour = 12;
  app.state.currentLocalHour = 12;
  app.state.currentFrac = 12;
  app.renderAll();
  const line = app.el("nowStatusSentence").textContent;
  assert.match(line, /only because of cloud/);
  assert.match(line, /could reach \d/);
  assert.doesNotMatch(line, /isn't needed/);
  assert.equal(app.el("protectionWindowDisplay").textContent, "None forecast");
});

test("a day with a window mentions a much higher clear-sky ceiling", () => {
  const app = loadApp();
  app.state.hourlyData = app.calibrateLiveHourlySeries(bellDay(4), bellDay(10), [], []);
  app.state.selectedHour = 12;
  app.state.currentFrac = 12;
  app.renderAll();
  assert.match(app.el("dailySummarySentence").innerHTML, /under a clear sky it could reach UV \d/);
});

test("below UV 1 the burn card makes no promise of safety", () => {
  const app = loadApp();
  showDay(app, bellDay(0.5));
  const text = ["unprotectedBurnTime", "unprotectedBurnNote", "protectedBurnTime", "protectedBurnNote"]
    .map((id) => app.el(id).textContent).join(" | ");
  assert.doesNotMatch(text, /no burn risk|safe|too low to cause/i);
  assert.match(text, /unlikely/i);
});

test("both burn cards use the same units when no sunscreen is chosen", () => {
  const app = loadApp();
  app.state.skinTypeId = 6;
  app.state.spf = 1;
  showDay(app, bellDay(3.5));
  assert.match(app.el("unprotectedBurnTime").textContent, /hrs/);
  assert.equal(app.el("protectedBurnTime").textContent, app.el("unprotectedBurnTime").textContent);
  assert.equal(app.formatBurnMins(119), "~119 mins");
  assert.equal(app.formatBurnMins(150), "~2.5 hrs");
});

test("durations read naturally", () => {
  const app = loadApp();
  assert.equal(app.formatDuration(1), "1 h");
  assert.equal(app.formatDuration(1.5), "1 h 30 min");
  assert.equal(app.formatDuration(0.25), "15 min");
});

test("two days are fetched, and tomorrow can be viewed", async () => {
  const app = loadApp({ fetch: async (url) => url.includes("api.open-meteo.com") ? twoDayForecast(bellDay(2), bellDay(9)) : json({}, false) });
  app.state.lat = -36.85; // Auckland: outside Australia, so the made-up low day isn't lifted by the ARPANSA correction
  app.state.lon = 174.76;
  await app.fetchUvDataForCurrentCoords();
  assert.match(app.requests.find((u) => u.includes("api.open-meteo.com")), /forecast_days=2/);
  assert.equal(app.state.viewDay, 0);
  assert.equal(app.computeDailySummary().startCross, null, "today is a low day");
  assert.equal(app.el("dayTomorrowBtn").disabled, false);

  app.setViewDay(1);
  assert.notEqual(app.computeDailySummary().startCross, null, "tomorrow is not");
  assert.equal(app.el("peakUvLabelText").textContent, "Tomorrow's Peak UV");
  assert.match(app.el("dailySummarySentence").innerHTML, /tomorrow/);
  assert.match(app.el("nowStatusSentence").textContent, /stays below 3 all day/, "the now line still talks about today");
  const strip = app.el("hourlyStripContainer").children;
  assert.ok(strip.every((b) => !/current hour/.test(b.attrs["aria-label"])), "no hour of tomorrow is marked as now");

  app.setViewDay(0);
  assert.equal(app.el("peakUvLabelText").textContent, "Today's Peak UV");
});

test("once today's protection is over, the status line says what tomorrow holds", async () => {
  const app = loadApp({ fetch: async (url) => url.includes("api.open-meteo.com") ? twoDayForecast(bellDay(9), bellDay(10)) : json({}, false) });
  await app.fetchUvDataForCurrentCoords();
  app.state.currentFrac = 19.5;
  app.state.currentLocalHour = 19;
  app.renderAll();
  const line = app.el("nowStatusSentence").textContent;
  assert.match(line, /isn't needed until tomorrow/);
  assert.match(line, /Tomorrow it is needed from .* to .*, peaking at UV \d/);
});

test("a forecast with holes is not shown as zero UV", async () => {
  const app = loadApp();
  const uv = bellDay(9).slice(0, 24);
  const clear = uv.slice();
  uv[12] = null; // one missing hour: the clear-sky value stands in
  const out = app.calibrateLiveHourlySeries(uv, clear, [null], [null]);
  assert.ok(out[12].uv > 8, `hour 12 shows ${out[12].uv}`);
  assert.equal(out[0].cloud, null, "no invented cloud figure");
  assert.equal(out[0].temp, null, "no invented temperature");

  // A day that is mostly missing counts as a failed fetch
  app.setFetch(async (url) => url.includes("api.open-meteo.com")
    ? json({ hourly: { time: ["2026-11-16T00:00"], uv_index: Array(48).fill(null) } })
    : json({}, false));
  await app.fetchUvDataForCurrentCoords();
  assert.equal(app.state.isLiveApi, false);
});

test("the clear-sky model follows ARPANSA's published figures", () => {
  const app = loadApp();
  // ARPANSA clear-sky UV Index model, read 16 Nov 2026: [site, latitude, day of year, UV]
  const published = [
    ["Sydney, 8 Jan", -34.04, 8, 11.4], ["Sydney, 23 Jun", -34.04, 174, 2.3], ["Sydney, 8 Oct", -34.04, 281, 7.2],
    ["Melbourne, 8 Jan", -37.73, 8, 10.9], ["Melbourne, 23 Jun", -37.73, 174, 1.7],
    ["Brisbane, 23 Jan", -27.45, 23, 12.6], ["Brisbane, 8 Jul", -27.45, 189, 4.0],
    ["Darwin, 23 Feb", -12.43, 54, 13.7], ["Darwin, 23 Jun", -12.43, 174, 8.2],
    ["Perth, 8 Jan", -31.93, 8, 12.0], ["Kingston, 8 Jan", -42.99, 8, 9.9], ["Alice Springs, 8 Apr", -23.8, 98, 9.0]
  ];
  for (const [label, lat, day, uv] of published) {
    const got = app.modelNoonClearUv(lat, day);
    assert.ok(Math.abs(got - uv) / uv <= 0.1, `${label}: model ${got.toFixed(1)}, ARPANSA ${uv}`);
  }
  assert.equal(app.clearSkyUvForSun(-0.2, -33.87, 1), 0, "no UV with the sun below the horizon");
  assert.equal(app.dayOfYearFor("2026-01-08"), 8);
  assert.equal(app.dayOfYearFor("2026-12-31"), 365);
});

test("Open-Meteo's UV is raised to ARPANSA's level in Australia, and never lowered", () => {
  const app = loadApp();
  // Sydney in January: Open-Meteo's clear-sky peak is about 9.2, ARPANSA's about 11.3
  const summer = app.uvCorrectionFactor(9.2, -34.04, 151.1, 15);
  assert.ok(summer > 1.15 && summer < 1.3, `Sydney January factor ${summer.toFixed(2)}`);
  // Sydney in June: Open-Meteo already reads higher (3.4 against 2.4), so nothing changes
  assert.equal(app.uvCorrectionFactor(3.4, -34.04, 151.1, 170), 1);
  // Darwin in February: 9.8 against 13.6
  const darwin = app.uvCorrectionFactor(9.8, -12.43, 130.89, 46);
  assert.ok(darwin > 1.3 && darwin < 1.5, `Darwin February factor ${darwin.toFixed(2)}`);
  assert.equal(app.uvCorrectionFactor(9.2, -36.85, 174.76, 15), 1, "not applied outside Australia, where it was not checked");
  assert.equal(app.uvCorrectionFactor(0.4, -34.04, 151.1, 15), 1, "no correction from a near-zero clear-sky peak");
  assert.equal(app.uvCorrectionFactor(2, -34.04, 151.1, 15), 1.6, "capped");
  assert.equal(loadApp({ search: "?raw" }).uvCorrectionFactor(9.2, -34.04, 151.1, 15), 1, "?raw leaves Open-Meteo's values alone");
});

test("the correction lifts forecast and clear-sky UV together, keeping the cloud effect", async () => {
  const day = (peak) => bellDay(peak).slice(0, 24);
  const uv = day(4.6).concat(day(4.6));
  const clear = day(9.2).concat(day(9.2)); // half the clear-sky value all day: heavy cloud
  const time = uv.map((_, i) => `2026-01-${i < 24 ? 15 : 16}T${String(i % 24).padStart(2, "0")}:00`);
  const app = loadApp({ fetch: async (url) => url.includes("api.open-meteo.com")
    ? json({ utc_offset_seconds: 39600, hourly: { time, uv_index: uv, uv_index_clear_sky: clear } })
    : json({}, false) });
  app.state.lat = -34.04;
  app.state.lon = 151.1;
  await app.fetchUvDataForCurrentCoords();
  const k = app.state.uvCorrection;
  assert.ok(k > 1.15 && k < 1.3, `factor ${k.toFixed(2)}`);
  const noon = app.state.hourlyData[12];
  assert.ok(noon.clearSkyUv > 10.5 && noon.clearSkyUv < 12, `clear-sky noon ${noon.clearSkyUv}`);
  assert.ok(Math.abs(noon.uv / noon.clearSkyUv - 0.5) < 0.02, "cloud still halves it");
  assert.equal(app.el("dataSourceText").textContent, "Live UV, adjusted to ARPANSA");
});

test("the seasonal figures carry the same correction", () => {
  const app = loadApp();
  const time = [], uv = [], clear = [];
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 28; d++) {
      time.push(`2025-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      uv.push(m === 0 ? 8 : 3);
      clear.push(m === 0 ? 9.2 : 3.4);
    }
  }
  const plain = app.summariseYearData({ time, uv_index_max: uv, uv_index_clear_sky_max: clear });
  const sydney = app.summariseYearData({ time, uv_index_max: uv, uv_index_clear_sky_max: clear }, -34.04, 151.1);
  assert.equal(plain[0].clear, 9.2);
  assert.ok(sydney[0].clear > 10.8 && sydney[0].clear < 11.8, `January clear-sky ${sydney[0].clear}`);
  assert.ok(sydney[0].avg > 9.3, `January typical peak ${sydney[0].avg}`);
  assert.equal(sydney[5].clear, 3.4, "June is left alone");
});

test("postcodes are read according to the Country setting", () => {
  const app = loadApp();
  assert.equal(app.normalisePostcode("800", "AU"), "0800");
  assert.equal(app.normalisePostcode("90210", "AU"), null, "five digits is not an Australian postcode");
  assert.equal(app.normalisePostcode("90210", "US"), "90210");
  assert.equal(app.normalisePostcode("sw1a 1aa", "GB"), "SW1A 1AA");
  assert.equal(app.normalisePostcode("London", "GB"), null);
  assert.equal(app.postcodeLookupKey("SW1A 1AA", "GB"), "SW1A");
  assert.equal(app.postcodeLookupKey("M5V 2T6", "CA"), "M5V");
  assert.equal(app.looksLikePostcode("2000", "AU"), true);
  assert.equal(app.looksLikePostcode("Bondi", "AU"), false);
  assert.equal(app.looksLikePostcode("6011", "NZ"), true);
  assert.equal(app.looksLikePostcode("6011", ""), false, "no country, no postcode lookup");
});

test("a postcode is looked up in the chosen country", async () => {
  const app = loadApp({ fetch: async (url) => url.includes("zippopotam.us/NZ/6011")
    ? json({ places: [{ "place name": "Wellington", "state abbreviation": "WGN", latitude: "-41.29", longitude: "174.78" }] })
    : json({}, false) });
  app.state.country = "NZ";
  await app.loadUvForPostcode("6011", true, { offerChoice: true });
  assert.equal(app.state.locationName, "Wellington, WGN");
  assert.equal(app.state.lat, -41.29);
  assert.ok(app.requests.some((u) => u.includes("zippopotam.us/NZ/6011")));
  assert.equal(JSON.parse(app.store.solguard_uv_user_prefs_v1).country, "NZ");
});

test("place search looks in the chosen country first, then everywhere", async () => {
  const app = loadApp({ fetch: async (url) => {
    if (!url.includes("geocoding-api")) return json({}, false);
    return url.includes("countryCode=NZ")
      ? json({ results: [{ name: "Wellington", admin1: "Wellington", country: "New Zealand", country_code: "NZ", feature_code: "PPLC", latitude: -41.29, longitude: 174.78 }] })
      : json({ results: [] });
  } });
  app.state.country = "NZ";
  await app.searchPlacesByName("Wellington");
  assert.equal(app.state.lat, -41.29);
  assert.equal(app.state.locationName, "Wellington, Wellington", "a place in the chosen country carries no country tag");
  assert.match(app.requests.find((u) => u.includes("geocoding-api")), /countryCode=NZ/);

  app.state.country = "";
  app.requests.length = 0;
  await app.searchPlacesByName("Wellington");
  assert.ok(app.requests.every((u) => !u.includes("countryCode")), "no country bias when set to anywhere");
});

test("places that share a forecast are not offered as a choice", async () => {
  const near = [
    { "place name": "Dawes Point", "state abbreviation": "NSW", latitude: "-33.8666", longitude: "151.2082" },
    { "place name": "Sydney", "state abbreviation": "NSW", latitude: "-33.8721", longitude: "151.2044" },
    { "place name": "The Rocks", "state abbreviation": "NSW", latitude: "-33.8666", longitude: "151.2082" }
  ];
  const far = [
    { "place name": "Alpha", "state abbreviation": "QLD", latitude: "-23.65", longitude: "146.64" },
    { "place name": "Jericho", "state abbreviation": "QLD", latitude: "-23.60", longitude: "146.13" }
  ];
  const app = loadApp({ fetch: async (url) => url.includes("zippopotam.us/AU/2000") ? json({ places: near })
    : url.includes("zippopotam.us/AU/4724") ? json({ places: far }) : json({}, false) });
  await app.loadUvForPostcode("2000", true, { offerChoice: true });
  assert.equal(app.state.placeResults.length, 0, "no picker for places a few hundred metres apart");
  assert.equal(app.state.locationName, "Sydney CBD, NSW");

  await app.loadUvForPostcode("4724", true, { offerChoice: true });
  assert.equal(app.state.placeResults.length, 2, "places 50 km apart are still offered");
});

test("picked places are remembered as quick chips", async () => {
  const app = loadApp();
  app.renderPlaceChips();
  assert.equal(app.el("presetBar").children.length, 6, "a new Australian visitor gets the starter cities");

  await app.loadUvForPostcode("2500", true);
  assert.equal(app.el("presetBar").children.length, 0, "one recent place that is already on screen needs no chip");
  await app.loadUvForPostcode("3000", true);
  const chips = app.el("presetBar").children;
  assert.deepEqual(chips.map((c) => c.textContent), ["3000 Melbourne CBD", "2500 Wollongong"]);
  assert.equal(chips[0].attrs["aria-pressed"], "true");
  assert.equal(JSON.parse(app.store.solguard_recent_places_v1).length, 2);

  chips[1].click();
  await wait(20);
  assert.equal(app.state.locationName, "Wollongong, NSW");

  app.state.country = "US";
  app.state.recentPlaces = [];
  app.renderPlaceChips();
  assert.equal(app.el("presetBar").children.length, 0, "no Australian cities offered to someone searching another country");
});

test("a paused timer no longer shows the old due time", () => {
  const app = loadApp();
  app.toggleReapplyTimer();
  assert.match(app.el("reapplyTargetClock").textContent, /Next reapply due at \d{1,2}:\d{2} (am|pm)/i);
  app.toggleReapplyTimer();
  assert.match(app.el("reapplyTargetClock").textContent, /^Paused/);
});

test("the slider tells screen readers the time and UV, not a bare number", () => {
  const app = loadApp();
  showDay(app, bellDay(9), { hour: 10 });
  assert.match(app.el("hourSlider").attrs["aria-valuetext"], /^10:00 AM, UV \d/);
});

test("button groups are labelled and no text is smaller than 11px", () => {
  for (const [group, label] of [["skinTypeGrid", "skinTypeLabel"], ["spfSelectorGroup", "spfLabel"], ["surfaceSelectorGroup", "surfaceLabel"]]) {
    assert.match(HTML, new RegExp(`id="${group}"[^>]*role="group"[^>]*aria-labelledby="${label}"|role="group"[^>]*aria-labelledby="${label}"[^>]*id="${group}"`), group);
    assert.ok(HTML.includes(`id="${label}"`), label);
  }
  assert.doesNotMatch(HTML, /text-\[(?:[0-9]|10)px\]/);
  assert.match(HTML, /prefers-reduced-motion: reduce/);
});

test("the page markup carries no made-up readings", () => {
  const text = (id) => {
    const m = HTML.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`));
    assert.ok(m, `#${id} not found`);
    return m[1].trim();
  };
  for (const id of ["uvIndexBigNumber", "clearSkyUvVal", "cloudCoverVal", "tempVal", "unprotectedBurnTime",
    "protectedBurnTime", "protectionWindowDisplay", "peakUvDisplay", "safeWindowDisplay", "coordsDisplay",
    "chartSelectedReadoutPill", "selectedHourTitle", "sliderTimeReadout"]) {
    assert.doesNotMatch(text(id), /\d/, `#${id} shows "${text(id)}" before any data has loaded`);
  }
});

test("every element the script looks up exists in the page", () => {
  const ids = new Set([...HTML.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]));
  for (const id of ids) assert.ok(HTML.includes(`id="${id}"`), `#${id} is used by the script but missing from the markup`);
});

test("the version number matches everywhere it is written", () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const version = JSON.parse(read("package.json")).version;
  assert.equal(JSON.parse(read("package-lock.json")).version, version);
  assert.ok(read("sw.js").includes(`"solguard-v${version}"`), "sw.js CACHE");
  assert.ok(read("sw.js").includes(`assets/tailwind.css?v=${version}`), "sw.js stylesheet entry");
  assert.ok(HTML.includes(`assets/tailwind.css?v=${version}`), "index.html stylesheet link");
  assert.ok(read("CHANGELOG.md").includes(`## ${version} `), "CHANGELOG entry");
});

test("every file the service worker pre-caches exists", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shell = sw.slice(sw.indexOf("const SHELL"), sw.indexOf("];"));
  const files = [...shell.matchAll(/"([^"]+)"/g)].map((m) => m[1].split("?")[0]).filter((f) => f !== "./");
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is in SHELL but not in the repo`);
});
