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
  assert.notEqual(app.el("protectionWindowDisplay").textContent, "No UV ≥ 3 Today");
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
  assert.equal(before.length, 11);
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
