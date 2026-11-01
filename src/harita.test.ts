import test from "node:test";
import assert from "node:assert/strict";
import { buyukDaire, csvSatiri, havalimaniCoz, rotayaUzaklikKm, ucusUlkeleri, ulkeBul, type Nokta } from "./harita.ts";
import { durumVer, gurultuMu, iliskiVer, pencereKur } from "./rota.ts";

test("tirnakli virgul alani bolmez", () => {
  assert.deepEqual(csvSatiri('1,"Kansas City, MO",x'), ["1", "Kansas City, MO", "x"]);
});

test("ayni kodda buyuk havalimani kazanir, kodsuz satir atlanir", () => {
  const csv = "type,name,latitude_deg,longitude_deg,iso_country,municipality,iata_code\n" +
    "small_airport,Kucuk,1,2,TR,A,AAA\nlarge_airport,Buyuk,3,4,TR,A,AAA\nlarge_airport,Kodsuz,5,6,TR,B,\nheliport,Pist,7,8,TR,C,CCC";
  const t = havalimaniCoz(csv);
  assert.equal(t.size, 1);
  assert.equal(t.get("AAA")?.ad, "Buyuk");
});

const IST: Nokta = [28.74, 41.27];
const EBL: Nokta = [43.96, 36.24];

test("buyuk daire uc noktalardan gecer", () => {
  const r = buyukDaire(IST, EBL, 10);
  assert.equal(r.length, 11);
  assert.ok(Math.abs(r[0][0] - IST[0]) < 1e-6);
  assert.ok(Math.abs(r[10][1] - EBL[1]) < 1e-6);
});

test("Istanbul-Erbil rotasinin gectigi ulkeler kodla bulunur", async () => {
  const u = await ucusUlkeleri(buyukDaire(IST, EBL));
  assert.ok(u.includes("Turkey"), u.join());
  assert.ok(u.includes("Iraq"), u.join());
});

test("rotaya uzaklik kilometre verir", () => {
  const d = rotayaUzaklikKm([28.74, 42.27], [IST]);
  assert.ok(d > 105 && d < 118, String(d));
});

test("ulke adi buyuk kucuk harften bagimsiz bulunur", async () => {
  assert.equal((await ulkeBul("iraq"))?.properties.name, "Iraq");
  assert.equal(await ulkeBul("Narnia"), undefined);
});

test("kanit yoksa guvenli denmez, bulgu yok denir", () => {
  assert.equal(durumVer([{ seviye: "kanit-yok", iliski: "koridorda" }]), "bulgu-yok");
  assert.equal(durumVer([]), "bulgu-yok");
  assert.equal(durumVer([{ seviye: "tek-kaynak", iliski: "koridorda" }]), "dogrulanmamis-isaret");
});

test("rotadan uzak teyitli olay rota riski sayilmaz (Dera vakasi)", () => {
  const dera = iliskiVer({ tur: "nokta", km: 460, rotaVar: true, havaSahasiRotada: false });
  assert.equal(dera, "bolgesel");
  assert.equal(durumVer([{ seviye: "teyitli", iliski: dera }]), "bolgesel-gelisme");
  assert.equal(durumVer([{ seviye: "teyitli", iliski: "koridorda" }]), "koridorda-teyitli");
});

test("yeri bilinmeyen olay koridora yazilmaz, rotanin gectigi hava sahasi kapanirsa yazilir", () => {
  assert.equal(iliskiVer({ tur: "ulke", km: null, rotaVar: true, havaSahasiRotada: false }), "konum-genel");
  assert.equal(iliskiVer({ tur: "ulke", km: null, rotaVar: true, havaSahasiRotada: true }), "koridorda");
  assert.equal(iliskiVer({ tur: "nokta", km: null, rotaVar: false, havaSahasiRotada: false }), "ulke-ici");
});

test("meydandan uzak yerel olay elenir, genis etkili olay elenmez (Goreme vakasi)", () => {
  const yerel = { tehlike: "hava", iata: "", hava_sahasi: false };
  assert.equal(gurultuMu(yerel, 240), true);
  assert.equal(gurultuMu(yerel, null), true);
  assert.equal(gurultuMu(yerel, 8), false);
  assert.equal(gurultuMu({ ...yerel, iata: "SAW" }, 240), false);
  assert.equal(gurultuMu({ ...yerel, tehlike: "dron" }, 400), false);
  assert.equal(gurultuMu({ ...yerel, hava_sahasi: true }, null), false);
});

test("tarihli soru gecmis pencereyi kullanir", () => {
  assert.deepEqual(pencereKur("2024-05-06"), { ilk: "2024-04-29", son: "2024-05-07" });
  assert.equal(pencereKur("", Date.parse("2026-11-01T12:00:00Z")).son, "2026-11-01");
});
