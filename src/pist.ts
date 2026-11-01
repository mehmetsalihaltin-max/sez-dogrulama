// Komut satiri: pist maskesini kuru gunden cikarir, her gun icin su olcer, kanit goruntusu yazar.
// node --env-file=.env src/pist.ts <ad> <boylam> <enlem> <x> <y> <kuru-gun> <gun...>
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { G, asindir, bantlariOku, gorunurOku, olc, pikselSuMu, sahneBul } from "./uydu.ts";
import { noktaMaskesi } from "./sam.ts";

const [ad, lon, lat, x, y, kuru, ...gunler] = process.argv.slice(2);
if (!ad || !kuru || !gunler.length) throw new Error("kullanim: src/pist.ts <ad> <boylam> <enlem> <x> <y> <kuru-gun> <gun...>");
const [bo, en] = [+lon, +lat];

async function png(f: any) {
  const v = await gorunurOku(f, bo, en);
  return sharp(Buffer.from(v.d as Uint8Array), { raw: { width: v.w, height: v.h, channels: 3 } })
    .resize(G, G, { kernel: "lanczos3" })
    .png()
    .toBuffer();
}

await mkdir("cikti/pist", { recursive: true });
const maske = asindir(await noktaMaskesi(await png(await sahneBul(bo, en, kuru)), +x, +y));
const sonuc = [];
for (const gun of [kuru, ...gunler]) {
  const f = await sahneBul(bo, en, gun);
  const b = await bantlariOku(f, bo, en);
  const olcum = olc(maske, b);
  const kat = Buffer.alloc(G * G * 4);
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      if (!maske[j * G + i]) continue;
      kat.set(pikselSuMu(b, i, j).ikisi ? [255, 45, 45, 235] : [60, 220, 120, 215], (j * G + i) * 4);
    }
  }
  await sharp(await png(f))
    .composite([{ input: kat, raw: { width: G, height: G, channels: 4 } }])
    .png()
    .toFile(`cikti/pist/${ad}-${gun}.png`);
  sonuc.push({ gun, sahne: f.id, bulutSahne: f.properties["eo:cloud_cover"], ...olcum });
  console.log(gun, JSON.stringify(olcum));
}
await writeFile(`cikti/pist/${ad}.json`, JSON.stringify({ ad, boylam: bo, enlem: en, sonuc }, null, 2));
