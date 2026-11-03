// Resmi kaynak kanali: Muse Wonder resmi kurumlarin sayfalarini arar, kod her sayfayi kendisi acip alintiyi denetler.
// Haber teyidi ile resmi teyit ayri kalir: bu kanal kanit seviyesini degistirmez, yaninda ayri bir satir olarak durur.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { aramali, sayarak } from "./muse.ts";
import { alintiSayfadaMi, jsonDizisi, sayfaGetir, yayinTarihi } from "./govde.ts";

const MODEL = process.env.RESMI_MODELI ?? "muse-wonder-1.0";
const KLASOR = new URL("../cikti/resmi/", import.meta.url);
const GUN = 86_400_000;

export type ResmiKaynak = { url: string; kurum: string; alanAdi: string; alinti: string; ceviri: string; ceviriEn: string; tarih: string | null; resmiAlan: boolean };
export type ResmiRed = { url: string; sebep: string };
export type ResmiSonuc = { iddia: string; kaynaklar: ResmiKaynak[]; red: ResmiRed[]; dolar: number; zaman: string; kayitli?: boolean };

/** Alan adi kamu ya da havacilik kurumuna benziyor mu: yalniz isaret, karar degil; kurum adi modelden gelir. */
export const RESMI_ALAN = /(^|\.)(gov|gob|gouv|gub|go\.id|go\.jp|go\.kr|go\.th|gc\.ca|gov\.[a-z]{2}|admin\.ch|bund\.de|europa\.eu|icao\.int|eurocontrol\.int)$|(^|[.-])(caa|dgca|faa|easa|anac|aena|dhmi|notam|airport|airports|aeroport|aeropuerto|aeroporto|flughafen|havalimani|bandara|angkasapura|ais)([.-]|$)/i;

const ISTEM = (iddia: string, tarih: string, yerler: string[]) =>
  `You support an airline operations safety desk. Find OFFICIAL sources about this claim: "${iddia}"` +
  `${tarih ? ` (event date: ${tarih})` : ""}. Places: ${yerler.slice(0, 8).join(", ")}. ` +
  `Official means: the airport operator, the civil aviation authority, the air navigation service provider, a meteorological or volcanological agency, ` +
  `or a government ministry. Search their own websites and press pages in English and in the local language. News outlets, blogs and aggregators do not count. ` +
  `Answer with a JSON array only, at most 4 items. Each item: {"url": the official page, "kurum": the organisation's name, ` +
  `"alinti": one full sentence copied character for character from that page, in the page's language, naming the place and the event, ` +
  `"ceviri": its Turkish translation, "ceviriEn": its English translation}. If you find no official page about this same event return [].`;

const anahtar = (iddia: string) => createHash("sha1").update(iddia).digest("hex").slice(0, 16);

/** Pencere disi tarih reddedilir; tarihi olmayan resmi sayfa kabul edilir ama "tarih yok" diye isaretlenir. */
export function tarihUygun(tarih: string | null, olay: string): boolean {
  const t = Date.parse(olay);
  if (!tarih || Number.isNaN(t)) return true;
  const s = Date.parse(tarih);
  return s >= t - 3 * GUN && s <= t + 30 * GUN;
}

export async function resmiKaynakAra(iddia: string, olayTarihi: string, yerler: string[]): Promise<ResmiSonuc> {
  const dosya = new URL(`${anahtar(iddia)}.json`, KLASOR);
  const eski = await readFile(dosya, "utf-8").then(JSON.parse).catch(() => null);
  if (eski) return { ...eski, kayitli: true };

  const { sonuc, dolar } = await sayarak(async () => {
    const { metin } = await aramali(ISTEM(iddia, olayTarihi, yerler), MODEL, true);
    const kaynaklar: ResmiKaynak[] = [];
    const red: ResmiRed[] = [];
    const gorulen = new Set<string>();
    for (const g of jsonDizisi(metin)) {
      if (typeof g?.url !== "string" || typeof g?.alinti !== "string" || gorulen.has(g.url)) continue;
      gorulen.add(g.url);
      try {
        const html = await sayfaGetir(g.url);
        if (!alintiSayfadaMi(g.alinti, html)) { red.push({ url: g.url, sebep: "alıntı sayfada birebir yok" }); continue; }
        const tarih = yayinTarihi(html);
        if (!tarihUygun(tarih, olayTarihi)) { red.push({ url: g.url, sebep: "sayfa tarihi olayla uyuşmuyor" }); continue; }
        const alanAdi = new URL(g.url).hostname.replace(/^www\./, "");
        kaynaklar.push({
          url: g.url, kurum: String(g.kurum ?? "").slice(0, 120), alanAdi, alinti: g.alinti,
          ceviri: String(g.ceviri ?? "").replace(/[<>]/g, "").slice(0, 300), ceviriEn: String(g.ceviriEn ?? "").replace(/[<>]/g, "").slice(0, 300),
          tarih, resmiAlan: RESMI_ALAN.test(alanAdi),
        });
      } catch (e) {
        red.push({ url: g.url, sebep: e instanceof Error ? e.message : String(e) });
      }
    }
    return { kaynaklar, red };
  });
  const sonucKaydi: ResmiSonuc = { iddia, ...sonuc, dolar, zaman: new Date().toISOString() };
  await mkdir(KLASOR, { recursive: true });
  await writeFile(dosya, JSON.stringify(sonucKaydi, null, 1));
  return sonucKaydi;
}
