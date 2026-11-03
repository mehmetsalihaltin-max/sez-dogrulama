// Kanit hafizasi: bir olay icin kapidan gecmis haber adaylari sorgular arasinda birikir.
// Hafiza karar saklamaz, aday saklar: eski aday yeni sorguda ayni kapidan yeniden gecer
// (model alintiyi yeniden eslestirir, kod tarih ve yeri yeniden denetler). Baska olayin kaynagi boylece sayilamaz.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Aday } from "./topla.ts";

const DOSYA = new URL("../cikti/kanit-hafizasi.json", import.meta.url);
const GUN = 86_400_000;
const YOKLAMA_SURESI = 8_000;
const AYNI_ANDA_YOKLAMA = 6;
/** Google adres cozmede 6 paralel istek 15 adayin 8'ini dusurdu (3 Kas); seri 79/79. */
const AYNI_ANDA_COZME = 2;

/** asilUrl: Google Haberler araci adresinin arkasindaki yayinci adresi; silinme kontrolu buna yapilir. */
export type HafizaAdayi = Aday & { asilUrl?: string };
export type Kayit = { yerler: string[]; tarih: string; adaylar: HafizaAdayi[] };
export type Hafiza = Record<string, Kayit>;

const sade = (s: string) => s.normalize("NFKC").toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const anahtar = (yer: string, tarih: string) => `${sade(yer)}|${tarih.slice(0, 10)}`;

/** Ayni yer (iddianin herhangi bir yer adi) ve en cok bir gun fark: ayni olayin kaydi sayilir. */
export function hafizadanSec(h: Hafiza, yerAdlari: string[], tarih: string): HafizaAdayi[] {
  const t = Date.parse(tarih);
  if (Number.isNaN(t)) return [];
  const yerler = new Set(yerAdlari.map(sade).filter(Boolean));
  const secilen = new Map<string, HafizaAdayi>();
  for (const k of Object.values(h)) {
    if (!k.yerler.some((y) => yerler.has(y)) || Math.abs(Date.parse(k.tarih) - t) > GUN) continue;
    for (const a of k.adaylar) secilen.set(a.url, a);
  }
  return [...secilen.values()];
}

/** Yeni adaylar eklenir, var olan URL tekrar yazilmaz; silinen URL kayittan cikar. */
export function birlestir(h: Hafiza, yerAdlari: string[], tarih: string, yeni: HafizaAdayi[], silinen: Set<string>): Hafiza {
  const yerler = [...new Set(yerAdlari.map(sade).filter(Boolean))];
  const a = anahtar(yerler[0] ?? "", tarih);
  const eski = h[a]?.adaylar ?? [];
  const gorulen = new Set<string>();
  const adaylar = [...eski, ...yeni].filter((x) => {
    if (silinen.has(x.url) || gorulen.has(x.url)) return false;
    gorulen.add(x.url);
    return true;
  });
  const temiz: Hafiza = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, { ...v, adaylar: v.adaylar.filter((x) => !silinen.has(x.url)) }]));
  return { ...temiz, [a]: { yerler: [...new Set([...(h[a]?.yerler ?? []), ...yerler])], tarih: tarih.slice(0, 10), adaylar } };
}

let bellek: Promise<Hafiza> | null = null;
let yazma: Promise<unknown> = Promise.resolve();

/** Sinav kosularinda hafiza kapatilir: her koşu bagimsiz olculmeli. */
const kapali = () => process.env.KANIT_HAFIZASI === "kapali";

export const hafizaOku = (): Promise<Hafiza> => kapali() ? Promise.resolve({}) : (bellek ??= readFile(DOSYA, "utf-8").then(JSON.parse).catch(() => ({}) as Hafiza));

/** Paralel dogrulamalar ayni dosyaya sirayla yazar. */
export function hafizaYaz(yerAdlari: string[], tarih: string, yeni: HafizaAdayi[], silinen: Set<string>) {
  if (kapali()) return Promise.resolve();
  yazma = yazma.then(async () => {
    const bilinen = new Map(Object.values(await hafizaOku()).flatMap((k) => k.adaylar).filter((a) => a.asilUrl).map((a) => [a.url, a.asilUrl]));
    yeni = await sinirliEsle(yeni, async (a) => ({ ...a, asilUrl: a.asilUrl ?? bilinen.get(a.url) ?? (await asilAdres(a.url)) ?? undefined }));
    const h = birlestir(await hafizaOku(), yerAdlari, tarih, yeni, silinen);
    bellek = Promise.resolve(h);
    await mkdir(new URL(".", DOSYA), { recursive: true });
    await writeFile(DOSYA, JSON.stringify(h, null, 1));
  }).catch(() => {});
  return yazma;
}

/** Yalniz 404 ve 410 "silindi" sayilir; ag hatasi ya da engel bilinmeyen durumdur, kaynak kalir. */
export async function silinenleriBul(adaylar: HafizaAdayi[], yokla: (url: string) => Promise<number | null> = durumKodu): Promise<Set<string>> {
  const silinen = new Set<string>();
  let sira = 0;
  await Promise.all(
    Array.from({ length: Math.min(AYNI_ANDA_YOKLAMA, adaylar.length) }, async () => {
      while (sira < adaylar.length) {
        const a = adaylar[sira++];
        const kod = await yokla(a.asilUrl ?? a.url);
        if (kod === 404 || kod === 410) silinen.add(a.url);
      }
    }),
  );
  return silinen;
}

async function durumKodu(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(YOKLAMA_SURESI), headers: { "User-Agent": "Mozilla/5.0 SEZ" } });
    r.body?.cancel().catch(() => {});
    return r.status;
  } catch {
    return null;
  }
}

async function sinirliEsle<G, C>(liste: G[], is: (g: G) => Promise<C>, n = AYNI_ANDA_COZME): Promise<C[]> {
  const sonuc: C[] = new Array(liste.length);
  let sira = 0;
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, async () => {
    while (sira < liste.length) { const i = sira++; sonuc[i] = await is(liste[i]); }
  }));
  return sonuc;
}

const TARAYICI = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };

/**
 * Google Haberler RSS adresi yayinciya yonlendiren bir aracidir; yayinci haberi silse de 200 doner.
 * Asil adres Google'in kendi sayfasindaki imza ile bir kez istenir. Olmazsa null: kaynak araci adresle kalir.
 */
export async function asilAdres(url: string): Promise<string | null> {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname !== "news.google.com") return null;
  const id = u.pathname.split("/").pop();
  if (!id) return null;
  try {
    const sayfa = await (await fetch(`https://news.google.com/rss/articles/${id}`, { headers: TARAYICI, signal: AbortSignal.timeout(YOKLAMA_SURESI) })).text();
    const sg = sayfa.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = sayfa.match(/data-n-a-ts="(\d+)"/)?.[1];
    if (!sg || !ts) return null;
    const istek = [[["Fbv4je", `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`, null, "generic"]]];
    const r = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { ...TARAYICI, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "f.req=" + encodeURIComponent(JSON.stringify(istek)),
      signal: AbortSignal.timeout(YOKLAMA_SURESI),
    });
    const govde = JSON.parse((await r.text()).split("\n\n")[1]);
    const asil = JSON.parse(govde[0][2])[1];
    return typeof asil === "string" && /^https?:\/\//.test(asil) && !asil.includes("news.google.com") ? asil : null;
  } catch {
    return null;
  }
}
