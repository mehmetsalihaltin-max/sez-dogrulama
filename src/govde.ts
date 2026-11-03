// Ikinci kanit kanali: Muse web aramasi haber govdesinden cumle getirir, kod sayfayi kendisi acip cumleyi birebir arar.
// Sayfa metni modele hic gonderilmez; sayfadaki gizli talimat sonucu degistiremez.
import { aramali } from "./muse.ts";
import { DILLER, type Aday, type Dil } from "./topla.ts";
import type { ModelKarari } from "./kapi.ts";

const AZAMI_BAYT = 3_000_000;
const OZEL_ADRES = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/;

export type GovdeAdayi = { url: string; alinti: string; ceviri: string; ceviriEn?: string; dil: string };
export type GovdeRed = { url: string; sebep: string };

/** i konumundaki "[" ile eslesen "]"; tirnak icindeki parantez sayilmaz. Eslesme yoksa -1. */
function diziSonu(m: string, i: number): number {
  let derin = 0, tirnak = false, kacis = false;
  for (let j = i; j < m.length; j++) {
    const c = m[j];
    if (tirnak) {
      if (kacis) kacis = false;
      else if (c === "\\") kacis = true;
      else if (c === '"') tirnak = false;
    } else if (c === '"') tirnak = true;
    else if (c === "[") derin++;
    else if (c === "]" && --derin === 0) return j;
  }
  return -1;
}

const nesneDizisi = (d: any[]) => d.length > 0 && d.every((x) => x !== null && typeof x === "object" && !Array.isArray(x));

/**
 * Modelin anlatimi arasindan JSON dizisini ayiklar. Okunamazsa null doner: "bulunamadi" ile "okunamadi" ayri kalir.
 * Oncelik: son nesne dizisi > son bos dizi > baska dizi. Bir dizinin icindeki dizi ayrica aday sayilmaz.
 */
export function jsonDiziAyikla(metin: string): any[] | null {
  const m = metin.replace(/```[a-z]*/gi, "").trim();
  try {
    const d = JSON.parse(m);
    if (Array.isArray(d)) return d;
  } catch {}
  let nesne: any[] | null = null, bos: any[] | null = null, diger: any[] | null = null;
  for (let i = m.indexOf("["); i >= 0; i = m.indexOf("[", i + 1)) {
    const son = diziSonu(m, i);
    if (son < 0) continue;
    let d: unknown;
    try {
      d = JSON.parse(m.slice(i, son + 1));
    } catch {
      continue;
    }
    if (!Array.isArray(d)) continue;
    if (nesneDizisi(d)) nesne = d;
    else if (d.length === 0) bos = d;
    else diger = d;
    i = son;
  }
  return nesne ?? bos ?? diger;
}

/** Okunamayan yanit bos sayilir; yalniz ikincil kanallarda kullanilir. */
export const jsonDizisi = (metin: string): any[] => jsonDiziAyikla(metin) ?? [];

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
  `naming the place, "ceviri": its Turkish translation, "ceviriEn": its English translation, "dil": one of ${Object.keys(DILLER).join(", ")}}. ` +
  `Use aviation authorities, airlines, aviation press or news outlets, never tourism, immigration, freight marketing or blog pages. Include only sources that report this same event; when the claim names a cause, the sentence must state that same cause. If nothing supports the claim return [].`;

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
      kararlar.push({ karar: "destekliyor", alinti: g.alinti, ceviri: g.ceviri ?? "", ceviriEn: g.ceviriEn ?? "" });
    } catch (e) {
      red.push({ url: g.url, sebep: e instanceof Error ? e.message : String(e) });
    }
  }
  return { adaylar, kararlar, red };
}
