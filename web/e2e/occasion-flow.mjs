// End-to-end check of what couples pay for (docs/OCCASIONS.md), run in CI
// against staging (.github/workflows/occasion-e2e.yml):
//
//   1. A fresh wedding, set up and opened as the E2E host (staging's
//      dev-activate stands in for checkout).
//   2. A guest adds a moment with a photo through the real guest page; a
//      second, song-only, arrives through the guest function.
//   3. The couple signs in, sees both moments, closes the book and reveals it.
//   4. The keepsake opens from the link the dashboard gives them, shows both
//      moments and starts playing.
//   5. The guest page now links to the book.
//
// The wedding is always deleted at the end, through delete-wedding, pass or
// fail. Runs against a web build of this checkout at BASE_URL; the database
// and edge functions are whatever staging has (main's, deployed on merge).
//
// Env: BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, E2E_PASSWORD, and
// optionally CHROME_PATH, E2E_HOST_EMAIL, ARTIFACTS_DIR.
//
// Locally (with `npx next start -p 3300` running against staging):
//   BASE_URL=http://localhost:3300 SUPABASE_URL=… SUPABASE_ANON_KEY=… \
//   E2E_PASSWORD=… node web/e2e/occasion-flow.mjs

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};
const BASE = need("BASE_URL").replace(/\/$/, "");
const SUPABASE_URL = need("SUPABASE_URL");
const ANON = need("SUPABASE_ANON_KEY");
const PASSWORD = need("E2E_PASSWORD");
const HOST_EMAIL = process.env.E2E_HOST_EMAIL ?? "e2e2@soundtracks.test";
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const ARTIFACTS = process.env.ARTIFACTS_DIR ?? join(tmpdir(), "occasion-e2e");
const HERE = dirname(fileURLToPath(import.meta.url));
const PHOTO = join(HERE, "fixtures/guest-photo.jpg");
const TIME_ZONE = "America/New_York";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (msg) => console.log(`▸ ${msg}`);
mkdirSync(ARTIFACTS, { recursive: true });

// ─── Supabase, as the host ────────────────────────────────────────────────

const host = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
{
  const { error } = await host.auth.signInWithPassword({ email: HOST_EMAIL, password: PASSWORD });
  if (error) throw new Error(`host sign-in failed: ${error.message}`);
}

async function song(term) {
  const res = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: "song", limit: "1", country: "US" })}`);
  const r = (await res.json()).results?.[0];
  if (!r) throw new Error(`no catalog result for "${term}"`);
  return { appleMusicId: String(r.trackId), title: r.trackName, artist: r.artistName, artworkUrl: r.artworkUrl100 };
}

async function guestEntry(slug, appleMusicId, guestName) {
  const form = new FormData();
  form.set("action", "create");
  form.set("slug", slug);
  form.set("appleMusicId", appleMusicId);
  form.set("guestName", guestName);
  form.set("deviceId", `e2e-device-${Date.now()}`);
  form.set("editToken", Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"));
  const res = await fetch(`${SUPABASE_URL}/functions/v1/occasion-entry`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: form,
  });
  const body = await res.json();
  if (!res.ok || !body.entryId) throw new Error(`guest entry failed: ${res.status} ${JSON.stringify(body)}`);
}

// ─── Chrome over the DevTools protocol (no extra dependencies) ────────────

const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "e2e-chrome-"))}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);
let tabs;
for (let i = 0; i < 100 && !tabs?.length; i++) {
  try {
    tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  } catch {
    await sleep(200);
  }
}
if (!tabs?.length) throw new Error("Chrome didn't start");
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 30_000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      if (m.error) reject(new Error(`${method}: ${m.error.message}`));
      else resolve(m.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page script failed: ${r.exceptionDetails.text}`);
  return r.result?.value;
};
const go = async (path) => {
  await send("Page.navigate", { url: path.startsWith("http") ? path : BASE + path });
  await waitFor("page load", "document.readyState === 'complete'");
};
/** Polls a page expression until it's truthy. */
async function waitFor(what, expression, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    // A matched element can't cross the protocol as a value; it counts as true.
    const v = await js(`(()=>{try{const v=(${expression}); return v instanceof Node ? true : v}catch{return null}})()`).catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(300);
  }
}
const text = () => js("document.body.innerText");
const waitForText = (needle, timeoutMs) => waitFor(`"${needle}"`, `document.body.innerText.includes(${JSON.stringify(needle)})`, timeoutMs);
/** Clicks the first button or link whose text starts with `label`. */
async function click(label, selector = "button, a") {
  const ok = await js(
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)})); if(!el) return false; el.click(); return true;})()`
  );
  if (!ok) throw new Error(`nothing to click: "${label}"`);
}
async function fill(selector, value) {
  const ok = await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  if (!ok) throw new Error(`no field: ${selector}`);
}
async function screenshot(name) {
  try {
    const s = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(ARTIFACTS, `${name}.png`), Buffer.from(s.data, "base64"));
  } catch {
    // Best effort.
  }
}

await send("Page.enable");
await send("DOM.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// ─── The flow ─────────────────────────────────────────────────────────────

let occasionId = null;
let failed = false;
try {
  step("set up and open a wedding");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
  const suggested = [await song("september earth wind fire"), await song("dancing queen abba")];
  const { data: draft, error } = await host
    .rpc("create_occasion_draft", {
      p_names: "E2E Wedding (test)",
      p_event_date: today,
      p_city: null,
      p_time_zone: TIME_ZONE,
      p_guest_estimate: null,
      p_slug: `e2e-${Date.now().toString(36)}`,
      p_suggested_songs: suggested,
      p_reservation_id: null,
    })
    .single();
  if (error) throw new Error(`create_occasion_draft: ${error.message}`);
  occasionId = draft.id;
  const opened = await host.functions.invoke("occasion-host", { body: { action: "dev-activate", occasionId } });
  if (opened.error) throw new Error("dev-activate failed (is ALLOW_DEV_PAYMENTS set on staging?)");

  step("a guest adds a moment with a photo on the guest page");
  await go(`/for/${draft.slug}`);
  await waitForText("Pick a song for them");
  await click("September", "ul button");
  await waitFor("photo field", "document.querySelector('form input[type=file]')");
  const doc = await send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "form input[type=file]" });
  await send("DOM.setFileInputFiles", { nodeId, files: [PHOTO] });
  await waitFor("photo preview", "document.querySelector('form img[alt=\"Your photo\"]')");
  await fill('input[placeholder="First and last"]', "Ada Lovelace");
  await fill("textarea", "First dance, and everyone sang.");
  await click("Add my song");
  await waitForText("Your song is in.", 30_000);
  await screenshot("1-guest-saved");

  step("a second guest adds a song only");
  await guestEntry(draft.slug, suggested[1].appleMusicId, "Grace Hopper");

  step("the couple signs in and sees both moments");
  await go("/host/sign-in");
  await click("Use my Soundtracks password instead");
  await waitFor("password field", "document.querySelector('input[type=password]')");
  await fill("input[type=email]", HOST_EMAIL);
  await fill("input[type=password]", PASSWORD);
  await js("document.querySelector('form button[type=submit]').click()");
  await waitFor("signed in", "location.pathname === '/host'", 30_000);
  await go(`/host/${occasionId}`);
  await waitForText("2 moments so far");
  if (!(await text()).includes("First dance, and everyone sang.")) throw new Error("the guest's words aren't on the dashboard");
  await screenshot("2-dashboard");

  step("close and reveal");
  await click("Close it to new songs now");
  await click("Close it", "[aria-label='Close the guest book'] button");
  await waitForText("Reveal your guest book", 30_000);
  await click("Reveal it");
  await click("Reveal it", "[aria-label='Reveal the guest book'] button");
  await waitForText("Your guest book is out", 30_000);
  const bookUrl = await waitFor(
    "keepsake link",
    "[...document.querySelectorAll('p')].map(p=>p.textContent).find(t=>t.includes('/book?k='))"
  );
  await screenshot("3-revealed");

  step("the keepsake opens and plays");
  await go(bookUrl.trim().replace(/^https:\/\/soundtracks\.app/, BASE));
  await waitForText("2 songs from 2 people");
  const rows = await js("document.querySelectorAll('ol li').length");
  if (rows !== 2) throw new Error(`keepsake tracklist has ${rows} rows, expected 2`);
  if (!(await js("[...document.querySelectorAll('ol img')].some(i => i.src.includes('/storage/v1/object/sign/'))"))) {
    throw new Error("the guest's photo isn't on the keepsake");
  }
  await click("Play the night");
  await waitFor("the first song playing", "(()=>{const a=document.querySelector('audio'); return a && a.src.startsWith('https://') && !a.paused && a.currentTime > 0})()", 20_000);
  await screenshot("4-keepsake-playing");

  step("the guest page links to the book");
  await go(`/for/${draft.slug}`);
  await waitForText("Open the guest book");
  console.log("✓ occasion flow passed");
} catch (e) {
  failed = true;
  console.error(`✗ ${e.message}`);
  await screenshot("failure");
  console.error(`  page: ${(await text().catch(() => "")).slice(0, 600).replace(/\n+/g, " | ")}`);
} finally {
  if (occasionId) {
    step("delete the test wedding");
    const { error } = await host.functions.invoke("occasion-host", { body: { action: "delete-wedding", occasionId } });
    if (error) {
      console.error(`✗ cleanup: delete-wedding failed for ${occasionId}`);
      failed = true;
    }
  }
  ws.close();
  chrome.kill();
}
process.exit(failed ? 1 : 0);
