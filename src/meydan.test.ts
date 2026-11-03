import assert from "node:assert/strict";
import { test } from "node:test";
import { yakinPencere, kareOlc, olayYeri, sahneSec } from "./meydan.ts";

test("bulutlu ya da yarim sahne atlanir, en yeni acik sahne secilir", () => {
  const a = [
    { zaman: "3", bulut: 80, bos: 0 },
    { zaman: "2", bulut: 5, bos: 60 },
    { zaman: "1", bulut: 10, bos: 0 },
    { zaman: "0", bulut: 0, bos: 0 },
  ];
  assert.equal(sahneSec(a)?.zaman, "1");
  assert.equal(sahneSec(a.slice(0, 2)), null);
});

test("kare olcumu bulut ve bos veriyi ayri sayar", () => {
  assert.deepEqual(kareOlc([0, 9, 4, 4, 3, 5, 5, 5, 5, 5]), { bulut: 20, bos: 10 });
});

test("volkan olayi meydanda degil yanardagda aranir", () => {
  assert.deepEqual(olayYeri("Lewotobi Laki-Laki yanardagi patladi", "kul", [115, -8]), [122.775, -8.542]);
  assert.deepEqual(olayYeri("Lewotobi yakininda sel", "sel", [115, -8]), [115, -8]);
});

test("yakin gorunum karenin ortasindan alinir, 10 m cozunurlugu korur", () => {
  assert.deepEqual(yakinPencere(2000, 2000), { left: 600, top: 600, width: 800, height: 800 });
});
