// Porto Alegre sahnesi: pist olcumleri gercek, ucuslar ve yedek meydan plani kurgusal.
// Degerlendirme ve kart metni olcumden kodla kurulur; model yazmaz.
import { UYUM_PAYI } from "./uydu.ts";

type Olcum = { durum: "olculdu" | "bulutlu" | "yontemler-uyusmuyor"; oran?: number; ndwi: number; scl: number; bulut: number };
type Goruntu = { gun: string; sahne: string; cekim: string; isleme: string; gorsel: string; olcum: Olcum };
export type Veri = { meydan: string; senaryoEsik: number; kareMetre: number; ucuslar: { kod: string; hat: string }[]; goruntuler: Goruntu[] };
type Plan = "planda" | "plan-disi";

const sayi = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const yuzde = (n: number) => `%${sayi(n)}`;
const fark = (o: Olcum) => Math.round(Math.abs(o.ndwi - o.scl) * 10) / 10;
const gun = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const saat = (s: string) => `${new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

/** Oran yoksa plan degismez: sonuc verilemeyen olcum son gecerli degerlendirmeyi bozmaz. */
export function planBul(onceki: Plan | null, o: Olcum, esik: number): Plan {
  if (o.durum !== "olculdu" || o.oran == null) return onceki ?? "plan-disi";
  return o.oran > esik ? "plan-disi" : "planda";
}

export function sahneKur(v: Veri) {
  let son: { g: Goruntu; plan: Plan } | null = null;
  return v.goruntuler.map((g) => {
    const o = g.olcum;
    const onceki = son;
    const plan = planBul(onceki?.plan ?? null, o, v.senaryoEsik);
    const olculdu = o.durum === "olculdu" && o.oran != null;
    const degisti = onceki != null && onceki.plan !== plan;
    const yontem = `NDWI ${yuzde(o.ndwi)}, SCL ${yuzde(o.scl)}; fark ${sayi(fark(o))} puan, sınır ${UYUM_PAYI} puan.`;
    const sebep = o.durum === "bulutlu" ? "Pistte bulut sınırı aşıldı" : "İki yöntem birbirini tutmadı";

    const adim = {
      gun: gun(g.gun),
      cekim: saat(g.cekim),
      isleme: saat(g.isleme),
      sahne: g.sahne,
      gorsel: g.gorsel,
      olcum: { ndwi: o.ndwi, scl: o.scl, fark: fark(o), sinir: UYUM_PAYI, oran: o.oran ?? null },
      kanit: olculdu ? "ÖLÇÜLDÜ · İKİ YÖNTEM UYUŞTU" : o.durum === "bulutlu" ? "SONUÇ VERİLEMEDİ · BULUT" : "SONUÇ VERİLEMEDİ · YÖNTEMLER UYUŞMUYOR",
      sonucYok: !olculdu,
      baslik: `Su oranı ${onceki ? `${yuzde(onceki.g.olcum.oran!)} → ` : ""}${olculdu ? yuzde(o.oran!) : "sonuç yok"}`,
      once: onceki
        ? `${gun(onceki.g.gun)}: su oranı ${yuzde(onceki.g.olcum.oran!)}, ${onceki.plan === "planda" ? "Porto Alegre yedek meydan planında" : "Porto Alegre yedek meydan planı dışında"}.`
        : "Önceki ölçüm yok. Bu görüntü başlangıç kaydıdır.",
      simdi: olculdu ? `Su oranı ${yuzde(o.oran!)}. ${yontem}` : `Oran yazılmadı. ${yontem}`,
      neden: !onceki
        ? "Karşılaştırılacak önceki kayıt yok."
        : !olculdu
          ? `Değerlendirme değişmedi. ${sebep}, bu yüzden kod oran vermedi ve son geçerli ölçüm duruyor.`
          : degisti
            ? `Değerlendirme değişti. Yeni görüntüde iki yöntem de aynı sonucu verdi ve oran, senaryo sınırı olan ${yuzde(v.senaryoEsik)} ${plan === "plan-disi" ? "değerini aştı" : "değerinin altına indi"}.`
            : "Değerlendirme değişmedi. Yeni ölçüm öncekini doğruladı.",
      plan,
      etki: plan === "planda"
        ? "Üç uçuşta Porto Alegre yedek meydan olarak kalır."
        : degisti
          ? "Üç uçuşta yedek meydan yeniden seçilmeli. Kararı operasyon ekibi verir."
          : "Üç uçuşta Porto Alegre plan dışı kalır. Bu görüntüyle plana dönülmez.",
      bekleyen: plan === "planda"
        ? "Bekleyen teyit yok."
        : olculdu
          ? "Havalimanının resmî pist durumu bildirimi. Uydu suyu gösterir, pistin kullanılabilirliğini söylemez."
          : "Kritik teyit: havalimanının güncel pist durumu bildirimi. Üç uçuşun yedek planını açabilecek tek bilgi bu.",
      takip: plan === "planda" ? "AÇIK TEYİT YOK" : "TEYİT AÇIK",
    };
    if (olculdu) son = { g, plan };
    return adim;
  });
}
