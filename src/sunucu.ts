// Yerel demo sunucusu: node --env-file=.env src/sunucu.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { sor } from "./rota.ts";

const PORT = Number(process.env.PORT ?? 4173);
const kok = (y: string) => new URL(`../${y}`, import.meta.url);
const KAYIT = "cikti/sorgu";

// Yalniz bu dosyalar sunulur; adres diske hic dogrudan baglanmaz.
const STATIK: Record<string, [string, string]> = {
  "/": ["web/index.html", "text/html; charset=utf-8"],
  "/v/d3-array.js": ["node_modules/d3-array/dist/d3-array.min.js", "text/javascript"],
  "/v/d3-geo.js": ["node_modules/d3-geo/dist/d3-geo.min.js", "text/javascript"],
  "/v/topojson.js": ["node_modules/topojson-client/dist/topojson-client.min.js", "text/javascript"],
  "/v/dunya.json": ["node_modules/world-atlas/countries-50m.json", "application/json"],
  "/v/newsreader-500.woff2": ["node_modules/@fontsource/newsreader/files/newsreader-latin-ext-500-normal.woff2", "font/woff2"],
  "/v/plex-400.woff2": ["node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-400-normal.woff2", "font/woff2"],
  "/v/plex-600.woff2": ["node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-600-normal.woff2", "font/woff2"],
  "/v/plex-l400.woff2": ["node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2", "font/woff2"],
  "/v/plex-l600.woff2": ["node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2", "font/woff2"],
};

const dosyaAdi = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

createServer(async (istek, yanit) => {
  const u = new URL(istek.url ?? "/", "http://127.0.0.1");
  try {
    const st = STATIK[u.pathname];
    if (st) {
      yanit.writeHead(200, { "Content-Type": st[1] });
      yanit.end(await readFile(kok(st[0])));
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
    if (u.pathname === "/api/sor") {
      const soru = (u.searchParams.get("s") ?? "").trim().slice(0, 300);
      if (!soru) throw new Error("soru boş");
      yanit.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      const gonder = (o: unknown) => yanit.write(`data: ${JSON.stringify(o)}\n\n`);
      const yol = `${KAYIT}/${dosyaAdi(soru)}.json`;
      try {
        let sonuc;
        try {
          if (u.searchParams.get("yeni")) throw new Error("yeniden");
          sonuc = JSON.parse(await readFile(yol, "utf-8"));
        } catch {
          sonuc = await sor(soru, (i) => gonder({ tip: "ilerleme", ...i }));
          await mkdir(KAYIT, { recursive: true });
          await writeFile(yol, JSON.stringify(sonuc, null, 2));
        }
        gonder({ tip: "sonuc", sonuc });
      } catch (e) {
        gonder({ tip: "hata", metin: e instanceof Error ? e.message : String(e) });
      }
      yanit.end();
      return;
    }
    yanit.writeHead(404).end();
  } catch (e) {
    yanit.writeHead(500).end(e instanceof Error ? e.message : "hata");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}`));
