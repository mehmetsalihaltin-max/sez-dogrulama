import test from "node:test";
import assert from "node:assert/strict";
import { alintiSayfadaMi, jsonDizi, sayfaMetni, yayinTarihi } from "./govde.ts";

const SAYFA = `<html><head><meta property="article:published_time" content="2026-10-27T08:00:00Z">
<script>var a = "gizli metin";</script></head><body><p>The heavy fog around the <a href="/d">Denver</a> metro area
prompted ground stops at Denver International Airport.</p><p>O&#39;Hare &amp; Midway were fine.</p></body></html>`;

test("etiketli ve satir bolunmus cumle sayfada bulunur", () => {
  assert.ok(alintiSayfadaMi("The heavy fog around the Denver metro area prompted ground stops at Denver International Airport.", SAYFA));
});

test("uydurma cumle reddedilir", () => {
  assert.equal(alintiSayfadaMi("The heavy snow around the Denver metro area prompted ground stops at Denver.", SAYFA), false);
});

test("betik icindeki metin kanit sayilmaz", () => {
  assert.equal(sayfaMetni(SAYFA).includes("gizli metin"), false);
});

test("kisa parca alinti sayilmaz", () => {
  assert.equal(alintiSayfadaMi("Denver", SAYFA), false);
});

test("html kodlari cozulur", () => {
  assert.ok(sayfaMetni(SAYFA).includes("O'Hare & Midway"));
});

test("yayin tarihi sayfa kaydindan okunur", () => {
  assert.equal(yayinTarihi(SAYFA), "2026-10-27T08:00:00.000Z");
  assert.equal(yayinTarihi('<script>{"datePublished":"2026-10-28"}</script>'), "2026-10-28T00:00:00.000Z");
  assert.equal(yayinTarihi("<p>tarih yok</p>"), null);
});

test("modelin anlatimi arasindan dizi ayiklanir", () => {
  const d = jsonDizi('I searched.[{"url":"https://a.test","alinti":"x"}]');
  assert.equal(d.length, 1);
  assert.deepEqual(jsonDizi("bozuk [{"), []);
  assert.deepEqual(jsonDizi("[]"), []);
});
