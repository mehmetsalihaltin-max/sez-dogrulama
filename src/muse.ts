// Meta Model API istemcisi: https://dev.meta.ai/docs/quickstart
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
export const tahminiDolar = () => sayac.modelDolar + sayac.arama * ARAMA_FIYATI;

function say(d: any, model: string) {
  const girdi = d.usage?.prompt_tokens ?? d.usage?.input_tokens ?? 0;
  const cikti = d.usage?.completion_tokens ?? d.usage?.output_tokens ?? 0;
  const f = model.startsWith("muse-wonder") ? FIYAT.wonder : FIYAT.spark;
  sayac.istek++;
  sayac.girdi += girdi;
  sayac.cikti += cikti;
  sayac.modelDolar += girdi * f.girdi + cikti * f.cikti;
  sayac.arama += (d.output ?? []).filter((p: any) => p.type === "web_search_call").length;
}

function anahtar(): string {
  const a = process.env.MODEL_API_KEY;
  if (!a) throw new Error("MODEL_API_KEY tanimli degil (.env)");
  return a;
}

async function istek(yol: string, govde: { model: string }): Promise<any> {
  for (let deneme = 0; ; deneme++) {
    const yanit = await fetch(`${TABAN}${yol}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${anahtar()}`, "Content-Type": "application/json" },
      body: JSON.stringify(govde),
      signal: AbortSignal.timeout(300_000),
    });
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

export type Atif = { url: string; baslik: string; alinti: string };

/** Web aramali cevap (Responses API + web_search). Atiflari url_citation'dan okur. */
export async function aramali(girdi: string, model = MODEL): Promise<{ metin: string; atiflar: Atif[] }> {
  const d = await istek("/responses", {
    model,
    input: [{ role: "user", content: girdi }],
    tools: [{ type: "web_search" }],
  });
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
