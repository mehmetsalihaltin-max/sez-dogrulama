// Seslendirme: her sahne icin Gemini TTS -> /c/tmp/sezvideo/ses/NN.wav (24 kHz, mono). Metinler sahneler.json'dan.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const KLASOR = "C:/tmp/sezvideo/ses";
mkdirSync(KLASOR, { recursive: true });
const sahneler = JSON.parse(readFileSync(new URL("./sahneler.json", import.meta.url), "utf8"));
const anahtar = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-pro-preview-tts";
const SES = process.env.SES_ADI ?? "Charon";
const sadece = process.argv[2] ? process.argv[2].split(",") : null;

for (const s of sahneler) {
  if (sadece && !sadece.includes(s.id)) continue;
  const govde = {
    contents: [{ parts: [{ text: `Read the following aloud in a calm, clear, documentary tone, at a natural, brisk, confident pace, without long pauses:\n\n${s.ses}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SES } } } },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": anahtar }, body: JSON.stringify(govde),
  });
  const j = await r.json();
  const b64 = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) { console.log(s.id, "HATA", r.status, JSON.stringify(j).slice(0, 300)); continue; }
  const pcm = `${KLASOR}/${s.id}.pcm`;
  writeFileSync(pcm, Buffer.from(b64, "base64"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", pcm, `${KLASOR}/${s.id}.wav`]);
  const sure = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${KLASOR}/${s.id}.wav`]).toString().trim();
  console.log(s.id, sure, "sn");
}
