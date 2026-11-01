// Ikinci kanit kanali: Muse web aramasi haber govdesinden cumle getirir, kod sayfayi kendisi acip cumleyi birebir arar.
// Sayfa metni modele hic gonderilmez; sayfadaki gizli talimat sonucu degistiremez.
import { aramali } from "./muse.ts";
import { DILLER, type Aday, type Dil } from "./topla.ts";
import type { ModelKarari } from "./kapi.ts";

const AZAMI_BAYT = 3_000_000;
const OZEL_ADRES = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/;

export type GovdeAdayi = { url: string; alinti: string; ceviri: string; dil: string };
export type GovdeRed = { url: string; sebep: string };

/** Modelin anlatimi arasindan son JSON dizisini ayiklar; bozuksa bos doner. */
export function jsonDizisi(metin: string): any[] {
  const b = metin.lastIndexOf("[{");
  try {
    const d = JSON.parse(b >= 0 ? metin.slice(b, metin.lastIndexOf("]") + 1) : "[]");
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export const jsonDizi = (metin: string): GovdeAdayi[] =>
  jsonDizisi(metin).filter((x) => typeof x?.url === "string" && typeof x?.alinti === "string");

export function sayfaMetni(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Bosluk ve tirnak bicimi sayfadan sayfaya degisir; harfler degismez. */
const sik = (s: string) => s.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, "");

export const alintiSayfadaMi = (alinti: string, sayfa: string) => alinti.length >= 25 && sik(sayfaMetni(sayfa)).includes(sik(alinti));

/** Yayin tarihi modelden degil sayfanin kendi kaydindan okunur. */
export function yayinTarihi(html: string): string | null {
  const desenler = [
    /article:published_time["'][^>]*content=["']([^"']+)/i,
    /content=["']([^"']+)["'][^>]*article:published_time/i,
    /"datePublished"\s*:\s*"([^"]+)/i,
    /<time[^>]*datetime=["']([^"']+)/i,
  ];
  for (const d of desenler) {
    const t = Date.parse(html.match(d)?.[1] ?? "");
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

async function sayfaGetir(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("adres turu");
  if (OZEL_ADRES.test(u.hostname)) throw new Error("ozel adres");
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 SEZ-dogrulama" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const metin = await r.text();
  return metin.slice(0, AZAMI_BAYT);
}

const ISTEM = (iddia: string, tarih: string) =>
  `Find news reports or official notices about this aviation-safety claim: "${iddia}"${tarih ? ` (date: ${tarih})` : ""}. ` +
  `Search in English and in the local language of the place. Answer with a JSON array only. Each item: ` +
  `{"url": source page, "alinti": one full sentence copied character for character from that page, in the page's language, ` +
  `naming the place, "ceviri": its Turkish translation, "dil": one of ${Object.keys(DILLER).join(", ")}}. ` +
  `Include only sources that report this same event; when the claim names a cause, the sentence must state that same cause. If nothing supports the claim return [].`;

/** Dogrulanan cumleleri kapinin bildigi aday + karar bicimine cevirir; son karari yine kapi verir. */
export async function govdeKanitlari(iddia: string, tarih: string): Promise<{ adaylar: Aday[]; kararlar: Omit<ModelKarari, "id">[]; red: GovdeRed[] }> {
  const { metin } = await aramali(ISTEM(iddia, tarih));
  const adaylar: Aday[] = [];
  const kararlar: Omit<ModelKarari, "id">[] = [];
  const red: GovdeRed[] = [];
  const gorulen = new Set<string>();
  for (const g of jsonDizi(metin)) {
    if (gorulen.has(g.url)) continue;
    gorulen.add(g.url);
    try {
      const html = await sayfaGetir(g.url);
      if (!alintiSayfadaMi(g.alinti, html)) {
        red.push({ url: g.url, sebep: "cümle sayfada birebir yok" });
        continue;
      }
      const tarihi = yayinTarihi(html);
      if (!tarihi) {
        red.push({ url: g.url, sebep: "sayfada yayın tarihi yok" });
        continue;
      }
      const alanAdi = new URL(g.url).hostname.replace(/^www\./, "");
      adaylar.push({ baslik: g.alinti, yayinci: alanAdi, alanAdi, url: g.url, tarih: tarihi, dil: (g.dil in DILLER ? g.dil : "en") as Dil });
      kararlar.push({ karar: "destekliyor", alinti: g.alinti, ceviri: g.ceviri ?? "" });
    } catch (e) {
      red.push({ url: g.url, sebep: e instanceof Error ? e.message : String(e) });
    }
  }
  return { adaylar, kararlar, red };
}
