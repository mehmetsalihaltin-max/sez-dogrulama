import { test } from "node:test";
import assert from "node:assert/strict";
import { ozet, puanla } from "./hat.ts";

test("puanlama: yanlis teyit, dogru red, sonuclanmayan ve disarida ayri sayilir", () => {
  assert.equal(puanla("dogru", "teyitli"), "destek-bulundu");
  assert.equal(puanla("dogru", "tek-kaynak"), "destek-bulunamadi");
  assert.equal(puanla("yanlis", "kismen"), "yanlis-teyit");
  assert.equal(puanla("yanlis", "kanit-yok"), "dogru-red");
  assert.equal(puanla("yanlis", null), "sonuclanmadi");
  assert.equal(puanla("belirsiz", "teyitli"), "disarida");
});

test("ozet: sonuclanmayan satir paydaya girmez", () => {
  const o = ozet([
    { beklenen: "dogru", puan: "destek-bulundu" },
    { beklenen: "dogru", puan: "sonuclanmadi" },
    { beklenen: "yanlis", puan: "dogru-red" },
    { beklenen: "belirsiz", puan: "disarida" },
  ]);
  assert.deepEqual([o.dogruIddia, o.destekBulundu, o.yanlisIddia, o.dogruRed, o.sonuclanmadi, o.disarida], [1, 1, 1, 1, 1, 1]);
});
