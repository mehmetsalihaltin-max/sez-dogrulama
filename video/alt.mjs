// Seslendirmeyi 1.1 kat hizlandirir, her sahneyi Muse Voice Transcribe ile yaziya dokup /c/tmp/sezvideo/alt/NN.json'a yazar.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SES = "C:/tmp/sezvideo/ses", ALT = "C:/tmp/sezvideo/alt";
mkdirSync(ALT, { recursive: true });
const sahneler = JSON.parse(readFileSync(new URL("./sahneler.json", import.meta.url), "utf8"));
const anahtar = process.env.MODEL_API_KEY;
const sadece = process.argv[2] ? process.argv[2].split(",") : null;

for (const s of sahneler) {
  if (sadece && !sadece.includes(s.id)) continue;
  const hizli = `${SES}/${s.id}-h.wav`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${SES}/${s.id}.wav`, "-filter:a", `atempo=${process.env.TEMPO ?? 1.1}`, "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", hizli]);
  const sure = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", hizli]).toString().trim());
  const f = new FormData();
  f.append("request", new Blob([JSON.stringify({ mode: "ENDPOINTING", model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", language: "en" })], { type: "application/json" }));
  f.append("audio", new Blob([readFileSync(hizli)], { type: "audio/wav" }), `${s.id}.wav`);
  const r = await fetch(`https://api.meta.ai/v1/asr/transcribe?sessionId=sez-${s.id}`, { method: "POST", headers: { Authorization: `Bearer ${anahtar}` }, body: f });
  const metin = await r.text();
  writeFileSync(`${ALT}/${s.id}.json`, JSON.stringify({ sure, durum: r.status, govde: metin.slice(0, 20000) }));
  console.log(s.id, r.status, sure.toFixed(1), metin.slice(0, 220).replace(/\s+/g, " "));
}
