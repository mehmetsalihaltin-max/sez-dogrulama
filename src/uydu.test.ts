import test from "node:test";
import assert from "node:assert/strict";
import { G, asindir, olc, type Bant } from "./uydu.ts";

const dolu = (n: number): Bant => ({ d: new Array(4).fill(n), w: 2, h: 2 });
const maske = () => {
  const m = new Uint8Array(G * G);
  for (let y = 100; y < 200; y++) for (let x = 100; x < 400; x++) m[y * G + x] = 1;
  return m;
};
// maske x=100-399 araliginda; sag yari x>=512 oldugu icin bolmeyi ince sutunlarla kuruyoruz
const seritli = (a: number, b: number): Bant => {
  const w = G;
  return { d: Array.from({ length: w * 1 }, (_, i) => (i < 250 ? a : b)), w, h: 1 };
};

test("iki yontem suda birlesirse oran verilir", () => {
  const s = olc(maske(), { yesil: dolu(800), nir: dolu(100), scl: dolu(6) });
  assert.deepEqual(s, { durum: "olculdu", oran: 100, ndwi: 100, scl: 100, bulut: 0 });
});

test("metal cati yalniz NDWI gecer, su sayilmaz", () => {
  const s = olc(maske(), { yesil: dolu(2000), nir: dolu(1500), scl: dolu(5) });
  assert.equal(s.durum, "yontemler-uyusmuyor");
});

test("kuru pist sifir verir", () => {
  const s = olc(maske(), { yesil: dolu(800), nir: dolu(1200), scl: dolu(5) });
  assert.equal(s.durum, "olculdu");
  assert.equal(s.durum === "olculdu" && s.oran, 0);
});

test("yontemler 10 puandan cok ayrilirsa rakam verilmez (21 Mayis vakasi)", () => {
  const s = olc(maske(), { yesil: dolu(150), nir: seritli(100, 200), scl: dolu(6) });
  assert.equal(s.durum, "yontemler-uyusmuyor");
  assert.equal("oran" in s, false);
});

test("bulut pisti ortuyorsa olculemez", () => {
  const s = olc(maske(), { yesil: dolu(800), nir: dolu(1200), scl: dolu(9) });
  assert.equal(s.durum, "bulutlu");
});

test("asindirma kenari atar, ici korur", () => {
  const a = asindir(maske(), 14);
  assert.equal(a[150 * G + 250], 1);
  assert.equal(a[100 * G + 250], 0);
  assert.ok(a.reduce((t, v) => t + v, 0) < maske().reduce((t, v) => t + v, 0));
});
