// Meta Model API istemcisi: https://dev.meta.ai/docs/quickstart
import { AsyncLocalStorage } from "node:async_hooks";

const TABAN = "https://api.meta.ai/v1";
export const MODEL = process.env.MUSE_MODEL ?? "muse-spark-1.3";

// Tahmini harcama, resmi fiyatla: https://dev.meta.ai/docs/pricing-rate-limits
// Onbellek indirimi hesaba katilmaz, yani gercek tutar bundan dusuk ya da esit olur.
const FIYAT = {
  spark: { girdi: 1.25 / 1_000_000, cikti: 4.25 / 1_000_000 },
  wonder: { girdi: 4 / 1_000_000, cikti: 20 / 1_000_000 },
};
const ARAMA_FIYATI = 2.5 / 1000;
export const sayac = { istek: 0, girdi: 0, cikti: 0, arama: 0, modelDolar: 0 };
type Sayac = typeof sayac;
export const tahminiDolar = (s: Sayac = sayac) => s.modelDolar + s.arama * ARAMA_FIYATI;

/** Ayni anda calisan sorgular birbirinin harcamasini saymasin diye her sorgu kendi sayacini tasir. */
const kapsam = new AsyncLocalStorage<Sayac>();
export async function sayarak<T>(is: () => Promise<T>): Promise<{ sonuc: T; dolar: number; arama: number }> {
  const s: Sayac = { istek: 0, girdi: 0, cikti: 0, arama: 0, modelDolar: 0 };
  const sonuc = await kapsam.run(s, is);
  return { sonuc, dolar: +tahminiDolar(s).toFixed(3), arama: s.arama };
}

function say(d: any, model: string) {
  const girdi = d.usage?.prompt_tokens ?? d.usage?.input_tokens ?? 0;
  const cikti = d.usage?.completion_tokens ?? d.usage?.output_tokens ?? 0;
  const f = model.startsWith("muse-wonder") ? FIYAT.wonder : FIYAT.spark;
  for (const s of [sayac, kapsam.getStore()]) {
    if (!s) continue;
    s.istek++;
    s.girdi += girdi;
    s.cikti += cikti;
    s.modelDolar += girdi * f.girdi + cikti * f.cikti;
    s.arama += (d.output ?? []).filter((p: any) => p.type === "web_search_call").length;
  }
}

function anahtar(): string {
  const a = process.env.MODEL_API_KEY;
  if (!a) throw new Error("MODEL_API_KEY tanimli degil (.env)");
  return a;
}

async function istek(yol: string, govde: { model: string; [alan: string]: unknown }): Promise<any> {
  for (let deneme = 0; ; deneme++) {
    let yanit: Response;
    try {
      yanit = await fetch(`${TABAN}${yol}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${anahtar()}`, "Content-Type": "application/json" },
        body: JSON.stringify(govde),
        signal: AbortSignal.timeout(300_000),
      });
    } catch (e) {
      // Baglanti kopmasi (fetch failed, UND_ERR_SOCKET) da gecici hatadir: sinavda Naha satiri bununla dustu.
      if (deneme >= 3) throw e;
      await new Promise((c) => setTimeout(c, 1000 * 2 ** deneme));
      continue;
    }
    if (yanit.ok) {
      const d = await yanit.json();
      say(d, govde.model);
      return d;
    }
    const metin = (await yanit.text()).slice(0, 500);
    if (yanit.status !== 429 && yanit.status < 500) throw new Error(`Meta API ${yanit.status}: ${metin}`);
    if (deneme >= 4) throw new Error(`Meta API ${yanit.status}, ${deneme + 1} denemede gecmedi: ${metin}`);
    const bekle = Number(yanit.headers.get("retry-after")) * 1000 || 500 * 2 ** deneme;
    await new Promise((c) => setTimeout(c, bekle + Math.random() * 300));
  }
}

/** JSON semasina kilitli cevap (Chat Completions + response_format). */
export async function yapili<T>(sistem: string, kullanici: string, ad: string, sema: object): Promise<T> {
  const d = await istek("/chat/completions", {
    model: MODEL,
    messages: [
      { role: "system", content: sistem },
      { role: "user", content: kullanici },
    ],
    response_format: { type: "json_schema", json_schema: { name: ad, schema: sema } },
  });
  return JSON.parse(d.choices[0].message.content) as T;
}

/** Gorsel okuyan JSON cevap: gorseller verilen sirayla modele gider. */
export async function gorselYapili<T>(sistem: string, metin: string, jpegler: Buffer[], ad: string, sema: object): Promise<T> {
  const d = await istek("/chat/completions", {
    model: MODEL,
    messages: [
      { role: "system", content: sistem },
      { role: "user", content: [{ type: "text", text: metin }, ...jpegler.map((j) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${j.toString("base64")}` } }))] },
    ],
    response_format: { type: "json_schema", json_schema: { name: ad, schema: sema } },
  });
  return JSON.parse(d.choices[0].message.content) as T;
}

export type Atif = { url: string; baslik: string; alinti: string };

/** Web aramali cevap (Responses API + web_search). Atiflari url_citation'dan okur. */
export async function aramali(girdi: string, model = MODEL, arkaPlan = false): Promise<{ metin: string; atiflar: Atif[] }> {
  const govde = { model, input: [{ role: "user", content: girdi }], tools: [{ type: "web_search" }] };
  const d = arkaPlan ? await arkaPlandaBekle(govde) : await istek("/responses", govde);
  let metin = "";
  const atiflar: Atif[] = [];
  for (const parca of d.output ?? []) {
    if (parca.type !== "message") continue;
    for (const blok of parca.content ?? []) {
      if (blok.type !== "output_text") continue;
      for (const a of blok.annotations ?? []) {
        if (a.type === "url_citation")
          atiflar.push({ url: a.url, baslik: a.title ?? "", alinti: blok.text.slice(a.start_index, a.end_index) });
      }
      metin += blok.text;
    }
  }
  return { metin, atiflar };
}

/**
 * Uzun ajan isi (Muse Wonder + web aramasi) tek baglantida beklenince Meta baglantiyi kapatiyor (UND_ERR_SOCKET, 4 Kas olcumu).
 * background: true ile is siraya alinir, sonuc GET /v1/responses/{id} ile yoklanir.
 */
async function arkaPlandaBekle(govde: { model: string; [alan: string]: unknown }, azamiSn = 1200): Promise<any> {
  const ilk = await fetch(`${TABAN}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${anahtar()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...govde, background: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!ilk.ok) throw new Error(`Meta API ${ilk.status}: ${(await ilk.text()).slice(0, 300)}`);
  const { id } = await ilk.json();
  const son = Date.now() + azamiSn * 1000;
  while (Date.now() < son) {
    await new Promise((c) => setTimeout(c, 5000));
    const r = await fetch(`${TABAN}/responses/${id}`, { headers: { Authorization: `Bearer ${anahtar()}` }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (!r?.ok) continue;
    const d = await r.json();
    if (d.status === "completed") { say(d, govde.model); return d; }
    if (d.status === "failed" || d.status === "cancelled" || d.status === "incomplete") throw new Error(`Meta API arka plan isi ${d.status}: ${JSON.stringify(d.error ?? d.incomplete_details ?? {}).slice(0, 300)}`);
  }
  throw new Error(`Meta API arka plan isi ${azamiSn} sn icinde bitmedi`);
}

// Muse Voice Transcribe: operasyon ekibi soruyu sesle sorar. Belge: https://dev.meta.ai/docs/speech-to-text
// Ses kaydedilmez; yalniz yaziya dokum dondurulur. Fiyat saatte 0,18 $ (pricing-rate-limits).
export const SES_MODELI = "muse-voice-transcribe-1.0";
const SES_SAAT_FIYATI = 0.18;
export async function yaziyaDok(wav: Uint8Array<ArrayBuffer>, keywords: string[]): Promise<{ metin: string; sn: number; dolar: number }> {
  const f = new FormData();
  f.append("request", new Blob([JSON.stringify({ mode: "ENDPOINTING", model: SES_MODELI, audioEncoding: "WAV", languageBias: ["English", "Turkish"], keywords })], { type: "application/json" }));
  f.append("audio", new Blob([wav], { type: "audio/wav" }), "soru.wav");
  const r = await fetch(`${TABAN}/asr/transcribe?sessionId=sez-${Date.now()}`, { method: "POST", headers: { Authorization: `Bearer ${anahtar()}` }, body: f, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`Muse Voice Transcribe ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const sn = Math.floor((d.audioDurationMs ?? 0) / 1000);
  const dolar = (sn / 3600) * SES_SAAT_FIYATI;
  for (const s of [sayac, kapsam.getStore()]) if (s) { s.istek++; s.modelDolar += dolar; }
  return { metin: String(d.transcript ?? "").trim(), sn, dolar };
}
