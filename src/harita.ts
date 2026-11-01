// Rota cografyasi kodda: koordinat modelden degil havalimani tablosundan, ulkeler sinir verisinden gelir.
import { readFile } from "node:fs/promises";
import { geoCentroid, geoContains, geoDistance, geoInterpolate } from "d3-geo";
import { feature } from "topojson-client";

const HAVALIMANI_VERISI = "https://davidmegginson.github.io/ourairports-data/airports.csv"; // OurAirports, kamu malı
const DUNYA_YARICAPI_KM = 6371;

export type Havalimani = { iata: string; ad: string; sehir: string; ulke: string; lat: number; lon: number };
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

let dunya: Promise<any[]> | undefined;
export function ulkeler(): Promise<any[]> {
  dunya ??= readFile(new URL("../node_modules/world-atlas/countries-50m.json", import.meta.url), "utf-8").then((m) => {
    const t = JSON.parse(m);
    return (feature(t, t.objects.countries) as any).features;
  });
  return dunya;
}

export async function ulkeBul(ad: string) {
  const a = ad.trim().toLocaleLowerCase("en");
  return (await ulkeler()).find((f) => String(f.properties.name).toLocaleLowerCase("en") === a);
}

export const merkez = (f: any): Nokta => geoCentroid(f) as Nokta;

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
    if (geoContains(u, p)) return p;
  }
  return null;
}

export const rotayaUzaklikKm = (p: Nokta, rota: Nokta[]) =>
  Math.round(Math.min(...rota.map((r) => geoDistance(p, r))) * DUNYA_YARICAPI_KM);
