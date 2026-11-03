// Sentinel-2 ile pist su olcumu. Oran model degil fizik: iki bagimsiz yontem uyusmadan rakam verilmez.
import { fromUrl } from "geotiff";
import proj4 from "proj4";

const STAC = "https://earth-search.aws.element84.com/v1/search";
export const KARE_METRE = 7000;
export const G = 1024;
export const PIKSEL_METRE = KARE_METRE / G;
/** Maske kenarindan atilan pay: 10 metrelik piksel pist kenarindaki cimi de karistirir. */
export const ASINDIRMA_METRE = 14;
/** NDWI ile ESA siniflandirmasi arasinda izin verilen fark, yuzde puan. */
export const UYUM_PAYI = 10;
const AZAMI_BULUT = 20;
const SCL_SU = 6;
const SCL_BULUT = [3, 8, 9, 10]; // golge, orta bulut, yogun bulut, ince bulut

export type Bant = { d: ArrayLike<number>; w: number; h: number };
export type Bantlar = { yesil: Bant; nir: Bant; scl: Bant };
export type Olcum =
  | { durum: "olculdu"; oran: number; ndwi: number; scl: number; bulut: number }
  | { durum: "yontemler-uyusmuyor"; ndwi: number; scl: number; bulut: number }
  | { durum: "bulutlu"; ndwi: number; scl: number; bulut: number };

export function asindir(maske: Uint8Array, metre = ASINDIRMA_METRE): Uint8Array {
  let a = maske;
  for (let k = 0; k < Math.round(metre / PIKSEL_METRE); k++) {
    const o = new Uint8Array(G * G);
    for (let y = 1; y < G - 1; y++) {
      for (let x = 1; x < G - 1; x++) {
        const i = y * G + x;
        if (a[i] && a[i - 1] && a[i + 1] && a[i - G] && a[i + G]) o[i] = 1;
      }
    }
    a = o;
  }
  return a;
}

const al = (b: Bant, x: number, y: number) => b.d[Math.floor((y / G) * b.h) * b.w + Math.floor((x / G) * b.w)];

/** Su sayilmak icin hem yesil > yakin kizilotesi hem ESA "su" sinifi gerekir; metal cati ilkini gecer, ikinciyi gecemez. */
export function pikselSuMu(b: Bantlar, x: number, y: number) {
  const ndwi = al(b.yesil, x, y) > al(b.nir, x, y);
  const scl = al(b.scl, x, y) === SCL_SU;
  return { ndwi, scl, ikisi: ndwi && scl };
}

export function olc(maske: Uint8Array, b: Bantlar): Olcum {
  let p = 0;
  let nd = 0;
  let sc = 0;
  let ikisi = 0;
  let bulutlu = 0;
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      if (!maske[y * G + x]) continue;
      p++;
      const s = pikselSuMu(b, x, y);
      if (s.ndwi) nd++;
      if (s.scl) sc++;
      if (s.ikisi) ikisi++;
      if (SCL_BULUT.includes(al(b.scl, x, y))) bulutlu++;
    }
  }
  if (!p) throw new Error("maske bos");
  const yuzde = (n: number) => Math.round((1000 * n) / p) / 10;
  const ortak = { ndwi: yuzde(nd), scl: yuzde(sc), bulut: yuzde(bulutlu) };
  if (ortak.bulut > AZAMI_BULUT) return { durum: "bulutlu", ...ortak };
  if (Math.abs(ortak.ndwi - ortak.scl) > UYUM_PAYI) return { durum: "yontemler-uyusmuyor", ...ortak };
  return { durum: "olculdu", oran: yuzde(ikisi), ...ortak };
}

export async function sahneBul(lon: number, lat: number, gun: string) {
  const r = await fetch(STAC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: ["sentinel-2-l2a"],
      bbox: [lon - 0.04, lat - 0.04, lon + 0.04, lat + 0.04],
      datetime: `${gun}T00:00:00Z/${gun}T23:59:59Z`,
      limit: 3,
    }),
  });
  if (!r.ok) throw new Error(`STAC ${r.status}`);
  const f = (await r.json()).features?.[0];
  if (!f) throw new Error(`${gun} icin sahne yok`);
  return f;
}

/** Noktayi kapsayan sahneler, en yenisi once. */
export async function sahneleriBul(lon: number, lat: number, ilk: string, son: string): Promise<any[]> {
  const r = await fetch(STAC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: ["sentinel-2-l2a"],
      intersects: { type: "Point", coordinates: [lon, lat] },
      datetime: `${ilk}T00:00:00Z/${son}T23:59:59Z`,
      sortby: [{ field: "properties.datetime", direction: "desc" }],
      limit: 20,
    }),
  });
  if (!r.ok) throw new Error(`STAC ${r.status}`);
  return (await r.json()).features ?? [];
}

async function pencere(href: string, lon: number, lat: number, kare = KARE_METRE): Promise<Bant> {
  const im = await (await fromUrl(href)).getImage();
  const epsg = im.getGeoKeys()?.ProjectedCSTypeGeoKey;
  if (!epsg) throw new Error("sahnede izdusum bilgisi yok");
  const p = proj4(`+proj=utm +zone=${epsg % 100} ${epsg < 32700 ? "" : "+south"} +datum=WGS84`);
  const [x, y] = p.forward([lon, lat]);
  const [ox, oy] = im.getOrigin();
  const [rx, ry] = im.getResolution();
  const R = kare / 2 / Math.abs(rx);
  const px = (x - ox) / rx;
  const py = (y - oy) / ry;
  const w = [px - R, py - R, px + R, py + R].map(Math.round);
  const d = (await im.readRasters({ window: w, interleave: true })) as unknown as ArrayLike<number>;
  return { d, w: w[2] - w[0], h: w[3] - w[1] };
}

export async function bantlariOku(f: any, lon: number, lat: number): Promise<Bantlar> {
  const [yesil, nir, scl] = await Promise.all(
    [f.assets.green.href, f.assets.nir.href, f.assets.scl.href].map((h: string) => pencere(h, lon, lat)),
  );
  return { yesil, nir, scl };
}

export async function sclOku(f: any, lon: number, lat: number, kare?: number): Promise<Bant> {
  return pencere(f.assets.scl.href, lon, lat, kare);
}

export async function gorunurOku(f: any, lon: number, lat: number, kare?: number): Promise<Bant> {
  return pencere(f.assets.visual.href, lon, lat, kare);
}
