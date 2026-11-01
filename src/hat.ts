// Komut satiri: brifing dosyasini dogrular, sonucu ve denetim izini JSON'a yazar.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { iddiaDogrula, iddialariCikar } from "./dogrula.ts";
import { sayac, tahminiDolar } from "./muse.ts";

const [dosya, cikti = "cikti/sonuc.json"] = process.argv.slice(2);
if (!dosya) throw new Error("kullanim: node --env-file=.env src/hat.ts <brifing.txt> [cikti.json]");

const brifing = await readFile(dosya, "utf-8");
// Her satir bir iddiadir: model satiri bolup birlestiremez, ayni girdi ayni sinav olur.
const bugun = new Date().toISOString().slice(0, 10);
const satirlar = brifing.split("\n").map((s) => s.trim()).filter(Boolean);
const iddialar = (await Promise.all(satirlar.map(async (s) => (await iddialariCikar(s, bugun))[0]))).filter(Boolean);
if (iddialar.length !== satirlar.length) console.log(`UYARI: ${satirlar.length} satirdan ${iddialar.length} iddia cikti`);
const sonuclar = [];
for (const iddia of iddialar) sonuclar.push(await iddiaDogrula(iddia));

await mkdir("cikti", { recursive: true });
await writeFile(cikti, JSON.stringify({ tarih: new Date().toISOString(), brifing, sonuclar, maliyet: { ...sayac, dolar: tahminiDolar() } }, null, 2));

for (const r of sonuclar) {
  const s = r.sonuc;
  const hatali = r.denetim.sorgular.filter((q) => q.hata).length;
  console.log(`[${s.seviye}] ${r.iddia}`);
  console.log(
    `  ${s.gerekce} · aday ${r.adaySayisi} · diller: ${s.diller.join(",") || "-"} · kapıdan dönen ${s.reddedilen.length}` +
      ` · karar verilmeyen ${s.eksikKarar} · hatalı sorgu ${hatali}/${r.denetim.sorgular.length}`,
  );
}
console.log(`Bu kosu: ${sayac.istek} istek, ${sayac.girdi} girdi + ${sayac.cikti} cikti jetonu, tahmini $${tahminiDolar().toFixed(4)}`);
