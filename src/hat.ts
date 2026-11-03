// Komut satiri: brifing (.txt) ya da beklenen cevapli sinav (.json) dosyasini dogrular.
// Her satir ayri denenir ve hemen kaydedilir: bir satirin hatasi digerlerini silmez.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { iddiaDogrula, iddialariCikar } from "./dogrula.ts";
import { sayac, tahminiDolar } from "./muse.ts";
import type { Seviye } from "./kapi.ts";

// Sinav kosulari birbirinden bagimsiz olculur: onceki kosunun kaynaklari bu kosuya tasinmaz.
process.env.KANIT_HAFIZASI ??= "kapali";

export type Beklenen = "dogru" | "yanlis" | "belirsiz";
export type Satir = { id: number; iddia: string; beklenen?: Beklenen };
export type Sonuc = "destek-bulundu" | "destek-bulunamadi" | "yanlis-teyit" | "dogru-red" | "sonuclanmadi" | "disarida";

const DESTEK: Seviye[] = ["teyitli", "kismen"];

/** Dogru iddiada teyitli/kismen basari; yanlis iddiada teyitli/kismen yanlis teyittir. Tek kaynak ikisinde de destek sayilmaz. */
export function puanla(beklenen: Beklenen | undefined, seviye: Seviye | null): Sonuc {
  if (seviye === null) return "sonuclanmadi";
  if (!beklenen || beklenen === "belirsiz") return "disarida";
  const destek = DESTEK.includes(seviye);
  if (beklenen === "dogru") return destek ? "destek-bulundu" : "destek-bulunamadi";
  return destek ? "yanlis-teyit" : "dogru-red";
}

export function ozet(kayitlar: { beklenen?: Beklenen; puan: Sonuc }[]) {
  const say = (p: Sonuc) => kayitlar.filter((k) => k.puan === p).length;
  const dogru = kayitlar.filter((k) => k.beklenen === "dogru" && k.puan !== "sonuclanmadi").length;
  const yanlis = kayitlar.filter((k) => k.beklenen === "yanlis" && k.puan !== "sonuclanmadi").length;
  return {
    toplam: kayitlar.length,
    sonuclanmadi: say("sonuclanmadi"),
    disarida: say("disarida"),
    dogruIddia: dogru,
    destekBulundu: say("destek-bulundu"),
    yanlisIddia: yanlis,
    yanlisTeyit: say("yanlis-teyit"),
    dogruRed: say("dogru-red"),
  };
}

async function satirlariOku(dosya: string): Promise<Satir[]> {
  const metin = await readFile(dosya, "utf-8");
  if (dosya.endsWith(".json")) return JSON.parse(metin).satirlar;
  return metin.split("\n").map((s) => s.trim()).filter(Boolean).map((iddia, i) => ({ id: i + 1, iddia }));
}

if (import.meta.main) {
  const [dosya, cikti = "cikti/sonuc.json"] = process.argv.slice(2);
  if (!dosya) throw new Error("kullanim: node --env-file=.env src/hat.ts <brifing.txt|sinav.json> [cikti.json]");
  const satirlar = await satirlariOku(dosya);
  const bugun = new Date().toISOString().slice(0, 10);
  const kayitlar: any[] = [];
  await mkdir("cikti", { recursive: true });
  const kaydet = () => writeFile(cikti, JSON.stringify({ tarih: new Date().toISOString(), dosya, kayitlar, ozet: ozet(kayitlar), maliyet: { ...sayac, dolar: tahminiDolar() } }, null, 2));

  for (const s of satirlar) {
    const t = Date.now();
    let kayit: any;
    try {
      const [iddia] = await iddialariCikar(s.iddia, bugun);
      if (!iddia) throw new Error("iddia cikarilamadi");
      const r = await iddiaDogrula(iddia);
      kayit = { ...s, seviye: r.sonuc.seviye, gerekce: r.sonuc.gerekce, sonuc: r };
    } catch (e) {
      kayit = { ...s, seviye: null, hata: e instanceof Error ? e.message : String(e) };
    }
    kayit.sn = Math.round((Date.now() - t) / 1000);
    kayit.puan = puanla(s.beklenen, kayit.seviye);
    kayitlar.push(kayit);
    await kaydet();
    console.log(`#${s.id} [${kayit.seviye ?? "HATA"}] ${kayit.puan} · ${kayit.sn} sn · ${kayit.gerekce ?? kayit.hata}`);
  }

  const o = ozet(kayitlar);
  console.log(`\nDogru iddia ${o.dogruIddia}: destek bulunan ${o.destekBulundu}`);
  console.log(`Yanlis iddia ${o.yanlisIddia}: yanlis teyit ${o.yanlisTeyit}, dogru red ${o.dogruRed}`);
  console.log(`Sonuclanmayan ${o.sonuclanmadi}, degerlendirme disi ${o.disarida}, toplam ${o.toplam}`);
  console.log(`Bu kosu: ${sayac.istek} istek, tahmini $${tahminiDolar().toFixed(4)}`);
}
