// Kanit hafizasi: ayni olayin kaynaklari birikir, silinen duser, baska olay karismaz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { birlestir, hafizadanSec, silinenleriBul, type Hafiza } from "./hafiza.ts";
import { degerlendir } from "./kapi.ts";
import type { Aday } from "./topla.ts";

const aday = (n: number, baslik = `Bali flights cancelled after volcano ash ${n}`): Aday => ({
  baslik, yayinci: `Yayinci ${n}`, alanAdi: `y${n}.test`, url: `https://y${n}.test/a`, tarih: "2025-06-18T08:00:00.000Z", dil: "en",
});

test("ayni olay: yer adlarindan biri tutar, tarih en cok bir gun farkli", () => {
  let h: Hafiza = {};
  h = birlestir(h, ["Denpasar", "Bali"], "2025-06-18", [aday(1), aday(2)], new Set());
  assert.equal(hafizadanSec(h, ["Bali"], "2025-06-19").length, 2);
  assert.equal(hafizadanSec(h, ["DENPASAR"], "2025-06-17").length, 2);
  assert.equal(hafizadanSec(h, ["Bali"], "2025-06-21").length, 0, "baska gun baska olay");
  assert.equal(hafizadanSec(h, ["Lombok"], "2025-06-18").length, 0, "baska yer baska olay");
});

test("kaynaklar birikir, sayac sifirlanmaz; silinen her kayittan duser", () => {
  let h: Hafiza = {};
  h = birlestir(h, ["Bali"], "2025-06-18", [aday(1), aday(2), aday(3)], new Set());
  h = birlestir(h, ["Bali"], "2025-06-18", [aday(2), aday(4)], new Set());
  assert.equal(hafizadanSec(h, ["Bali"], "2025-06-18").length, 4);
  h = birlestir(h, ["Denpasar"], "2025-06-18", [], new Set([aday(1).url]));
  const kalan = hafizadanSec(h, ["Bali"], "2025-06-18").map((a) => a.url);
  assert.equal(kalan.length, 3);
  assert.ok(!kalan.includes(aday(1).url));
});

test("yalniz 404 ve 410 silindi sayilir; ag hatasi kaynagi dusurmez", async () => {
  const kod: Record<string, number | null> = { [aday(1).url]: 404, [aday(2).url]: 410, [aday(3).url]: null, [aday(4).url]: 403 };
  const s = await silinenleriBul([aday(1), aday(2), aday(3), aday(4)], async (u) => kod[u]);
  assert.deepEqual([...s].sort(), [aday(1).url, aday(2).url].sort());
});

test("hatirlanan aday kapidan yeniden gecer: alinti basligi tutmazsa sayilmaz", () => {
  const p = { ilk: "2025-06-16T00:00:00.000Z", son: "2025-06-23T00:00:00.000Z" };
  const adaylar = [aday(1), aday(2), aday(3)];
  const kararlar = adaylar.map((a, id) => ({ id, karar: "destekliyor" as const, alinti: id === 2 ? "uydurma alinti" : a.baslik.slice(0, 30), ceviri: "", ceviriEn: "" }));
  const s = degerlendir(adaylar, kararlar, p, ["Bali"]);
  assert.equal(s.bagimsizYayinci, 1, "ayni haber basligi tek yayinci sayilir, uydurma alinti reddedilir");
  assert.equal(s.reddedilen.length, 1);
});
