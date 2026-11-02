// Rota cografyasi kodda: koordinat modelden degil havalimani tablosundan, ulkeler sinir verisinden gelir.
import { readFile } from "node:fs/promises";
import { geoCentroid, geoContains, geoDistance, geoInterpolate } from "d3-geo";
import { feature } from "topojson-client";

const HAVALIMANI_VERISI = "https://davidmegginson.github.io/ourairports-data/airports.csv"; // OurAirports, kamu malı
const DUNYA_YARICAPI_KM = 6371;

export type Havalimani = { iata: string; icao: string; onem?: number; anahtar?: string; ad: string; sehir: string; ulke: string; lat: number; lon: number };
export type Nokta = [lon: number, lat: number];

export function csvSatiri(s: string): string[] {
  const alan: string[] = [];
  let kelime = "";
  let tirnak = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (tirnak && s[i + 1] === '"') {
        kelime += '"';
        i++;
      } else tirnak = !tirnak;
    } else if (c === "," && !tirnak) {
      alan.push(kelime);
      kelime = "";
    } else kelime += c;
  }
  alan.push(kelime);
  return alan;
}

export function havalimaniCoz(csv: string): Map<string, Havalimani> {
  const [bas, ...satirlar] = csv.split("\n");
  const b = csvSatiri(bas.trim());
  const k = (ad: string) => b.indexOf(ad);
  const tablo = new Map<string, Havalimani>();
  const onem: Record<string, number> = { large_airport: 3, medium_airport: 2, small_airport: 1 };
  const onemi = new Map<string, number>();
  for (const satir of satirlar) {
    const a = csvSatiri(satir.trim());
    const iata = a[k("iata_code")];
    const puan = onem[a[k("type")]] ?? 0;
    if (!iata || !puan || (onemi.get(iata) ?? 0) >= puan) continue;
    onemi.set(iata, puan);
    tablo.set(iata, {
      iata,
      icao: a[k("icao_code")] || a[k("ident")],
      onem: puan + (a[k("scheduled_service")] === "yes" ? 0.5 : 0), // tarifeli sefer alan meydan aramada one gecer
      anahtar: a[k("keywords")],
      ad: a[k("name")],
      sehir: a[k("municipality")],
      ulke: a[k("iso_country")],
      lat: +a[k("latitude_deg")],
      lon: +a[k("longitude_deg")],
    });
  }
  return tablo;
}

let havalimanlari: Promise<Map<string, Havalimani>> | undefined;
export function havalimani(iata: string): Promise<Havalimani | undefined> {
  havalimanlari ??= fetch(HAVALIMANI_VERISI, { signal: AbortSignal.timeout(60_000) })
    .then((r) => {
      if (!r.ok) throw new Error(`havalimani verisi ${r.status}`);
      return r.text();
    })
    .then(havalimaniCoz);
  return havalimanlari.then((t) => t.get(iata.toUpperCase()));
}

// OurAirports Ingilizce: sik yazilan Turkce sehir adlari aramada karsiligina cevrilir.
const TURKCE_AD: Record<string, string> = {
  moskova: "moscow", londra: "london", singapur: "singapore", kahire: "cairo", atina: "athens", viyana: "vienna", roma: "rome",
  munih: "munich", tahran: "tehran", bagdat: "baghdad", cidde: "jeddah", riyad: "riyadh", pekin: "beijing", seul: "seoul",
  kopenhag: "copenhagen", varsova: "warsaw", lizbon: "lisbon", bukres: "bucharest", sofya: "sofia", belgrad: "belgrade",
  sam: "damascus", halep: "aleppo", beyrut: "beirut", kudus: "jerusalem", medine: "medina", mekke: "jeddah", tiflis: "tbilisi", erivan: "yerevan",
};
const sade = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/\p{M}/gu, "");

/** Kod tam eslesirse once o, sonra sehir ya da ad; buyuk meydanlar uste. */
export function havalimaniSuz(tablo: Map<string, Havalimani>, q: string, adet = 8): Havalimani[] {
  const y = sade(q.trim());
  if (y.length < 2) return [];
  const arama = TURKCE_AD[y] ?? y;
  const puan = (h: Havalimani) => {
    if (sade(h.iata) === y || sade(h.icao) === y) return 100;
    const sehir = sade(h.sehir);
    if (sehir.startsWith(arama)) return 10 + (h.onem ?? 0);
    if (sade(h.ad).includes(arama) || sade(h.anahtar ?? "").includes(arama)) return 5 + (h.onem ?? 0);
    return 0;
  };
  return [...tablo.values()].map((h) => [puan(h), h] as const).filter(([p]) => p).sort((a, b) => b[0] - a[0]).slice(0, adet).map(([, h]) => h);
}

export async function havalimaniAra(q: string): Promise<Havalimani[]> {
  await havalimani("IST");
  return havalimanlari!.then((t) => havalimaniSuz(t, q));
}

let dunya: Promise<any[]> | undefined;
export function ulkeler(): Promise<any[]> {
  dunya ??= readFile(new URL("../node_modules/world-atlas/countries-50m.json", import.meta.url), "utf-8").then((m) => {
    const t = JSON.parse(m);
    return (feature(t, t.objects.countries) as any).features;
  });
  return dunya;
}

/** Modelin yazdigi yaygin ad ile sinir verisindeki ad farkli olabilir. */
const ES_ADLAR: Record<string, string> = {
  "türkiye": "turkey", "turkiye": "turkey", "united states": "united states of america", "usa": "united states of america", "us": "united states of america",
  "uk": "united kingdom", "great britain": "united kingdom", "uae": "united arab emirates", "czech republic": "czechia", "ivory coast": "côte d'ivoire",
  "bosnia and herzegovina": "bosnia and herz.", "democratic republic of the congo": "dem. rep. congo", "dr congo": "dem. rep. congo", "republic of the congo": "congo",
  "south sudan": "s. sudan", "central african republic": "central african rep.", "dominican republic": "dominican rep.", "burma": "myanmar",
};

export async function ulkeBul(ad: string) {
  const k = ad.trim().toLocaleLowerCase("en");
  const a = ES_ADLAR[k] ?? k;
  return (await ulkeler()).find((f) => String(f.properties.name).toLocaleLowerCase("en") === a);
}

export const merkez = (f: any): Nokta => geoCentroid(f) as Nokta;

/** Demoda iki hat: gercek ucus izi Flightradar24 ekranindan elle okundu, noktalar yaklasiktir. */
export const KAYITLI_IZLER: Record<string, { ucus: string; tarih: string; noktalar: Nokta[] }> = {
  "LAX-DXB": {
    ucus: "EK216",
    tarih: "2026-10-31",
    noktalar: [
      [-118.41, 33.94], [-113, 39], [-104, 46], [-92, 52], [-80, 56.5], [-62, 60], [-43, 62], [-28, 63], [-15, 62],
      [-5, 59.5], [8, 56], [12, 51], [15, 48], [24, 45], [31, 43.5], [37, 41.2], [41, 39], [44, 36.5], [45, 33], [47, 30],
      [50, 27.5], [55.36, 25.25],
    ],
  },
  "SIN-DPS": {
    ucus: "SQ938",
    tarih: "2026-11-01",
    noktalar: [[103.99, 1.36], [104.6, 0.8], [104.6, 0.25], [105.4, -0.1], [112, -5.2], [113.4, -6.3], [114.5, -6.9], [115.17, -8.75]],
  },
};

/** Seyrek noktalari sik hatta acar: ulke ve uzaklik hesabi noktalar arasinda da dogru calissin. */
export function hatAc(noktalar: Nokta[], adim = 6): Nokta[] {
  const hat: Nokta[] = [];
  for (let i = 0; i + 1 < noktalar.length; i++) {
    const f = geoInterpolate(noktalar[i], noktalar[i + 1]);
    for (let k = 0; k < adim; k++) hat.push(f(k / adim) as Nokta);
  }
  hat.push(noktalar[noktalar.length - 1]);
  return hat;
}

export function buyukDaire(a: Nokta, b: Nokta, n = 64): Nokta[] {
  const f = geoInterpolate(a, b);
  return Array.from({ length: n + 1 }, (_, i) => f(i / n) as Nokta);
}

export async function ucusUlkeleri(noktalar: Nokta[]): Promise<string[]> {
  const bulunan = new Set<string>();
  const hepsi = await ulkeler();
  for (const p of noktalar) {
    const u = hepsi.find((f) => geoContains(f, p));
    if (u) bulunan.add(u.properties.name);
  }
  return [...bulunan];
}

/** Sinir verisinde ayri duran bagli bolgeler: Jersey icin Birlesik Krallik yazilirsa nokta ulke ortasina dusmesin. */
const BAGLI: Record<string, string> = { JE: "United Kingdom", GG: "United Kingdom", IM: "United Kingdom", GI: "United Kingdom", PR: "United States of America", GU: "United States of America", VI: "United States of America" };

/** Yer adini haritaya kod baglar; sonuc beyan edilen ulkenin sinirlari icinde degilse kabul edilmez. */
export async function yerBul(ad: string, ulke: string): Promise<Nokta | null> {
  const u = await ulkeBul(ulke);
  if (!ad || !u) return null;
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&format=json&name=${encodeURIComponent(ad)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return null;
  for (const y of (await r.json()).results ?? []) {
    const p: Nokta = [y.longitude, y.latitude];
    if (geoContains(u, p) || BAGLI[y.country_code] === u.properties.name) return p;
  }
  return null;
}

/** Rotanin bir ulkenin icinde kalan parcalari: kapali hava sahasi kesisimi modelden degil sinir verisinden hesaplanir. */
export async function ulkedekiParcalar(rota: Nokta[], ulke: string): Promise<Nokta[][]> {
  const u = await ulkeBul(ulke);
  if (!u) return [];
  const parcalar: Nokta[][] = [];
  let simdiki: Nokta[] = [];
  for (const p of rota) {
    if (geoContains(u, p)) simdiki.push(p);
    else if (simdiki.length) {
      parcalar.push(simdiki);
      simdiki = [];
    }
  }
  if (simdiki.length) parcalar.push(simdiki);
  return parcalar;
}

export const rotayaUzaklikKm = (p: Nokta, rota: Nokta[]) =>
  Math.round(Math.min(...rota.map((r) => geoDistance(p, r))) * DUNYA_YARICAPI_KM);
