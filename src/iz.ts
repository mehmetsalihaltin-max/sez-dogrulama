// Gercek uçus izi: son tamamlanan seferin Flightradar24 izi. Anahtar yoksa null doner, rota eski yola duser.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Nokta } from "./harita.ts";

const ADRES = "https://fr24api.flightradar24.com/api";
const GERI_GUN = 3;
const AZAMI_NOKTA = 200;
const SAKLAMA_MS = 7 * 86_400_000; // ayni hat icin kredi harcamamak icin
const klasor = new URL("../cikti/iz/", import.meta.url);

export type Iz = { ucus: string; tarih: string; noktalar: Nokta[]; canli: true };
export type Sefer = { fr24_id: string; flight?: string | null; callsign?: string | null; dest_icao?: string | null; dest_icao_actual?: string | null; datetime_takeoff?: string | null; datetime_landed?: string | null; flight_ended?: boolean | null };
type IzNoktasi = { timestamp?: string; lat: number; lon: number };

/** Hedefine inmis en son seferi secer; sapan ya da suren sefer gercek hat sayilmaz. */
export function seferSec(seferler: Sefer[], varisIcao: string): Sefer | null {
  const uygun = seferler.filter((s) => s.flight_ended === true && s.datetime_landed && (!s.dest_icao_actual || s.dest_icao_actual === varisIcao));
  return uygun.sort((a, b) => b.datetime_landed!.localeCompare(a.datetime_landed!))[0] ?? null;
}

/** Yanit dizi ya da {data} gelebilir; nokta sayisi harita icin seyreltilir, ilk ve son nokta korunur. */
export function izCoz(v: unknown): Nokta[] {
  const liste = (Array.isArray(v) ? v : (v as { data?: unknown[] })?.data ?? []) as { tracks?: IzNoktasi[] }[];
  const t = liste[0]?.tracks ?? [];
  if (t.length < 2) return [];
  const adim = Math.max(1, Math.ceil(t.length / AZAMI_NOKTA));
  const secilen = t.filter((_, i) => i % adim === 0);
  if (secilen.at(-1) !== t.at(-1)) secilen.push(t.at(-1)!);
  return secilen.map((n) => [n.lon, n.lat]);
}

async function istek(yol: string, anahtar: string): Promise<unknown> {
  const y = await fetch(`${ADRES}${yol}`, { headers: { Authorization: `Bearer ${anahtar}`, "Accept-Version": "v1", Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!y.ok) throw new Error(`Flightradar24 ${y.status}`);
  return y.json();
}

/** Sorulan gun canli iz penceresinden eskiyse bugunun izi o gunu anlatmaz. */
export const izGuncelMi = (tarih: string, simdi = Date.now()) => !tarih || Number.isNaN(Date.parse(tarih)) || Date.parse(tarih) >= simdi - GERI_GUN * 86_400_000;

const saat = (t: number) => new Date(t).toISOString().slice(0, 19);

export async function izGetir(kalkis: { iata: string }, varis: { iata: string; icao: string }): Promise<Iz | null> {
  const anahtar = process.env.FR24_API_ANAHTARI;
  if (!anahtar) return null;
  const dosya = new URL(`${kalkis.iata}-${varis.iata}.json`, klasor);
  const eski = await readFile(dosya, "utf-8").then(JSON.parse).catch(() => null);
  if (eski && Date.now() - eski.alinma < SAKLAMA_MS) return eski.iz;

  const simdi = Date.now();
  const p = new URLSearchParams({ flight_datetime_from: saat(simdi - GERI_GUN * 86_400_000), flight_datetime_to: saat(simdi), routes: `${kalkis.iata}-${varis.iata}`, sort: "desc", limit: "10" });
  const ozet = (await istek(`/flight-summary/light?${p}`, anahtar)) as { data?: Sefer[] };
  const s = seferSec(ozet.data ?? [], varis.icao);
  if (!s) return null;
  const noktalar = izCoz(await istek(`/flight-tracks?flight_id=${encodeURIComponent(s.fr24_id)}`, anahtar));
  if (!noktalar.length) return null;
  const iz: Iz = { ucus: s.flight || s.callsign || s.fr24_id, tarih: (s.datetime_takeoff ?? s.datetime_landed!).slice(0, 10), noktalar, canli: true };
  await mkdir(klasor, { recursive: true });
  await writeFile(dosya, JSON.stringify({ alinma: Date.now(), iz }));
  return iz;
}
