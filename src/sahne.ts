// Porto Alegre sahnesi: pist olcumleri gercek, ucuslar ve yedek meydan plani kurgusal.
// Degerlendirme ve kart metni olcumden kodla kurulur; model yazmaz.
import { UYUM_PAYI } from "./uydu.ts";

type Olcum = { durum: "olculdu" | "bulutlu" | "yontemler-uyusmuyor"; oran?: number; ndwi: number; scl: number; bulut: number };
type Goruntu = { gun: string; sahne: string; cekim: string; isleme: string; gorsel: string; olcum: Olcum };
export type Veri = { meydan: string; senaryoEsik: number; kareMetre: number; ucuslar: { kod: string; hat: string }[]; goruntuler: Goruntu[] };
type Plan = "planda" | "plan-disi";

export type Dil = "tr" | "en";
const YEREL = { tr: "tr-TR", en: "en-GB" };
const sayi = (n: number, d: Dil) => n.toLocaleString(YEREL[d], { maximumFractionDigits: 1 });
const yuzde = (n: number, d: Dil) => (d === "tr" ? `%${sayi(n, d)}` : `${sayi(n, d)}%`);
const fark = (o: Olcum) => Math.round(Math.abs(o.ndwi - o.scl) * 10) / 10;
const gun = (s: string, d: Dil) => new Date(`${s}T00:00:00Z`).toLocaleDateString(YEREL[d], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const saat = (s: string, d: Dil) => `${new Date(s).toLocaleString(YEREL[d], { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

const METIN = {
  tr: {
    yontem: (n: string, c: string, f: string, u: number) => `NDWI ${n}, SCL ${c}; fark ${f} puan, sınır ${u} puan.`,
    bulut: "Pistte bulut sınırı aşıldı",
    uyusmadi: "İki yöntem birbirini tutmadı",
    kanitOk: "ÖLÇÜLDÜ · İKİ YÖNTEM UYUŞTU",
    kanitBulut: "SONUÇ VERİLEMEDİ · BULUT",
    kanitYok: "SONUÇ VERİLEMEDİ · YÖNTEMLER UYUŞMUYOR",
    su: "Su oranı",
    suKucuk: "su oranı",
    yok: "sonuç yok",
    planda: "Porto Alegre yedek meydan planında",
    disi: "Porto Alegre yedek meydan planı dışında",
    ilkYok: "Önceki ölçüm yok. Bu görüntü başlangıç kaydıdır.",
    oranYok: "Oran yazılmadı.",
    kayitYok: "Karşılaştırılacak önceki kayıt yok.",
    degismedi: (b: string) => `Değerlendirme değişmedi. ${b}, bu yüzden kod oran vermedi ve son geçerli ölçüm duruyor.`,
    degisti: (e: string, ustte: boolean) => `Değerlendirme değişti. Yeni görüntüde iki yöntem de aynı sonucu verdi ve oran, senaryo sınırı olan ${e} ${ustte ? "değerini aştı" : "değerinin altına indi"}.`,
    dogruladi: "Değerlendirme değişmedi. Yeni ölçüm öncekini doğruladı.",
    kalir: "Üç uçuşta Porto Alegre yedek meydan olarak kalır.",
    bplan: "Üç uçuş için B planı hazırlansın: yedek meydan, yakıt, yolcu ve otel. Kararı operasyon ekibi verir.",
    acik: "Üç uçuşta B planı açık kalır. Bu görüntüyle plana dönülmez.",
    teyitYok: "Ölçüm plan değişikliği gerektirmiyor; meydanın resmî durumu ayrıca izlenir.",
    teyit: "Meydanın yazılı pist durumu yayını. Uydu bir öngörü verir, pistin kullanılabilirliğini söylemez.",
    kritik: "Kritik teyit: meydanın yazılı pist durumu yayını. Üç uçuşun planını netleştirecek tek bilgi bu.",
    takipYok: "AÇIK TEYİT YOK",
    takip: "TEYİT AÇIK",
  },
  en: {
    yontem: (n: string, c: string, f: string, u: number) => `NDWI ${n}, SCL ${c}; gap ${f} points, limit ${u} points.`,
    bulut: "Cloud over the runway passed the limit",
    uyusmadi: "The two methods disagreed",
    kanitOk: "MEASURED · BOTH METHODS AGREE",
    kanitBulut: "NO RESULT · CLOUD",
    kanitYok: "NO RESULT · METHODS DISAGREE",
    su: "Water share",
    suKucuk: "water share",
    yok: "no result",
    planda: "Porto Alegre is in the alternate plan",
    disi: "Porto Alegre is out of the alternate plan",
    ilkYok: "No earlier measurement. This image is the baseline.",
    oranYok: "No share written.",
    kayitYok: "No earlier record to compare.",
    degismedi: (b: string) => `Assessment unchanged. ${b}, so the code gave no share and the last valid measurement stands.`,
    degisti: (e: string, ustte: boolean) => `Assessment changed. Both methods agree on the new image and the share went ${ustte ? "above" : "below"} the ${e} scenario limit.`,
    dogruladi: "Assessment unchanged. The new measurement confirms the last one.",
    kalir: "Porto Alegre stays as the alternate for the three flights.",
    bplan: "Prepare plan B for the three flights: alternate, fuel, passengers and hotels. The operations team decides.",
    acik: "Plan B stays open for the three flights. This image does not return them to the plan.",
    teyitYok: "The measurement does not call for a plan change; the airport's official status is tracked separately.",
    teyit: "The airport's written runway status notice. Satellite gives an early signal; it cannot say the runway is usable.",
    kritik: "Critical confirmation: the airport's written runway status notice. It is the one item that settles the three flights' plan.",
    takipYok: "NO OPEN CONFIRMATION",
    takip: "CONFIRMATION OPEN",
  },
};

/** Oran yoksa plan degismez: sonuc verilemeyen olcum son gecerli degerlendirmeyi bozmaz. */
export function planBul(onceki: Plan | null, o: Olcum, esik: number): Plan {
  if (o.durum !== "olculdu" || o.oran == null) return onceki ?? "plan-disi";
  return o.oran > esik ? "plan-disi" : "planda";
}

export function sahneKur(v: Veri, d: Dil = "tr") {
  const m = METIN[d];
  let son: { g: Goruntu; plan: Plan } | null = null;
  return v.goruntuler.map((g) => {
    const o = g.olcum;
    const onceki = son;
    const plan = planBul(onceki?.plan ?? null, o, v.senaryoEsik);
    const olculdu = o.durum === "olculdu" && o.oran != null;
    const degisti = onceki != null && onceki.plan !== plan;
    const yontem = m.yontem(yuzde(o.ndwi, d), yuzde(o.scl, d), sayi(fark(o), d), UYUM_PAYI);
    const sebep = o.durum === "bulutlu" ? m.bulut : m.uyusmadi;

    const adim = {
      gun: gun(g.gun, d),
      cekim: saat(g.cekim, d),
      isleme: saat(g.isleme, d),
      sahne: g.sahne,
      gorsel: g.gorsel,
      olcum: { ndwi: o.ndwi, scl: o.scl, fark: fark(o), sinir: UYUM_PAYI, oran: o.oran ?? null },
      kanit: olculdu ? m.kanitOk : o.durum === "bulutlu" ? m.kanitBulut : m.kanitYok,
      sonucYok: !olculdu,
      baslik: `${m.su} ${onceki ? `${yuzde(onceki.g.olcum.oran!, d)} → ` : ""}${olculdu ? yuzde(o.oran!, d) : m.yok}`,
      once: onceki
        ? `${gun(onceki.g.gun, d)}: ${m.suKucuk} ${yuzde(onceki.g.olcum.oran!, d)}, ${onceki.plan === "planda" ? m.planda : m.disi}.`
        : m.ilkYok,
      simdi: olculdu ? `${m.su} ${yuzde(o.oran!, d)}. ${yontem}` : `${m.oranYok} ${yontem}`,
      neden: !onceki ? m.kayitYok : !olculdu ? m.degismedi(sebep) : degisti ? m.degisti(yuzde(v.senaryoEsik, d), plan === "plan-disi") : m.dogruladi,
      plan,
      etki: plan === "planda" ? m.kalir : degisti ? m.bplan : m.acik,
      bekleyen: plan === "planda" ? m.teyitYok : olculdu ? m.teyit : m.kritik,
      takip: plan === "planda" ? m.takipYok : m.takip,
    };
    if (olculdu) son = { g, plan };
    return adim;
  });
}
