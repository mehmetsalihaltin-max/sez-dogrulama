import test from "node:test";
import assert from "node:assert/strict";
import { KAYITLI_IZLER, havalimaniSuz, buyukDaire, csvSatiri, hatAc, havalimaniCoz, rotayaUzaklikKm, ucusUlkeleri, ulkeBul, ulkedekiParcalar, type Nokta } from "./harita.ts";
import { durumVer, gurultuMu, hatKesisirMi, iliskiVer, kapanisMi, konumBul, pencereIcinde, pencereKur, ulkeGeneliKapanis } from "./rota.ts";

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

test("hat ulkeden gecerse parca verir, gecmezse bos doner", async () => {
  const hat = buyukDaire(IST, EBL, 256);
  const p = await ulkedekiParcalar(hat, "Iraq");
  assert.equal(p.length, 1);
  assert.ok(p[0].length > 2);
  assert.deepEqual(await ulkedekiParcalar(hat, "Japan"), []);
});

test("EK216 izi Iran ve Rusya disindan, Turkiye ve Irak uzerinden gider", async () => {
  const u = await ucusUlkeleri(hatAc(KAYITLI_IZLER["LAX-DXB"].noktalar));
  for (const v of ["Canada", "Turkey", "Iraq"]) assert.ok(u.includes(v), u.join());
  for (const y of ["Iran", "Russia"]) assert.equal(u.includes(y), false, u.join());
});

test("rotaya uzaklik kilometre verir", () => {
  const d = rotayaUzaklikKm([28.74, 42.27], [IST]);
  assert.ok(d > 105 && d < 118, String(d));
});

test("ulke adi buyuk kucuk harften bagimsiz bulunur", async () => {
  assert.equal((await ulkeBul("iraq"))?.properties.name, "Iraq");
  assert.equal(await ulkeBul("Narnia"), undefined);
});

test("kapali hava sahasi kesisimi en ustte gelir, kanitsiz bilgi kesisim sayilmaz", () => {
  assert.equal(durumVer([{ seviye: "teyitli", iliski: "koridorda" }], [{ seviye: "kismen" }]), "hava-sahasi-kesisimi");
  assert.equal(durumVer([{ seviye: "teyitli", iliski: "koridorda" }], []), "koridorda-teyitli");
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
  assert.equal(iliskiVer({ tur: "ulke", km: null, rotaVar: true, havaSahasiRotada: false, ulkeRotada: true }), "konum-genel");
  assert.equal(iliskiVer({ tur: "ulke", km: null, rotaVar: true, havaSahasiRotada: false, ulkeRotada: false }), "bolgesel");
  assert.equal(iliskiVer({ tur: "ulke", km: null, rotaVar: true, havaSahasiRotada: true }), "koridorda");
  assert.equal(iliskiVer({ tur: "nokta", km: null, rotaVar: false, havaSahasiRotada: false }), "ulke-ici");
  assert.equal(iliskiVer({ tur: "nokta", km: 1, rotaVar: true, havaSahasiRotada: false, baskaHat: true }), "bolgesel");
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
  assert.deepEqual(pencereKur("2024-05-06"), { ilk: "2024-04-28", son: "2024-05-06" });
  assert.equal(pencereKur("", Date.parse("2026-11-01T12:00:00Z")).son, "2026-11-01");
});

test("tek noktadaki ya da tek kaynakli kisit ulke hava sahasini kapatmaz", () => {
  const ulke = { havaSahasi: true, iddiaEn: "Iran closed its airspace to all flights.", seviye: "teyitli" as const, ulke: "Iran", konum: { tur: "ulke" } };
  assert.equal(hatKesisirMi(ulke, ["Iran"]), true);
  assert.equal(hatKesisirMi({ ...ulke, konum: { tur: "nokta" } }, ["Iran"]), false);
  assert.equal(hatKesisirMi({ ...ulke, seviye: "tek-kaynak" }, ["Iran"]), false);
  assert.equal(hatKesisirMi(ulke, ["Turkey"]), false);
  assert.equal(hatKesisirMi({ ...ulke, iddiaEn: "A drone strike hit a depot in Iran." }, ["Iran"]), false);
});

test("kapanis cumlesi iddianin kendisinden okunur", () => {
  assert.equal(kapanisMi("Lebanon closed its airspace."), true);
  assert.equal(kapanisMi("Two drones violated airspace over Romania."), false);
  assert.equal(ulkeGeneliKapanis("Lebanon closed its airspace.", "Lebanon"), true);
  assert.equal(ulkeGeneliKapanis("Lebanon's airspace was closed on Sunday.", "Lebanon"), true);
  assert.equal(ulkeGeneliKapanis("Airspace around Iasi was restricted for an hour.", "Romania"), false);
});

test("ulke kapanisi sehir adi yazilsa da ulke duzeyinde kalir", async () => {
  const r = { iddia: "", iddia_en: "Lebanon closed its airspace.", tehlike: "savas", iata: "", yer_adi: "Beirut", ulke: "Lebanon", hava_sahasi: true, suren: false, baska_hat: false, olay_tarihi: "2026-10-01" };
  const k = await konumBul(r);
  assert.equal(k?.tur, "ulke");
  assert.equal(k?.ad, "Lebanon");
});

test("aralik oncesi olay elenir, suren kisit kalir", () => {
  const p = { ilk: "2025-06-12", son: "2025-06-20" };
  assert.equal(pencereIcinde({ olay_tarihi: "2025-06-13" }, p), true);
  assert.equal(pencereIcinde({ olay_tarihi: "2025-06-01" }, p), false);
  assert.equal(pencereIcinde({ olay_tarihi: "2025-06-01", suren: true }, p), true);
  assert.equal(pencereIcinde({ olay_tarihi: "2025-06-21", suren: true }, p), false);
});

test("ulke es adlari sinir verisine baglanir", async () => {
  assert.equal((await ulkeBul("Türkiye"))?.properties.name, "Turkey");
  assert.equal((await ulkeBul("United States"))?.properties.name, "United States of America");
  assert.equal(await ulkeBul("Atlantis"), undefined);
});

test("havalimani aramasi kod, sehir ve Turkce ad bulur", () => {
  const h = (iata: string, icao: string, ad: string, sehir: string, onem: number) => [iata, { iata, icao, ad, sehir, ulke: "", lat: 0, lon: 0, onem }] as const;
  const t = new Map([h("SAW", "LTFJ", "Sabiha Gökçen International Airport", "Istanbul", 3), h("IST", "LTFM", "Istanbul Airport", "Istanbul", 3), h("SVO", "UUEE", "Sheremetyevo International Airport", "Moscow", 3), h("OTH", "XXXX", "Small Field", "Istanbulia", 1)]);
  assert.deepEqual(havalimaniSuz(t, "istanbul").map((x) => x.iata).sort(), ["IST", "OTH", "SAW"]);
  assert.equal(havalimaniSuz(t, "sAw")[0].iata, "SAW");
  assert.equal(havalimaniSuz(t, "moskova")[0].iata, "SVO");
  assert.deepEqual(havalimaniSuz(t, "i"), []);
});

test("havalimani aramasi anahtar kelimeden de bulur", () => {
  const t = new Map([["NRT", { iata: "NRT", icao: "RJAA", ad: "Narita International Airport", sehir: "Narita", ulke: "JP", lat: 0, lon: 0, onem: 3, anahtar: "TYO, Tokyo Narita" }]]);
  assert.equal(havalimaniSuz(t, "tokyo")[0].iata, "NRT");
});
