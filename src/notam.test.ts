import assert from "node:assert/strict";
import { test } from "node:test";
import { notamCoz, turBul, yonBul } from "./notam.ts";

test("Q kodundan tur okunur, rutin yayin alinmaz", () => {
  assert.equal(turBul("FA", "LC"), "meydan");
  assert.equal(turBul("MR", "LC"), "pist");
  assert.equal(turBul("RT", "CA"), "hava-sahasi");
  assert.equal(turBul("GW", "AS"), "navigasyon");
  assert.equal(turBul("MX", "LC"), null);
  assert.equal(turBul("OB", "CE"), null);
});

test("kapanisin yonu ayrilir", () => {
  assert.equal(yonBul("AD CLSD FOR LDG DUE TO WIP"), "inis");
  assert.equal(yonBul("AD CLOSED FOR TAKE-OFF"), "kalkis");
  assert.equal(yonBul("AD CLSD"), "tam");
  assert.equal(yonBul("AD CLSD FOR LDG AND TKOF"), "tam");
  assert.equal(yonBul("LIGHTING U/S"), null);
  assert.equal(yonBul("AD AP CLSD TO NON SKED TRANSIENT GA ACFT EXC 24HR PPR"), "sinirli");
});

test("belgedeki ornek satir cozulur", () => {
  const n = notamCoz({ code23: "FA", code45: "LT", itema: ["EDDS"], iteme: "MIL SIDE NO TRANSIENT ALERT\nAVBL DLY 2000-0400.", series: "P", number: 825, year: 17, startvalidity: 1485763560, endvalidity: 1493596740 });
  assert.equal(n?.no, "P825/17");
  assert.equal(n?.meydan, "EDDS");
  assert.equal(n?.tur, "meydan");
  assert.equal(n?.metin, "MIL SIDE NO TRANSIENT ALERT AVBL DLY 2000-0400.");
  assert.equal(n?.baslangic, "2017-01-30 08:06 UTC");
});

test("suresiz yayinin bitisi bos kalir, ilgisiz satir atlanir", () => {
  assert.equal(notamCoz({ code23: "FA", code45: "LC", startvalidity: 1485763560, endvalidity: 2 ** 32 - 1 })?.bitis, null);
  assert.equal(notamCoz({ code23: "OB", code45: "CE", startvalidity: 1485763560 }), null);
});
