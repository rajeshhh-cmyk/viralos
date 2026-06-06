import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function getKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  return key;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function analyzeVideoWithGemini(youtubeUrl: string, title: string) {
  const key = getKey();

  const prompt = `You are an expert viral content analyst. Watch this YouTube Short and provide a detailed analysis.

Title: "${title}"

Return ONLY valid JSON with no markdown fences, no extra text:
{
  "transcript": "Complete word-for-word transcript of everything spoken in the video",
  "hook": "The exact opening hook — what is said or shown in the first 3-5 seconds",
  "format": "Content format (e.g. Tutorial, Storytime, List, Case Study, Before/After, POV, Tips, etc.)",
  "whyViral": "3-4 sentences explaining why this video performs well — specific reasons",
  "keyTopics": ["topic1", "topic2", "topic3", "topic4", "topic5"],
  "contentFormat": "Structure breakdown: what happens in the intro → middle → end",
  "hookType": "Hook category (e.g. Shock, Question, Controversy, Bold Promise, Story, Statistics, Visual)",
  "cta": "Call to action at the end, or 'None detected'"
}`;

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { fileData: { fileUri: youtubeUrl } },
            { text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      transcript: "",
      hook: "Could not parse",
      format: "Unknown",
      whyViral: raw,
      keyTopics: [] as string[],
      contentFormat: "",
      hookType: "Unknown",
      cta: "Unknown",
    };
  }
}

export async function POST(req: NextRequest) {
  const { url, title } = await req.json();

  try {
    const videoId = extractYouTubeId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    // Gemini accepts both watch and shorts URLs directly
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const result = await analyzeVideoWithGemini(watchUrl, title || "");

    const { transcript = "", ...analysis } = result;
    return NextResponse.json({ transcript, analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
