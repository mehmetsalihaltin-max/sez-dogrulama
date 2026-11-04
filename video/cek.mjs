// Ekran kaydi: CDP screencast kareleri zaman damgasiyla toplanir, sabit hizli video ffmpeg ile kurulur -> C:/tmp/sezvideo/seg/NN.mp4
// Her hareket anlatimdaki ilgili ifadenin zamanina baglanir (ani). Kamera (zoom), cerceve, imlec ve etiketler yalniz kayit icin
// sayfaya eklenir; urunun kodu degismez. Calistirma: GPU=1 node video/cek.mjs [01,02,...]   (sunucu tam .env ile acik olmali)
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const K = "C:/tmp/sezvideo";
mkdirSync(`${K}/seg`, { recursive: true });
const ADRES = "http://127.0.0.1:4173/?dil=en";
const SAHNELER = JSON.parse(readFileSync(new URL("./sahneler.json", import.meta.url), "utf8"));
const bilgi = (id) => SAHNELER.find((s) => s.id === id);
const sesSure = (id) => JSON.parse(readFileSync(`${K}/alt/${id}.json`, "utf8")).sure;
const sure = (id) => (bilgi(id).basla ?? 0) + sesSure(id) + (bilgi(id).son ?? 0.3);
// Anlatimda bir ifadenin basladigi an (harf oranina gore, sahne icinde saniye).
const ani = (id, ifade) => {
  const s = bilgi(id), i = s.ses.indexOf(ifade);
  if (i < 0) throw new Error(`${id}: anlatimda yok: ${ifade}`);
  return (s.basla ?? 0) + sesSure(id) * i / s.ses.length;
};
const sadece = process.argv[2] ? process.argv[2].split(",") : null;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// Sayfaya eklenen kayit yardimcilari: imlec, tiklama halkasi, metinle oge bulma, cerceve, kamera (zoom), etiket.
const YARDIMCI = `(() => {
  const kur = () => {
    if (document.getElementById("imlec")) return;
    const st = document.createElement("style");
    st.textContent = [
      "#imlec{position:fixed;z-index:2147483647;left:0;top:0;width:26px;height:26px;margin:-4px 0 0 -4px;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}",
      ".hale{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #a3362f;animation:hale .6s ease-out forwards}",
      "@keyframes hale{to{transform:scale(4.2);opacity:0}}",
      ".vurgu{outline:3px solid #a3362f!important;outline-offset:5px;border-radius:3px;box-shadow:0 0 0 9999px rgba(13,27,36,.0);background-color:rgba(163,54,47,.07)!important;transition:outline-color .2s}",
      "#etiketV{position:absolute;right:16px;top:16px;z-index:5;background:#0d1b24;color:#fff;font:600 30px/1 Clash,Switzer,sans-serif;letter-spacing:.06em;padding:14px 20px;border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,.35)}",
      "#etiketV small{display:block;margin-top:8px;font:600 13px/1 Switzer,sans-serif;letter-spacing:.1em;color:#b9c4ca}"
    ].join("");
    document.head.append(st);
    const i = document.createElement("div"); i.id = "imlec";
    i.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#0d1b24" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.append(i);
    addEventListener("mousemove", (e) => { i.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true);
    addEventListener("mousedown", (e) => { const h = document.createElement("div"); h.className = "hale"; h.style.left = e.clientX + "px"; h.style.top = e.clientY + "px"; document.body.append(h); setTimeout(() => h.remove(), 700); }, true);
  };
  if (document.body) kur(); else addEventListener("DOMContentLoaded", kur);
  // Metni iceren en kucuk gorunur oge.
  window.__bul = (metin, kapsam) => {
    const kok = (kapsam && document.querySelector(kapsam)) || document.body;
    let en = null;
    for (const e of kok.querySelectorAll("*")) {
      if (!e.getClientRects().length || e.id === "imlec") continue;
      const t = (e.textContent || "").toLowerCase();
      if (t.includes(metin.toLowerCase()) && (!en || t.length < en.textContent.length)) en = e;
    }
    return en;
  };
  const hedefi = (h) => typeof h === "string" ? document.querySelector(h) : window.__bul(h.metin, h.kapsam);
  window.__vurgu = (h, ms) => { const e = hedefi(h); if (!e) return false; e.classList.add("vurgu"); setTimeout(() => e.classList.remove("vurgu"), ms); return true; };
  // Kamera: .ekran ogeye yaklasir; kenarda bos alan kalmasin diye kaydirma sinirlanir.
  window.__yaklas = (h, s, ms) => {
    const e = hedefi(h), ek = document.querySelector(".ekran"); if (!e || !ek) return false;
    const z = window.__z || { s: 1, x: 0, y: 0 }, r = e.getBoundingClientRect();
    const cx = (r.left - z.x) / z.s + r.width / z.s / 2, cy = (r.top - z.y) / z.s + r.height / z.s / 2;
    const W = innerWidth, H = innerHeight;
    let x = W / 2 - cx * s, y = H / 2 - cy * s;
    x = Math.min(0, Math.max(W - W * s, x)); y = Math.min(0, Math.max(H - H * s, y));
    ek.style.transformOrigin = "0 0"; ek.style.transition = "transform " + ms + "ms cubic-bezier(.4,0,.2,1)";
    ek.style.transform = "translate(" + x + "px," + y + "px) scale(" + s + ")";
    window.__z = { s, x, y }; return true;
  };
  window.__geri = (ms) => { const ek = document.querySelector(".ekran"); ek.style.transition = "transform " + ms + "ms cubic-bezier(.4,0,.2,1)"; ek.style.transform = "none"; window.__z = { s: 1, x: 0, y: 0 }; };
  // Paneli (#ray) ogeyi ust kenardan bosluk birakarak gosterecek kadar yumusak kaydir.
  window.__goster = (h, ms, ust) => new Promise((res) => {
    const ray = document.getElementById("ray"), e = hedefi(h); if (!e) return res(false);
    const hedef = ray.scrollTop + e.getBoundingClientRect().top - ray.getBoundingClientRect().top - (ust ?? 24);
    const y0 = ray.scrollTop, t = performance.now();
    const f = (n) => { const k = Math.min(1, (n - t) / ms); const g = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; ray.scrollTop = y0 + (hedef - y0) * g; k < 1 ? requestAnimationFrame(f) : res(true); };
    requestAnimationFrame(f);
  });
  window.__etiket = (bas, alt) => {
    const f = document.getElementById("sahneGorsel"); let d = document.getElementById("etiketV");
    if (!bas) { d?.remove(); return; }
    if (!d) { d = document.createElement("div"); d.id = "etiketV"; f.append(d); }
    d.innerHTML = bas + (alt ? "<small>" + alt + "</small>" : "");
  };
  // Porto Alegre ana gorselinde yaklasma (pist bolgesi).
  window.__resim = (s, ms) => { const f = document.getElementById("sahneGorsel"), r = document.getElementById("sahneResim"); f.style.overflow = "hidden"; r.style.transition = "transform " + ms + "ms cubic-bezier(.4,0,.2,1)"; r.style.transformOrigin = "57% 54%"; r.style.transform = "scale(" + s + ")"; };
})();`;

// Node tarafi kisayollar
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const vurgu = (p, h, ms = 2600) => ev(p, ([h, ms]) => window.__vurgu(h, ms), [h, ms]);
const yaklas = (p, h, s, ms = 1400) => ev(p, ([h, s, ms]) => window.__yaklas(h, s, ms), [h, s, ms]);
const geri = async (p, ms = 1100) => { await ev(p, (ms) => window.__geri(ms), ms); await bekle(ms + 80); };
const goster = (p, h, ms = 900, ust) => ev(p, ([h, ms, ust]) => window.__goster(h, ms, ust), [h, ms, ust]);
const etiket = (p, bas, alt) => ev(p, ([b, a]) => window.__etiket(b, a), [bas, alt]);
const resim = (p, s, ms = 2000) => ev(p, ([s, ms]) => window.__resim(s, ms), [s, ms]);
const panelUst = (p, ms = 500) => ev(p, (ms) => new Promise((res) => { const r = document.getElementById("ray"), y0 = r.scrollTop, t = performance.now(); const f = (n) => { const k = Math.min(1, (n - t) / ms); r.scrollTop = y0 * (1 - k); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }), ms);
// Gorunur imlecle tikla. h: CSS secici ya da { metin, kapsam }.
const tik = async (p, h) => {
  const b = typeof h === "string" ? await p.locator(h).first().boundingBox()
    : await ev(p, (h) => { const e = window.__bul(h.metin, h.kapsam); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }, h);
  if (!b) throw new Error(`tiklanacak oge yok: ${JSON.stringify(h)}`);
  await p.mouse.move(b.x + Math.min(b.width / 2, 60), b.y + b.height / 2, { steps: 24 });
  await bekle(220);
  await p.mouse.down(); await p.mouse.up();
};
const maxar = (p, n) => tik(p, `.maxar ol li:nth-child(${n}) button`);
const don = (p, ms) => ev(p, ([lat, lng, ms]) => {
  document.querySelector("gmp-map-3d")?.flyCameraAround({ camera: { center: { lat, lng, altitude: 0 }, range: 90000, tilt: 55, heading: 0 }, durationMillis: ms, rounds: 0.5 });
}, [Number(globalThis.__lat ?? 0), Number(globalThis.__lng ?? 0), ms]);

const sahne = {
  "01": { kur: async (p) => { await p.goto(ADRES); await bekle(1500); await p.click("#sahneAc"); await bekle(3000); },
          oyna: (p, at, a) => [
            at(0.2, async () => { await maxar(p, 1); await etiket(p, "BEFORE", "2 FEB 2024 · MAXAR 50 CM"); }),
            at(a("Floods closed"), async () => { await maxar(p, 2); await etiket(p, "AFTER", "7 MAY 2024 · MAXAR 50 CM"); }),
            at(a("for more than five months"), async () => { await maxar(p, 3); await etiket(p, "AFTER", "9 MAY 2024 · MAXAR 50 CM"); }),
            at(a("When does an airline"), () => resim(p, 1.35, 4500)),
          ] },
  "02": { kur: async (p) => { await p.goto(ADRES); await bekle(14000); },
          oyna: (p, at, a) => [
            at(0.2, () => tik(p, "button:has-text('Current route')")),
            at(a("news reports"), async () => { await goster(p, { metin: "News evidence (2)", kapsam: "#ray" }, 900, 160); await yaklas(p, { metin: "Singapore Airlines suspends", kapsam: "#ray" }, 1.7); await vurgu(p, { metin: "Singapore Airlines suspends", kapsam: "#ray" }, 1800); }),
            at(a("official notices to pilots"), async () => { await geri(p, 500); await goster(p, { metin: "OFFICIAL NOTICES", kapsam: "#ray" }, 700); await yaklas(p, { metin: "A3354/26", kapsam: "#ray" }, 1.7); await vurgu(p, { metin: "A3354/26", kapsam: "#ray" }, 1800); }),
            at(a("satellite images"), async () => { await geri(p, 500); await goster(p, { metin: "SATELLITE · SENTINEL-2", kapsam: "#ray" }, 700); await yaklas(p, { metin: "SATELLITE · SENTINEL-2", kapsam: "#ray" }, 1.35); }),
            at(a("SEZ puts them"), async () => { await geri(p, 900); await panelUst(p, 900); }),
            at(a("It shows how strong"), async () => { await yaklas(p, { metin: "Signals, no confirmation.", kapsam: "#ray" }, 1.8); await vurgu(p, { metin: "UNCONFIRMED", kapsam: "#ray" }, 3000); }),
          ] },
  "03": { statik: "tehlike.html" },
  "04": { kur: async (p) => { await p.goto(`${ADRES}&bos=1`); await bekle(10000); },
          oyna: (p, at, a) => [
            at(0.3, async () => { await tik(p, "#ses"); globalThis.__mikT = (Date.now() - globalThis.__t0) / 1000; }),
            at(7.0, () => tik(p, "#ses")),
            at(a("turns the spoken question"), () => vurgu(p, "#duyulan", 3500)),
            at(a("SEZ opens the real route"), async () => { await vurgu(p, "#nereden", 2500); await vurgu(p, "#nereye", 2500); await vurgu(p, "#tarih", 2500); }),
          ] },
  "05": { kur: async (p) => { await p.goto(ADRES); await bekle(18000); await goster(p, { metin: "Dozens of flights were cancelled", kapsam: "#ray" }, 10, 120); await bekle(600); },
          oyna: (p, at, a) => [
            at(0.3, async () => { await yaklas(p, { metin: "Dozens of flights were cancelled", kapsam: "#ray" }, 1.6, 1600); await vurgu(p, { metin: "Dozens of flights were cancelled", kapsam: "#ray" }, 2400); }),
            at(a("it must quote the exact words"), async () => { await yaklas(p, { metin: "Bali flights cancelled after", kapsam: "#ray" }, 1.8, 900); await vurgu(p, { metin: "Bali flights cancelled after", kapsam: "#ray" }, 1500); }),
            at(a("Our code then checks"), async () => { await yaklas(p, { metin: "airport operator Angkasa Pura", kapsam: "#ray" }, 1.8, 900); await vurgu(p, { metin: "airport operator Angkasa Pura", kapsam: "#ray" }, 1400); }),
            at(a("the date and the place"), async () => { await yaklas(p, { metin: "JAKARTA (Reuters)", kapsam: "#ray" }, 1.8, 900); await vurgu(p, { metin: "JAKARTA (Reuters)", kapsam: "#ray" }, 1600); }),
            at(a("Three independent publishers"), async () => { await yaklas(p, { metin: "3 separate reports", kapsam: "#ray" }, 2.2, 1000); await vurgu(p, { metin: "3 separate reports", kapsam: "#ray" }, 2200); await vurgu(p, { metin: "CONFIRMED BY NEWS", kapsam: "#ray" }, 2200); }),
            at(a("The screen also says"), async () => { await geri(p, 600); await panelUst(p, 700); await yaklas(p, { metin: "Confirmed by separate news reports, not by an official source", kapsam: "#ray" }, 1.9, 1000); await vurgu(p, { metin: "Confirmed by separate news reports, not by an official source", kapsam: "#ray" }, 3500); }),
          ] },
  "06": { kur: async (p) => { await p.goto(ADRES); await bekle(18000); await goster(p, { metin: "AI ILLUSTRATION", kapsam: "#ray" }, 10, 260); await bekle(600); },
          oyna: (p, at, a) => [
            at(0.3, async () => { await yaklas(p, { metin: "AI ILLUSTRATION", kapsam: "#ray" }, 2.2, 1500); await vurgu(p, { metin: "AI ILLUSTRATION", kapsam: "#ray" }, 3500); }),
            at(a("The evidence is below"), async () => { await geri(p, 700); await goster(p, { metin: "Satellite check", kapsam: "#ray" }, 700, 200); await tik(p, "summary:has-text('Satellite check')"); }),
            at(a("Muse Spark reads them"), async () => { await goster(p, { metin: "BEFORE", kapsam: "#ray" }, 700, 40); await yaklas(p, { metin: "Compared to the before image", kapsam: "#ray" }, 1.5, 1100); await vurgu(p, { metin: "Compared to the before image", kapsam: "#ray" }, 3000); }),
            at(a("SEZ flies there"), async () => { await geri(p, 900); }),
            at(a("SEZ flies there") + 1.2, () => don(p, 7000)),
            at(a("never raises"), async () => { await vurgu(p, { metin: "Does not change the evidence level", kapsam: "#ray" }, 3000); }),
          ] },
  "07": { kur: async (p) => { await p.goto(ADRES); await bekle(2000); await p.click("button:has-text('Current route')"); await bekle(12000); await goster(p, { metin: "OFFICIAL NOTICES", kapsam: "#ray" }, 10, 16); await bekle(500); },
          oyna: (p, at, a) => [
            at(0.3, () => yaklas(p, { metin: "OFFICIAL NOTICES", kapsam: "#ray" }, 1.3, 1500)),
            at(a("Code reads which runway"), async () => { await yaklas(p, { metin: "A3354/26", kapsam: "#ray" }, 2.0, 1000); await vurgu(p, { metin: "A3354/26", kapsam: "#ray" }, 1600); await bekle(1400); await vurgu(p, { metin: "2026-11-03 11:00 UTC", kapsam: "#ray" }, 1800); }),
            at(a("Muse Spark only rewrites"), async () => {
              await geri(p, 400);
              const yer = await ev(p, () => { const e = window.__bul("A3354/26", "#ray"); const li = e?.closest("li") ?? e?.parentElement; const s = li?.querySelector("summary"); if (!s) return null; s.id = "__ac"; return true; });
              if (yer) { await tik(p, "#__ac"); await bekle(500); await yaklas(p, "#__ac", 1.8, 900); await vurgu(p, "#__ac + *", 2600); }
            }),
            at(a("Official websites block"), async () => { await geri(p, 500); await panelUst(p, 500); await tik(p, "button:has-text('Past event: volcanic ash')"); }),
            at(a("names the agencies"), async () => { await goster(p, { metin: "Check before deciding", kapsam: "#ray" }, 900, 120); await tik(p, "summary:has-text('Check before deciding')"); await bekle(300); await yaklas(p, { metin: "Darwin Volcanic Ash Advisory Centre", kapsam: "#ray" }, 1.5, 1000); await vurgu(p, "details[open] ol", 3200); }),
          ] },
  "08": { kur: async (p) => { await p.goto(ADRES); await bekle(1500); await p.click("#sahneAc"); await bekle(3500); },
          oyna: (p, at, a) => [
            at(a("Three imaginary flights"), async () => { await yaklas(p, { metin: "SCENARIO.", kapsam: "#ray" }, 1.6, 1100); await vurgu(p, { metin: "SCENARIO.", kapsam: "#ray" }, 3000); }),
            at(a("Meta's SAM 3.1 outlines"), async () => { await geri(p, 700); await resim(p, 2.3, 2200); await vurgu(p, { metin: "Runway outline: Meta SAM 3.1", kapsam: "#ray" }, 3000); }),
            at(a("We measure the water"), async () => { await resim(p, 1, 900); await goster(p, ".yontem", 900, 220); await yaklas(p, ".yontem", 1.8, 1100); await vurgu(p, ".yontem", 4200); }),
            at(a("Sixth of May"), async () => { await geri(p, 500); await panelUst(p, 400); await tik(p, "button:has-text('6 May 2024')"); await etiket(p, "6 MAY 2024", "SENTINEL-2 · RUNWAY OUTLINE"); await resim(p, 2.0, 1600); }),
            at(a("Porto Alegre drops out"), async () => { await resim(p, 1, 500); await maxar(p, 2); await etiket(p, "7 MAY 2024", "MAXAR 50 CM · VISUAL WITNESS"); }),
            at(a("Twenty-first of May"), async () => { await tik(p, "button:has-text('21 May 2024')"); await etiket(p, "21 MAY 2024", "SENTINEL-2 · METHODS DISAGREE"); await resim(p, 2.2, 1600); }),
            at(a("eleven and a half"), async () => { await resim(p, 1, 600); await goster(p, ".yontem", 700, 220); await yaklas(p, ".yontem", 1.8, 900); await vurgu(p, ".yontem", 3200); }),
            at(a("SEZ does not average"), async () => { await yaklas(p, { metin: "Assessment unchanged", kapsam: "#ray" }, 1.7, 900); await vurgu(p, { metin: "Assessment unchanged", kapsam: "#ray" }, 3000); }),
            at(a("points to the one thing"), async () => { await geri(p, 500); await goster(p, { metin: "CONFIRMATION OPEN", kapsam: "#ray" }, 800, 200); await yaklas(p, { metin: "CONFIRMATION OPEN", kapsam: "#ray" }, 1.8, 1000); await vurgu(p, { metin: "the airport's written runway status notice", kapsam: "#ray" }, 4000); }),
          ] },
  "09": { statik: "sinav.html" },
};

const b = await chromium.launch(process.env.GPU
  ? { channel: "chrome", args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${K}/soru.wav`] }
  : { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const [id, s] of Object.entries(sahne)) {
  if (sadece && !sadece.includes(id)) continue;
  const D = sure(id);
  const dir = `${K}/kayit/_${id}`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(YARDIMCI);
  const p = await ctx.newPage();
  // Kayitta para harcanmasin: yalniz kayitli dort ornegin sorusu gecer, canli sorgu kesilir.
  await p.route("**/api/sor**", (r) => { const k = new URL(r.request().url()).searchParams.get("k") ?? ""; return /^(Singapur|Los Angeles|Londra|Lübnan)/.test(k) ? r.continue() : r.abort(); });
  p.on("response", async (r) => { if (r.url().includes("/api/olay-uydu")) { try { const j = await r.json(); globalThis.__lat = j.sonuc?.lat; globalThis.__lng = j.sonuc?.lon; } catch {} } });
  const cdp = await ctx.newCDPSession(p);
  const kareler = [];
  cdp.on("Page.screencastFrame", (e) => { kareler.push({ ts: e.metadata.timestamp * 1000, veri: e.data }); cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {}); });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  let t0;
  globalThis.__mikT = undefined;
  if (s.statik) {
    t0 = Date.now();
    await p.goto(pathToFileURL(new URL(`./${s.statik}`, import.meta.url).pathname.slice(1)).href);
    await bekle(D * 1000);
  } else {
    await s.kur(p);
    await bekle(300);
    t0 = globalThis.__t0 = Date.now();
    const at = async (sn, f) => { const w = t0 + sn * 1000 - Date.now(); if (w > 0) await bekle(w); try { await f(); } catch (e) { console.log(id, `@${sn.toFixed(1)} hata:`, e.message.slice(0, 140)); } };
    // Hareketler sirayla kosar (birinin uzamasi sonrakini kaydirmaz, cunku her biri kendi mutlak anini bekler).
    const zincir = (async () => { for (const h of s.oyna(p, (sn, f) => async () => at(sn, f), (ifade) => ani(id, ifade))) await h(); })();
    await bekle(D * 1000);
    await zincir.catch(() => {});
  }
  const t1 = t0 + D * 1000;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await p.close(); await ctx.close();
  let bas = 0; for (let k = 0; k < kareler.length; k++) if (kareler[k].ts <= t0) bas = k;
  const secili = kareler.slice(bas).filter((k, j) => j === 0 || k.ts < t1);
  const liste = [];
  secili.forEach((k, j) => {
    const ad = `${dir}/${String(j).padStart(5, "0")}.jpg`; writeFileSync(ad, Buffer.from(k.veri, "base64"));
    const bitis = j + 1 < secili.length ? secili[j + 1].ts : t1;
    const baslangic = j === 0 ? t0 : k.ts;
    liste.push(`file '${ad}'`, `duration ${Math.max(0.001, (bitis - baslangic) / 1000).toFixed(4)}`);
  });
  liste.push(`file '${dir}/${String(secili.length - 1).padStart(5, "0")}.jpg'`);
  writeFileSync(`${dir}/liste.txt`, liste.join("\n"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/liste.txt`, "-t", String(D), "-vf", "fps=30,scale=1920:1080,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-an", `${K}/seg/${id}.mp4`]);
  writeFileSync(`${K}/seg/${id}.json`, JSON.stringify({ sure: D, mikT: globalThis.__mikT ?? null }));
  console.log(id, "kare", kareler.length, "sure", D.toFixed(1), globalThis.__mikT != null ? `mikrofon ${globalThis.__mikT.toFixed(2)} sn` : "");
  rmSync(dir, { recursive: true, force: true });
}
await b.close();
