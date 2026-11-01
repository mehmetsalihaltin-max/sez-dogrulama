// Yerel dilde aday haber toplama: Google Haberler RSS (dil + ulke kirilimi).
export type Dil = "tr" | "en" | "ar" | "ru" | "fa" | "uk" | "de" | "fr" | "es" | "nl" | "ja" | "zh" | "ko";
export const DILLER: Record<Dil, { hl: string; gl: string; ceid: string; ad: string }> = {
  tr: { hl: "tr", gl: "TR", ceid: "TR:tr", ad: "Türkçe" },
  en: { hl: "en-US", gl: "US", ceid: "US:en", ad: "İngilizce" },
  ar: { hl: "ar", gl: "SA", ceid: "SA:ar", ad: "Arapça" },
  ru: { hl: "ru", gl: "RU", ceid: "RU:ru", ad: "Rusça" },
  fa: { hl: "fa", gl: "IR", ceid: "IR:fa", ad: "Farsça" },
  uk: { hl: "uk", gl: "UA", ceid: "UA:uk", ad: "Ukraynaca" },
  de: { hl: "de", gl: "DE", ceid: "DE:de", ad: "Almanca" },
  fr: { hl: "fr", gl: "FR", ceid: "FR:fr", ad: "Fransızca" },
  es: { hl: "es", gl: "ES", ceid: "ES:es", ad: "İspanyolca" },
  nl: { hl: "nl", gl: "NL", ceid: "NL:nl", ad: "Felemenkçe" },
  ja: { hl: "ja", gl: "JP", ceid: "JP:ja", ad: "Japonca" },
  zh: { hl: "zh-CN", gl: "CN", ceid: "CN:zh-Hans", ad: "Çince" },
  ko: { hl: "ko", gl: "KR", ceid: "KR:ko", ad: "Korece" },
};

export type Aday = {
  baslik: string;
  yayinci: string;
  /** Yayincinin alan adi: ad farkliliklarindan etkilenmeyen kimlik. */
  alanAdi: string;
  url: string;
  tarih: string;
  dil: Dil;
};

function coz(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, o) => String.fromCodePoint(parseInt(o, 16)))
    .replace(/&#(\d+);/g, (_, o) => String.fromCodePoint(Number(o)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function alan(oge: string, ad: string): string {
  return coz(oge.match(new RegExp(`<${ad}[^>]*>([\\s\\S]*?)</${ad}>`))?.[1] ?? "");
}

function alanAdiOku(oge: string): string {
  const url = oge.match(/<source[^>]*url="([^"]+)"/)?.[1] ?? "";
  try {
    return new URL(coz(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** RSS metnini adaylara cevirir. Baslik "Manset - Yayinci" gelir; yayinci sonekten ayrilir.
 *  Tarihi okunamayan kayit atlanir: tarihsiz haber pencere denetiminden gecemez. */
export function rssCoz(xml: string, dil: Dil): Aday[] {
  const adaylar: Aday[] = [];
  for (const [, oge] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const zaman = Date.parse(alan(oge, "pubDate"));
    if (Number.isNaN(zaman)) continue;
    const yayinci = alan(oge, "source");
    const ham = alan(oge, "title");
    const son = ` - ${yayinci}`;
    adaylar.push({
      baslik: yayinci && ham.endsWith(son) ? ham.slice(0, -son.length) : ham,
      yayinci,
      alanAdi: alanAdiOku(oge),
      url: alan(oge, "link"),
      tarih: new Date(zaman).toISOString(),
      dil,
    });
  }
  return adaylar;
}

export async function haberAra(sorgu: string, dil: Dil, adet = 15): Promise<Aday[]> {
  const d = DILLER[dil];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(sorgu)}&hl=${d.hl}&gl=${d.gl}&ceid=${d.ceid}`;
  const yanit = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!yanit.ok) throw new Error(`Google Haberler ${yanit.status} (${dil})`);
  return rssCoz(await yanit.text(), dil).slice(0, adet);
}
