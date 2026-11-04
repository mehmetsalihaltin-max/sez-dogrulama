// Sesli soru uctan uca denemesi: sahte mikrofon = soru.wav, gercek Muse Voice Transcribe cagrisi.
import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=C:/tmp/sezvideo/soru.wav", "--ignore-gpu-blocklist"] });
const s = await b.newPage({ viewport: { width: 1920, height: 1080 } });
s.on("console", (m) => { if (m.type() === "error") console.log("konsol:", m.text().slice(0, 160)); });
s.on("response", async (r) => { if (r.url().includes("/api/ses")) console.log("api/ses", r.status(), (await r.text()).slice(0, 200)); });
await s.route("**/api/sor**", (r) => (new URL(r.request().url()).searchParams.get("k") ?? "").startsWith("Singapur") ? r.continue() : r.abort());
await s.goto("http://127.0.0.1:4173/?dil=en&bos=1");
await s.waitForTimeout(3000);
await s.click("#ses");
await s.waitForTimeout(400);
console.log("kayitta:", await s.getAttribute("#ses", "aria-pressed"));
await s.waitForTimeout(7000);
await s.click("#ses");
await s.waitForTimeout(6000);
console.log("duyulan:", await s.textContent("#duyulan"));
console.log("alanlar:", await s.inputValue("#nereden"), "|", await s.inputValue("#nereye"), "|", await s.inputValue("#tarih"));
await s.screenshot({ path: "C:/tmp/sezvideo/ses-dene.png" });
await b.close();
