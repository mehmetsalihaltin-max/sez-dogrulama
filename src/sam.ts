// SAM 3.1 nokta komutu: uydu goruntusunde kavram komutu bos doner, tek nokta pisti bulur.
import { decodeMaskToRaster, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { G } from "./uydu.ts";

async function* olaylar(metin: string) {
  for (const satir of metin.split("\n")) {
    if (!satir.startsWith("data:")) continue;
    const s = satir.slice(5).trim();
    if (s === "[DONE]") continue;
    try {
      yield JSON.parse(s);
    } catch {
      // yarim satir: akisin devami etkilenmez
    }
  }
}

export async function noktaMaskesi(png: Buffer, x: number, y: number): Promise<Uint8Array> {
  const r = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sam-3.1",
      stream: true,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: `<0f>1<|point;x=${x};y=${y};w=${G};h=${G}|>` },
            { type: "input_image", image_url: `data:image/png;base64,${png.toString("base64")}` },
          ],
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`SAM ${r.status} ${(await r.text()).slice(0, 300)}`);
  const p = parseImageStream(olaylar(await r.text()));
  for await (const _ of p) void _;
  const maske = new Uint8Array(G * G);
  for (const k of recordsOfKind((await p.finalResult).records, "mask") as any[]) {
    const { left, top, right, bottom } = k.bounds;
    const w = right - left;
    const ras = decodeMaskToRaster(k.mask);
    for (let j = 0; j < bottom - top; j++) {
      for (let i = 0; i < w; i++) if (ras[j * w + i]) maske[(top + j) * G + left + i] = 1;
    }
  }
  return maske;
}
