import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { planBul, sahneKur, type Veri } from "./sahne.ts";

const veri: Veri = JSON.parse(readFileSync(new URL("../ornek/porto-alegre.json", import.meta.url), "utf-8"));

test("yontemler uyusmayinca oran yazilmaz, plan degismez", () => {
  const [, ikinci, ucuncu] = sahneKur(veri);
  assert.equal(ucuncu.olcum.oran, null);
  assert.equal(ucuncu.sonucYok, true);
  assert.equal(ucuncu.plan, ikinci.plan);
  assert.match(ucuncu.kanit, /YÖNTEMLER UYUŞMUYOR/);
  assert.match(ucuncu.neden, /değişmedi/);
  assert.match(ucuncu.simdi, /fark 28,7 puan/);
});

test("kart onceki gecerli olcumu gosterir", () => {
  const [ilk, ikinci, ucuncu] = sahneKur(veri);
  assert.match(ilk.once, /Önceki ölçüm yok/);
  assert.match(ikinci.once, /18 Nisan 2024: su oranı %0/);
  assert.match(ucuncu.once, /6 Mayıs 2024: su oranı %79,4/);
});

test("su sinirin ustune cikinca degerlendirme degisir ve sebebi yazilir", () => {
  const [ilk, ikinci] = sahneKur(veri);
  assert.equal(ilk.plan, "planda");
  assert.equal(ikinci.plan, "plan-disi");
  assert.match(ikinci.neden, /Değerlendirme değişti/);
});

test("baslik gecisi gosterir, oran yoksa sonuc yok yazar", () => {
  assert.deepEqual(sahneKur(veri).map((a) => a.baslik), ["Su oranı %0", "Su oranı %0 → %79,4", "Su oranı %79,4 → sonuç yok"]);
});

test("cekim ve isleme zamani ayri tasinir", () => {
  for (const a of sahneKur(veri)) {
    assert.match(a.cekim, /UTC$/);
    assert.match(a.isleme, /UTC$/);
    assert.notEqual(a.cekim, a.isleme);
  }
});

test("olcum yoksa plan onceki haliyle kalir", () => {
  const bulutlu = { durum: "bulutlu" as const, ndwi: 5, scl: 5, bulut: 60 };
  assert.equal(planBul("planda", bulutlu, 10), "planda");
  assert.equal(planBul("plan-disi", bulutlu, 10), "plan-disi");
  assert.equal(planBul(null, bulutlu, 10), "plan-disi");
});

test("su sinirin altina inince plana donulur", () => {
  assert.equal(planBul("plan-disi", { durum: "olculdu", oran: 4, ndwi: 4, scl: 4, bulut: 0 }, 10), "planda");
});
