// Yerel demo sunucusu: node --env-file=.env src/sunucu.ts
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { havalimani, havalimaniAra } from "./harita.ts";
import { meydanUydu, olayUydu } from "./meydan.ts";
import { notamAnlat, notamGetir } from "./notam.ts";
import { IkiDilliHata, sor, type Ilerleme } from "./rota.ts";
import { sahneKur } from "./sahne.ts";

const PORT = Number(process.env.PORT ?? 4173);
const kok = (y: string) => new URL(`../${y}`, import.meta.url);
const KAYIT = "cikti/sorgu";

// Temiz klonda cikti/ bos: depodaki secilmis demo kayitlari kopyalanir, var olan dosyanin ustune yazilmaz.
await cp(kok("demo"), kok("cikti"), { recursive: true, force: false }).catch(() => {});

// Yalniz bu dosyalar sunulur; adres diske hic dogrudan baglanmaz.
const STATIK: Record<string, [string, string]> = {
  "/": ["web/index.html", "text/html; charset=utf-8"],
  "/font/clash-500.woff2": ["web/font/clash-500.woff2", "font/woff2"],
  "/font/clash-600.woff2": ["web/font/clash-600.woff2", "font/woff2"],
  "/font/switzer-400.woff2": ["web/font/switzer-400.woff2", "font/woff2"],
  "/font/switzer-500.woff2": ["web/font/switzer-500.woff2", "font/woff2"],
  "/font/switzer-600.woff2": ["web/font/switzer-600.woff2", "font/woff2"],
  "/poa/2024-04-18.jpg": ["web/poa/2024-04-18.jpg", "image/jpeg"],
  "/poa/2024-05-06.jpg": ["web/poa/2024-05-06.jpg", "image/jpeg"],
  "/poa/2024-05-21.jpg": ["web/poa/2024-05-21.jpg", "image/jpeg"],
  "/v/d3-array.js": ["node_modules/d3-array/dist/d3-array.min.js", "text/javascript"],
  "/v/d3-geo.js": ["node_modules/d3-geo/dist/d3-geo.min.js", "text/javascript"],
  "/v/topojson.js": ["node_modules/topojson-client/dist/topojson-client.min.js", "text/javascript"],
  "/v/dunya.json": ["node_modules/world-atlas/countries-10m.json", "application/json"],
};
for (const a of ["volcano", "air", "rainy", "weather_snowy", "thunderstorm", "foggy", "cyclone", "earthquake", "flood", "local_gas_station", "groups", "shield", "build", "drone", "shield_lock", "report", "warning", "crisis_alert", "flight"]) STATIK[`/ikon/${a}.svg`] = [`web/ikon/${a}.svg`, "image/svg+xml"];

// Ayni soru bitmeden yeniden gelirse ikinci kez para harcanmaz; acik olan is izlenir.
type Is = { dinleyen: Set<(i: Ilerleme) => void>; sonuc: Promise<unknown> };
const suren = new Map<string, Is>();

function isBaslat(soru: string, yol: string): Is {
  const dinleyen = new Set<(i: Ilerleme) => void>();
  const sonuc = sor(soru, (i) => dinleyen.forEach((f) => f(i)))
    .then(async (s) => {
      await mkdir(KAYIT, { recursive: true });
      await writeFile(yol, JSON.stringify(s, null, 2));
      return s;
    })
    .finally(() => suren.delete(yol));
  return { dinleyen, sonuc };
}

const dosyaAdi = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

createServer(async (istek, yanit) => {
  const u = new URL(istek.url ?? "/", "http://127.0.0.1");
  try {
    const st = STATIK[u.pathname];
    if (st) {
      const icerik = await readFile(kok(st[0])); // dosya yoksa baslik yazilmadan hata yoluna duser
      yanit.writeHead(200, { "Content-Type": st[1] });
      yanit.end(icerik);
      return;
    }
    if (u.pathname === "/api/sahne") {
      const veri = JSON.parse(await readFile(kok("ornek/porto-alegre.json"), "utf-8"));
      yanit.writeHead(200, { "Content-Type": "application/json" });
      yanit.end(JSON.stringify({ meydan: veri.meydan, senaryoEsik: veri.senaryoEsik, kareMetre: veri.kareMetre, ucuslar: veri.ucuslar, adimlar: sahneKur(veri, u.searchParams.get("dil") === "en" ? "en" : "tr") }));
      return;
    }
    if (u.pathname === "/api/ayar") {
      // Tarayici anahtari: yalniz yerel adreslerden ve yalniz harita servisi icin gecerli.
      yanit.writeHead(200, { "Content-Type": "application/json" });
      yanit.end(JSON.stringify({ anahtar: process.env.GOOGLE_HARITA_ANAHTARI ?? null }));
      return;
    }
    if (u.pathname === "/api/kayitlar") {
      await mkdir(KAYIT, { recursive: true });
      const liste = [];
      for (const d of await readdir(KAYIT)) {
        const k = JSON.parse(await readFile(`${KAYIT}/${d}`, "utf-8"));
        liste.push({ soru: k.soru, durum: k.durum, zaman: k.zaman });
      }
      yanit.writeHead(200, { "Content-Type": "application/json" });
      yanit.end(JSON.stringify(liste.sort((a, b) => b.zaman.localeCompare(a.zaman))));
      return;
    }
    if (u.pathname === "/api/havalimani") {
      const liste = await havalimaniAra(u.searchParams.get("q") ?? "");
      yanit.writeHead(200, { "Content-Type": "application/json" });
      yanit.end(JSON.stringify(liste.map((h) => ({ iata: h.iata, ad: h.ad, sehir: h.sehir, ulke: h.ulke }))));
      return;
    }
    if (u.pathname === "/api/uydu") {
      const iata = u.searchParams.get("iata") ?? "";
      const gun = u.searchParams.get("gun") ?? "";
      const m = /^[A-Z0-9]{3}$/.test(iata) && /^\d{4}-\d{2}-\d{2}$/.test(gun) ? await havalimani(iata) : undefined;
      if (!m) { yanit.writeHead(400).end(); return; }
      yanit.writeHead(200, { "Content-Type": "application/json" });
      yanit.end(JSON.stringify({ sonuc: await meydanUydu(iata, m.ad, m.lon, m.lat, gun) }));
      return;
    }
    if (u.pathname === "/api/olay-uydu") {
      const q = u.searchParams;
      const nokta: [number, number] = [Number(q.get("lon")), Number(q.get("lat"))];
      const gun = q.get("gun") ?? "", tehlike = q.get("tehlike") ?? "", iddia = (q.get("iddia") ?? "").slice(0, 400);
      if (!nokta.every(Number.isFinite) || !/^\d{4}-\d{2}-\d{2}$/.test(gun) || !/^[a-z]{2,10}$/.test(tehlike) || !iddia) { yanit.writeHead(400).end(); return; }
      yanit.writeHead(200, { "Content-Type": "application/json" });
      yanit.end(JSON.stringify({ sonuc: await olayUydu(tehlike, iddia, nokta, gun) }));
      return;
    }
    if (u.pathname === "/api/uydu-gorsel") {
      const ad = u.searchParams.get("ad") ?? "";
      if (!/^[A-Za-z0-9-]{3,40}$/.test(ad)) { yanit.writeHead(400).end(); return; }
      const gorsel = await readFile(kok(`cikti/meydan-uydu/${ad}.jpg`));
      yanit.writeHead(200, { "Content-Type": "image/jpeg" });
      yanit.end(gorsel);
      return;
    }
    if (u.pathname === "/api/notam") {
      const meydanlar = await Promise.all((u.searchParams.get("iata") ?? "").split(",").filter(Boolean).map(havalimani));
      const icaolar = meydanlar.flatMap((m) => (m?.icao ? [m.icao] : []));
      let govde;
      try {
        const notamlar = await notamGetir(icaolar);
        const anlatim = notamlar ? await notamAnlat(notamlar.slice(0, 6)) : {};
        govde = notamlar ? { durum: "tamam", icaolar, notamlar: notamlar.map((n) => ({ ...n, anlatim: anlatim[n.metin] })) } : { durum: "bagli-degil", icaolar, notamlar: [] };
      } catch (e) {
        govde = { durum: "hata", icaolar, notamlar: [], metin: e instanceof Error ? e.message : "hata" };
      }
      yanit.writeHead(200, { "Content-Type": "application/json" });
      yanit.end(JSON.stringify(govde));
      return;
    }
    if (u.pathname === "/api/sor") {
      const soru = (u.searchParams.get("s") ?? "").trim().slice(0, 300);
      if (!soru) throw new Error("soru boş");
      yanit.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      const gonder = (o: unknown) => yanit.write(`data: ${JSON.stringify(o)}\n\n`);
      // Ayni ornek iki dilde sorulur, sonuc iki dilli tek kayittir.
      const yol = `${KAYIT}/${dosyaAdi(u.searchParams.get("k") ?? soru)}.json`;
      try {
        let sonuc;
        try {
          if (u.searchParams.get("yeni")) throw new Error("yeniden");
          sonuc = { ...JSON.parse(await readFile(yol, "utf-8")), kayitli: true };
        } catch {
          let is = suren.get(yol);
          if (!is) { is = isBaslat(soru, yol); suren.set(yol, is); }
          const dinle = (i: Ilerleme) => gonder({ tip: "ilerleme", ...i });
          is.dinleyen.add(dinle);
          istek.on("close", () => is.dinleyen.delete(dinle));
          sonuc = await is.sonuc;
        }
        gonder({ tip: "sonuc", sonuc });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (m.includes("content_policy_violation")) gonder({ tip: "hata", metin: "Model bu soruyu içerik filtresine takıldığı için yanıtlamadı. Soruyu farklı ifade edip yeniden deneyin.", en: "The model declined this question at its content filter. Rephrase it and try again." });
        else gonder({ tip: "hata", metin: m, en: e instanceof IkiDilliHata ? e.en : m });
      }
      yanit.end();
      return;
    }
    yanit.writeHead(404).end();
  } catch (e) {
    if (yanit.headersSent) yanit.end();
    else yanit.writeHead(500).end(e instanceof Error ? e.message : "hata");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${PORT}`);
  havalimani("IST").catch(() => {}); // ilk aramada tablo hazir olsun
});
