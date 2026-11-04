// Montaj: seg/NN.mp4 (cek.mjs) + anlatim (ses/NN-h.wav, sahne icinde 'basla' saniyesinden) + operator sorusu (soru.pcm, mikrofon anina gore)
// + alt yazi (SRT, metin kendi senaryomuz) -> C:/tmp/sezvideo/sez-demo.mp4
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const K = "C:/tmp/sezvideo";
mkdirSync(`${K}/seg`, { recursive: true });
const sahneler = JSON.parse(readFileSync(new URL("./sahneler.json", import.meta.url), "utf8"));
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { cwd: K });
const SORU_METIN = "How is the Singapore to Bali route for the twentieth of June, 2025?";
// soru.wav basinda 1,2 sn sessizlik var (sahte mikrofon); getUserMedia acilisi ~0,25 sn.
const SORU_GECIKME = 1.2 + 0.25;
const soruSure = readFileSync(`${K}/soru.pcm`).length / 48000;

const zaman = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000) % 1000; const p = (n, k = 2) => String(n).padStart(k, "0"); return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`; };
let srt = "", n = 1, bas = 0;
const cue = (t1, t2, metin) => { srt += `${n++}\n${zaman(t1)} --> ${zaman(t2)}\n${metin}\n\n`; };

for (const s of sahneler) {
  const seg = JSON.parse(readFileSync(`${K}/seg/${s.id}.json`, "utf8"));
  const sesSure = JSON.parse(readFileSync(`${K}/alt/${s.id}.json`, "utf8")).sure;
  const anlatimBas = s.basla ?? 0;
  const girdiler = ["-f", "lavfi", "-t", String(seg.sure), "-i", "anullsrc=r=48000:cl=stereo", "-i", `ses/${s.id}-h.wav`];
  let filtre = `[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(anlatimBas * 1000)}:all=1[a1]`, karis = "[0:a][a1]", say = 2;
  if (s.soru && seg.mikT != null) {
    const t = seg.mikT + SORU_GECIKME;
    girdiler.push("-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "soru.pcm");
    filtre += `;[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.9,adelay=${Math.round(t * 1000)}:all=1[a2]`;
    karis += "[a2]"; say = 3;
    cue(bas + t, bas + t + soruSure - 0.05, `Operator: “${SORU_METIN}”`);
  }
  filtre += `;${karis}amix=inputs=${say}:normalize=0:duration=first[c]`;
  ff(...girdiler, "-filter_complex", filtre, "-map", "[c]", "-t", String(seg.sure), "-ar", "48000", "-ac", "2", `seg/${s.id}.wav`);

  // Alt yazi: anlatim cumlelere (uzunsa virgullere) bolunur, sure harf sayisiyla orantili.
  const parcalar = [];
  for (const c of s.ses.split(/(?<=[.:?!])\s+/)) {
    if (c.length <= 80) { parcalar.push(c); continue; }
    let cur = "";
    for (const x of c.split(/(?<=,)\s+/)) { if ((cur + " " + x).trim().length > 80 && cur) { parcalar.push(cur.trim()); cur = x; } else cur = (cur + " " + x).trim(); }
    if (cur) parcalar.push(cur);
  }
  const toplam = parcalar.reduce((a, c) => a + c.length, 0);
  let t = bas + anlatimBas;
  for (const c of parcalar) { const d = sesSure * c.length / toplam; cue(t, t + d - 0.05, c); t += d; }
  bas += seg.sure;
}
writeFileSync(`${K}/alt.srt`, srt);
writeFileSync(`${K}/seg/v.txt`, sahneler.map((s) => `file '${K}/seg/${s.id}.mp4'`).join("\n"));
writeFileSync(`${K}/seg/a.txt`, sahneler.map((s) => `file '${K}/seg/${s.id}.wav'`).join("\n"));

ff("-f", "concat", "-safe", "0", "-i", `${K}/seg/v.txt`, "-f", "concat", "-safe", "0", "-i", `${K}/seg/a.txt`,
  "-vf", "subtitles=alt.srt:original_size=1920x1080:force_style='Fontname=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&HA0000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=28,Alignment=2'",
  "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
  "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-shortest", "sez-demo.mp4");
const sn = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:format=size", "-of", "csv=p=0", `${K}/sez-demo.mp4`]).toString().trim();
console.log("sez-demo.mp4 sure,boyut:", sn, "| toplam sahne:", bas.toFixed(1));
