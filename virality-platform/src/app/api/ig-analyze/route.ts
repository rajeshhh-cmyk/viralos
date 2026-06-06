import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Try to get real audio transcript via Apify's reel scraper (includeTranscript feature)
async function fetchReelTranscript(reelUrl: string): Promise<string> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return "";
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-reel-scraper/run-sync-get-dataset-items?token=${token}&timeout=60`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: [reelUrl],
          resultsLimit: 1,
          includeTranscript: true,
        }),
      }
    );
    if (!res.ok) return "";
    const data = await res.json();
    return data[0]?.transcript || "";
  } catch {
    return "";
  }
}

async function analyzeWithGemini(params: {
  caption: string; plays: number; likes: number;
  comments: number; username: string; transcript: string;
}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const hasTranscript = params.transcript.length > 20;

  const prompt = `You are an expert viral short-form content analyst. Analyze this Instagram Reel.

Creator: @${params.username}
Plays: ${params.plays.toLocaleString()} | Likes: ${params.likes.toLocaleString()} | Comments: ${params.comments.toLocaleString()}
Caption: "${params.caption}"
${hasTranscript ? `\nAudio Transcript:\n"""\n${params.transcript.slice(0, 5000)}\n"""` : "\n(No transcript available — analyze from caption and metrics only)"}

Respond ONLY in this exact JSON format (no markdown, no backticks):
{
  "hook": "The opening hook (first 3-5 seconds)",
  "format": "Reel format (e.g., Tutorial, Storytime, Trend, Before/After, POV, Tips List, etc.)",
  "whyViral": "3-4 sentences on why this reel likely went viral",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "contentFormat": "Structure breakdown: opening → middle → end",
  "hookType": "Hook type (e.g., Shock, Question, Visual, Story, Trend, Statistics, Controversy)",
  "cta": "Call to action at the end (or 'None detected')"
}`;

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return {
      hook: "Could not parse", format: "Unknown", whyViral: text,
      keyTopics: [], contentFormat: "", hookType: "Unknown", cta: "Unknown",
    };
  }
}

export async function POST(req: NextRequest) {
  const { url, caption, plays, likes, comments, username } = await req.json();

  try {
    const transcript = await fetchReelTranscript(url);
    const analysis = await analyzeWithGemini({ caption, plays, likes, comments, username, transcript });
    return NextResponse.json({ transcript, analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
