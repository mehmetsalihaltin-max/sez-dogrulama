// Dogrulanabilir kapi: modelin soyledigi hicbir sey burada kanit sayilmaz.
// Karar kodda verilir; ayni aday ve karar listesi her zaman ayni seviyeyi uretir.
import type { Aday, Dil } from "./topla.ts";

export type Karar = "destekliyor" | "celisiyor" | "ilgisiz";
export type ModelKarari = { id: number; karar: Karar; alinti: string; ceviri: string; ceviriEn?: string };
export type Kanit = Aday & { karar: Karar; alinti: string; ceviri: string; ceviriEn: string };
export type Red = { baslik: string; yayinci: string; sebep: string };
export type Seviye = "teyitli" | "kismen" | "tek-kaynak" | "celiskili" | "kanit-yok";

export type Sonuc = {
  seviye: Seviye;
  gerekce: string;
  destek: Kanit[];
  celiski: Kanit[];
  reddedilen: Red[];
  bagimsizYayinci: number;
  diller: Dil[];
  /** Modelin karar vermedigi aday sayisi: "ilgisiz" ile "unuttu" ayni sey degildir. */
  eksikKarar: number;
};

/** Baskasinin haberini yeniden yayimlayan siteler: bagimsiz kaynak sayilmaz. */
const TOPLAYICILAR = ["yahoo.", "msn.com", "aol.com", "47news.jp", "infoseek.co.jp", "newsbreak.com", "news.google.", "newscord"];
/** Sosyal paylasim yayinci degildir; kisa ad baska alan adinin ortasinda eslesmesin diye tam aranir. */
const SOSYAL = /(^|\.)(x\.com|twitter\.com|t\.me|facebook\.com|instagram\.com|tiktok\.com|reddit\.com)$/;

const sade = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const toplayiciMi = (k: Aday) => TOPLAYICILAR.some((t) => k.alanAdi.includes(t)) || SOSYAL.test(k.alanAdi);

/** Kelimelerinin %70'i ortak olan iki baslik yeniden yazilmis ayni ajans haberidir. */
function kelimeOrtusmesi(a: string, b: string) {
  const [x, y] = [new Set(a.split(" ")), new Set(b.split(" "))];
  if (Math.min(x.size, y.size) < 4) return 0;
  return [...x].filter((k) => y.has(k)).length / Math.min(x.size, y.size);
}

/** Biri digerini iceren ya da kelimeleri ortusen basliklar ayni haberdir: "... travel" ile "... travel | Framing Analysis". */
const ayniHaber = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 20 && (a.includes(b) || b.includes(a))) || kelimeOrtusmesi(a, b) >= 0.7;

/** Tek kelimelik alinti bir etikettir, olay anlatmaz. Cince, Japonca, Korece bosluk kullanmadigi icin muaf. */
const etiketMi = (s: string) => !/\s/.test(s.trim()) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(s);

export function bagimsizKaynaklar(kanitlar: Kanit[]): Kanit[] {
  const asil = [...kanitlar].sort((a, b) => Number(toplayiciMi(a)) - Number(toplayiciMi(b)));
  const secilen: Kanit[] = [];
  const yayinci = new Set<string>();
  for (const k of asil) {
    const kimlik = k.alanAdi || sade(k.yayinci);
    if (yayinci.has(kimlik)) continue;
    if (secilen.some((s) => ayniHaber(sade(s.baslik), sade(k.baslik)))) continue;
    if (toplayiciMi(k)) continue;
    yayinci.add(kimlik);
    secilen.push(k);
  }
  return secilen;
}

export function degerlendir(
  adaylar: Aday[],
  kararlar: ModelKarari[],
  pencere: { ilk: string; son: string },
  yerAdlari: string[],
): Sonuc {
  const reddedilen: Red[] = [];
  const kabul: Kanit[] = [];
  const gorulen = new Set<number>();
  const yerler = yerAdlari.map(sade).filter(Boolean);

  for (const m of kararlar) {
    const a = adaylar[m.id];
    if (!a || gorulen.has(m.id)) continue;
    gorulen.add(m.id);
    if (m.karar === "ilgisiz") continue;
    const alinti = m.alinti.trim().normalize("NFC");
    const reddet = (sebep: string) => reddedilen.push({ baslik: a.baslik, yayinci: a.yayinci, sebep });
    if (!alinti || !a.baslik.normalize("NFC").includes(alinti)) reddet("alıntı kaynak metinde birebir yok");
    else if (etiketMi(alinti)) reddet("alıntı olay anlatmıyor");
    else if (a.tarih < pencere.ilk || a.tarih > pencere.son) reddet("yayın tarihi iddia penceresinin dışında");
    else if (!yerler.some((y) => sade(a.baslik).includes(y))) reddet("yer adı başlıkta geçmiyor");
    else kabul.push({ ...a, karar: m.karar, alinti, ceviri: m.ceviri.replace(/[<>]/g, "").slice(0, 300), ceviriEn: (m.ceviriEn ?? "").replace(/[<>]/g, "").slice(0, 300) });
  }

  const destek = kabul.filter((k) => k.karar === "destekliyor");
  const celiski = kabul.filter((k) => k.karar === "celisiyor");
  const yayinciSayisi = bagimsizKaynaklar(destek).length;
  const diller = [...new Set(destek.map((k) => k.dil))];

  let seviye: Seviye;
  let gerekce: string;
  if (destek.length && celiski.length) {
    seviye = "celiskili";
    gerekce = `${yayinciSayisi} bağımsız yayıncı destekliyor, ${celiski.length} kaynak çelişiyor`;
  } else if (yayinciSayisi >= 3) {
    seviye = "teyitli";
    gerekce = `${diller.length} dilde ${yayinciSayisi} bağımsız yayıncı`;
  } else if (yayinciSayisi === 2) {
    seviye = "kismen";
    gerekce = `2 bağımsız yayıncı, ${diller.length} dil`;
  } else if (yayinciSayisi === 1) {
    seviye = "tek-kaynak";
    gerekce = "tek bağımsız yayıncı";
  } else {
    seviye = "kanit-yok";
    gerekce = celiski.length ? `${celiski.length} kaynak çelişiyor, destek yok` : "kapıdan geçen kanıt yok";
  }
  return {
    seviye,
    gerekce,
    destek,
    celiski,
    reddedilen,
    bagimsizYayinci: yayinciSayisi,
    diller,
    eksikKarar: adaylar.length - gorulen.size,
  };
}
