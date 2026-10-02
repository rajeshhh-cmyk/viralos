import { NextRequest, NextResponse } from "next/server";
import { getVideoInsight, type VideoInsight } from "@/lib/video-insights";

export const maxDuration = 300;

const MAX_URLS = 10;
const CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  const { urls, transcript = true, stats = true } = await req.json();

  const list: string[] = (Array.isArray(urls) ? urls : [urls])
    .map((u: unknown) => String(u || "").trim())
    .filter(Boolean);
  if (list.length === 0) return NextResponse.json({ error: "No URLs provided" }, { status: 400 });
  if (list.length > MAX_URLS) {
    return NextResponse.json({ error: `Max ${MAX_URLS} URLs per request` }, { status: 400 });
  }

  const results: (VideoInsight | { url: string; error: string })[] = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      try {
        results[i] = await getVideoInsight(list[i], { transcript, stats });
      } catch (err: any) {
        results[i] = { url: list[i], error: err.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

  return NextResponse.json({ results });
}
