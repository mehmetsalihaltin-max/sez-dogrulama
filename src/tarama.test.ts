// Tarama yaniti okunamazsa sonuc "kanit yok" degil "tarama tamamlanamadi" olmali (Orkun denetimi, madde A).
import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonDiziAyikla } from "./govde.ts";
import { durumVer, taramaSuz } from "./rota.ts";

const P = { ilk: "2026-10-20", son: "2026-10-28" };
const OGE = { iddia: "Schiphol'de rüzgâr iptali", iddia_en: "Wind cancellations at Schiphol", olay_tarihi: "2026-10-25" };

test("tek satirli, cok satirli, citli ve anlatimli dizi okunur", () => {
  const tek = JSON.stringify([OGE]);
  const cok = JSON.stringify([OGE], null, 2);
  for (const m of [tek, cok, "```json\n" + cok + "\n```", `Searched sources [1] and [2].\n${cok}\nDone [3].`]) {
    assert.equal(jsonDiziAyikla(m)?.length, 1, m);
  }
});

test("dizi icindeki dizi ayri aday sayilmaz, tirnak icindeki parantez sayilmaz", () => {
  const m = JSON.stringify([{ iddia: "a ] [ b", kaynak: [{ x: 1 }] }], null, 2);
  const d = jsonDiziAyikla(m);
  assert.equal(d?.length, 1);
  assert.equal(d?.[0].iddia, "a ] [ b");
});

test("bos dizi okunur, bozuk metin okunamaz", () => {
  assert.deepEqual(jsonDiziAyikla("No events found.\n[]"), []);
  assert.equal(jsonDiziAyikla('[{"iddia": "yarim'), null);
  assert.equal(jsonDiziAyikla("I could not complete the search."), null);
});

test("tarama: gecerli bos ile okunamayan ayrilir", () => {
  assert.deepEqual(taramaSuz("[]", P), []);
  assert.equal(taramaSuz("bozuk", P), null);
  assert.equal(taramaSuz('[{"baska":"yapi"}]', P), null, "hicbir oge beklenen yapida degil");
  assert.equal(taramaSuz(JSON.stringify([OGE], null, 2), P)?.length, 1);
});

test("okunamayan tarama rota sonucuna tamamlanamadi olarak gecer", () => {
  assert.equal(durumVer([], [], false), "tarama-tamamlanamadi");
  assert.equal(durumVer([], [], true), "bulgu-yok");
  assert.equal(durumVer([]), "bulgu-yok");
});
