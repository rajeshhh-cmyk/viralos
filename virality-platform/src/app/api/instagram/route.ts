import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const period = searchParams.get("period") || "all";

  if (!q.trim()) return NextResponse.json({ error: "Query required" }, { status: 400 });

  const token = process.env.APIFY_API_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_API_TOKEN not set" }, { status: 500 });

  const tag = q.trim().split(/\s+/)[0].toLowerCase();

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/clockworks~instagram-hashtag-posts-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hashtag: tag,
          resultsLimit: 200,
          timeoutSecs: 120,
        }),
      }
    );
    if (!res.ok) throw new Error(`Apify error ${res.status}: ${await res.text()}`);

    const data = await res.json() as any[];

    const videos = data
      .filter((item) => item.videoUrl)
      .sort((a, b) => (b.videoPlayCount || 0) - (a.videoPlayCount || 0))
      .slice(0, 20)
      .map((item) => ({
        url: item.url,
        videoUrl: item.videoUrl,
        thumbnail: item.displayUrl,
        creator: item.ownerUsername,
        views: item.videoPlayCount,
        likes: item.likesCount || 0,
        comments: item.commentsCount || 0,
        caption: item.caption || "",
        timestamp: item.timestamp,
      }));

    if (videos.length === 0) {
      return NextResponse.json({ videos: [], message: "No viral videos found for this keyword. Try a broader keyword." });
    }

    console.log(`[instagram] q=${q} period=${period} → ${videos.length} results`);
    return NextResponse.json({ videos });
  } catch (err: any) {
    console.error("[instagram] error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
