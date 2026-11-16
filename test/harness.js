// Loads the app's inline script out of index.html and runs it in a Node sandbox with a stubbed page.
// There is no real DOM and no network: elements are plain objects that record what the app writes to
// them, and fetch() is whatever the test supplies. This keeps the app a single file with no build step
// while still letting its UV logic be tested.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// Names the tests reach into. Function declarations become sandbox globals on their own, but
// top-level const/let (state, SKIN_TYPES, ...) do not, so everything is exported explicitly.
const EXPORTS = [
  "state", "SKIN_TYPES", "POSTCODE_DB", "RAW_MODE",
  "calibrateLiveHourlySeries", "computeDailySummary", "computeBurnTimes", "getUvRiskMeta",
  "generateSolarModelUv", "inferAusPostcodeRegion", "formatFractionalHour12", "formatHour12",
  "loadPreferencesFromStorage", "savePreferencesToStorage", "loadUvForPostcode",
  "fetchUvDataForCurrentCoords", "requestDeviceLocation", "renderAll", "summariseYearData",
  "lowUvRuns", "buildYearInsight"
];

function inlineScript() {
  const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) throw new Error("No inline <script> found in index.html");
  return blocks[0]; // the app; the second block only registers the service worker
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.children = [];
    this.textContent = "";
    this.className = "";
    this.value = "";
    this.checked = false;
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.style = { setProperty() {} };
    this.parentElement = { innerHTML: "" };
    this._html = "";
    const classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => ((on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c)
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; if (v === "") this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this })); }
  querySelectorAll() { return []; }
  getContext() { return null; }
  focus() {}
  select() {}
}

// opts.search: the page's query string (e.g. "?raw"); opts.storage: initial localStorage contents;
// opts.fetch: async (url) => response; opts.geolocation: a navigator.geolocation stub
function loadApp(opts = {}) {
  const els = {};
  const store = { ...(opts.storage || {}) };
  const requests = [];
  const el = (id) => els[id] || (els[id] = new FakeElement(id));
  const document = {
    title: "SolGuard",
    visibilityState: "visible",
    getElementById: el,
    querySelectorAll: () => [],
    createElement: () => new FakeElement(""),
    addEventListener() {}
  };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const window = { location: { search: opts.search || "" }, localStorage, addEventListener() {} };
  const sandbox = {
    document, window, localStorage, console, URLSearchParams, AbortController, Date, Math,
    navigator: opts.geolocation ? { geolocation: opts.geolocation } : {},
    setTimeout, clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    fetchImpl: opts.fetch || (async () => { throw new Error("offline"); }),
    fetch: (url, init) => { requests.push(String(url)); return sandbox.fetchImpl(String(url), init); }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${inlineScript()}\n;globalThis.__app = { ${EXPORTS.join(", ")} };`, sandbox, { filename: "index.html<script>" });
  return {
    ...sandbox.__app,
    el,
    store,
    requests,
    setFetch(fn) { sandbox.fetchImpl = fn; }
  };
}

// A JSON response in the shape fetch() returns
const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

// A smooth clear day: 25 hourly values peaking at `peak` around 12:30 pm
function bellDay(peak, centre = 12.5, width = 4.2) {
  return Array.from({ length: 25 }, (_, h) => {
    const x = (h - centre) / width;
    return Math.abs(x) < Math.PI / 2 ? +(peak * Math.cos(x)).toFixed(2) : 0;
  });
}

// WCAG 2 contrast ratio between two #rrggbb colours
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

module.exports = { ROOT, HTML, loadApp, json, bellDay, contrast };
