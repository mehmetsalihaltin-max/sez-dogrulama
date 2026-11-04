// Videodaki operatorun sesli sorusu (Gemini TTS, anlaticidan farkli ses) -> C:/tmp/sezvideo/soru.wav (48 kHz, Chrome sahte mikrofonu icin)
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const METIN = "How is the Singapore to Bali route for the twentieth of June, 2025?";
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent", {
  method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
  body: JSON.stringify({ contents: [{ parts: [{ text: `Say this as an airline operations officer asking a colleague, natural and clear:\n\n${METIN}` }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } } }),
});
const j = await r.json();
const b64 = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
if (!b64) throw new Error(JSON.stringify(j).slice(0, 300));
writeFileSync("C:/tmp/sezvideo/soru.pcm", Buffer.from(b64, "base64"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "C:/tmp/sezvideo/soru.pcm", "-af", "apad=pad_dur=1.5", "-ar", "48000", "-ac", "1", "C:/tmp/sezvideo/soru.wav"]);
console.log(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "C:/tmp/sezvideo/soru.wav"]).toString().trim(), "sn");
