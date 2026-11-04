import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome" });
const s = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await s.goto("http://127.0.0.1:4173/?dil=en");
await s.waitForTimeout(2000);
await s.click("button:has-text('Current route')");
await s.waitForTimeout(8000);
console.log(await s.evaluate(() => { const x = [...document.querySelectorAll("#ray *")].filter((e) => (e.textContent || "").includes("A3354/26")).sort((a, b) => a.textContent.length - b.textContent.length)[0]; let e = x; const yol = []; for (let i = 0; i < 4 && e; i++, e = e.parentElement) yol.push(e.tagName + "." + e.className); return yol.join(" < ") + "\n" + x.parentElement.parentElement.outerHTML.slice(0, 900); }));
await b.close();
