import test from "node:test";
import assert from "node:assert/strict";
import { degerlendir, type ModelKarari } from "./kapi.ts";
import type { Aday } from "./topla.ts";

const aday = (baslik: string, yayinci: string, dil: Aday["dil"] = "tr", tarih = "2026-10-20T10:00:00.000Z", alanAdi = ""): Aday => ({
  baslik,
  yayinci,
  alanAdi: alanAdi || `${yayinci.toLowerCase()}.test`,
  url: "https://ornek.test",
  tarih,
  dil,
});
const pencere = { ilk: "2026-10-19T00:00:00.000Z", son: "2026-10-22T00:00:00.000Z" };
const yer = ["Pist", "Ucuslar", "Runway", "Meydan", "Havalimani"];
const d = (id: number, alinti: string, karar: ModelKarari["karar"] = "destekliyor"): ModelKarari => ({
  id,
  karar,
  alinti,
  ceviri: "",
});

test("uydurma alinti kanit sayilmaz", () => {
  const s = degerlendir([aday("Pist kapatildi", "A")], [d(0, "havalimani kapandi")], pencere, yer);
  assert.equal(s.seviye, "kanit-yok");
  assert.equal(s.reddedilen[0].sebep, "alıntı kaynak metinde birebir yok");
});

test("pencere disindaki haber elenir", () => {
  const a = [aday("Pist kapatildi", "A", "tr", "2026-09-01T00:00:00.000Z")];
  assert.equal(degerlendir(a, [d(0, "Pist kapatildi")], pencere, yer).seviye, "kanit-yok");
});

test("ayni basligi basan yayincilar tek kaynak sayilir", () => {
  const a = [aday("Pist kapatildi", "A"), aday("Pist kapatildi!", "B"), aday("Pist kapatildi", "C", "en")];
  const s = degerlendir(a, a.map((_, i) => d(i, "Pist kapatildi")), pencere, yer);
  assert.equal(s.bagimsizYayinci, 1);
  assert.equal(s.seviye, "tek-kaynak");
});

test("sonuna ek yapilan kopya baslik da tek kaynak sayilir (Heathrow vakasi)", () => {
  const b = "All the Heathrow and Gatwick flights cancelled as Storm Boelo continues to hit travel";
  const a = [aday(`${b} | Framing Analysis`, "NewsCord", "en"), aday(b, "AOL.com", "en", undefined, "aol.com")];
  const s = degerlendir(a, a.map((x, i) => d(i, x.baslik)), pencere, ["Heathrow"]);
  assert.equal(s.bagimsizYayinci, 1);
  assert.equal(s.seviye, "tek-kaynak");
});

test("yeniden yazilmis ajans haberi tek kaynak sayilir (Heathrow vakasi)", () => {
  const a = [
    aday("Heathrow and Gatwick flights cancelled as Storm Boelo continues to hit travel", "NewsCord", "en"),
    aday("Heathrow and Gatwick flights cancelled amid Storm Boelo havoc", "Standard", "en"),
  ];
  const s = degerlendir(a, a.map((x, i) => d(i, x.baslik)), pencere, ["Heathrow"]);
  assert.equal(s.bagimsizYayinci, 1);
});

test("tek kelimelik etiket alinti sayilmaz, Japonca baslik sayilir", () => {
  const a = [aday("Heathrow-Flughafenschließung", "A", "de"), aday("那覇空港欠航", "B", "ja")];
  const s = degerlendir(a, a.map((x, i) => d(i, x.baslik)), pencere, ["Heathrow", "那覇"]);
  assert.equal(s.reddedilen[0].sebep, "alıntı olay anlatmıyor");
  assert.equal(s.bagimsizYayinci, 1);
});

test("toplayici site bagimsiz kaynak sayilmaz", () => {
  const a = [aday("Pist kapatildi", "A"), aday("Ucuslar durdu tamamen", "Yahoo", "tr", undefined, "news.yahoo.co.jp")];
  const s = degerlendir(a, a.map((x, i) => d(i, x.baslik)), pencere, yer);
  assert.equal(s.bagimsizYayinci, 1);
});

test("ayni alan adindan gelen iki haber tek yayinci sayilir", () => {
  const a = [aday("Pist kapatildi", "A", "tr", undefined, "site.test"), aday("Ucuslar durdu tamamen", "A Gazetesi", "tr", undefined, "site.test")];
  assert.equal(degerlendir(a, a.map((x, i) => d(i, x.baslik)), pencere, yer).bagimsizYayinci, 1);
});

test("iki dilde uc bagimsiz yayinci teyitli olur", () => {
  const a = [aday("Pist kapatildi", "A"), aday("Ucuslar durdu", "B"), aday("Runway closed", "C", "en")];
  const s = degerlendir(a, [d(0, "Pist kapatildi"), d(1, "Ucuslar durdu"), d(2, "Runway closed")], pencere, yer);
  assert.equal(s.seviye, "teyitli");
});

test("yerel olay tek dilde de teyitli olabilir", () => {
  const a = [aday("Pist kapatildi", "A"), aday("Ucuslar durdu", "B"), aday("Meydan kapali", "C")];
  const s = degerlendir(a, [d(0, "Pist kapatildi"), d(1, "Ucuslar durdu"), d(2, "Meydan kapali")], pencere, yer);
  assert.equal(s.seviye, "teyitli");
});

test("iki bagimsiz yayinci kismen kalir", () => {
  const a = [aday("Pist kapatildi", "A"), aday("Ucuslar durdu", "B")];
  assert.equal(degerlendir(a, [d(0, "Pist kapatildi"), d(1, "Ucuslar durdu")], pencere, yer).seviye, "kismen");
});

test("celisen kaynak varsa teyitli denmez", () => {
  const a = [
    aday("Pist kapatildi", "A"),
    aday("Ucuslar durdu", "B"),
    aday("Runway closed", "C", "en"),
    aday("Havalimani acik", "D"),
  ];
  const k = [d(0, "Pist kapatildi"), d(1, "Ucuslar durdu"), d(2, "Runway closed"), d(3, "Havalimani acik", "celisiyor")];
  assert.equal(degerlendir(a, k, pencere, yer).seviye, "celiskili");
});

test("modelin uydurdugu kimlik yok sayilir", () => {
  assert.equal(degerlendir([aday("Pist kapatildi", "A")], [d(9, "Pist kapatildi")], pencere, yer).seviye, "kanit-yok");
});

test("yer adi basligi tutmuyorsa kanit sayilmaz", () => {
  const s = degerlendir([aday("Motor arizasi yasandi", "A")], [d(0, "Motor arizasi yasandi")], pencere, ["Naha"]);
  assert.equal(s.seviye, "kanit-yok");
  assert.equal(s.reddedilen[0].sebep, "yer adı başlıkta geçmiyor");
});

test("modelin atladigi aday sayilir", () => {
  const s = degerlendir([aday("Pist kapatildi", "A"), aday("Ucuslar durdu", "B")], [d(0, "", "ilgisiz")], pencere, yer);
  assert.equal(s.eksikKarar, 1);
});
