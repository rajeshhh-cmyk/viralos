import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

// Hits Apify directly and returns the raw response so we can inspect field names.
// Usage: GET /api/ig-debug?q=health&limit=5
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tag = (searchParams.get("q") || "health").trim().split(/\s+/)[0].toLowerCase();
  const limit = parseInt(searchParams.get("limit") || "5");
  const token = process.env.APIFY_API_TOKEN;

  if (!token) return NextResponse.json({ error: "APIFY_API_TOKEN not set" }, { status: 500 });

  const body = {
    hashtag: tag,
    resultsLimit: limit,
    timeoutSecs: 120,
  };

  const res = await fetch(
    `https://api.apify.com/v2/acts/clockworks~instagram-hashtag-posts-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ apifyStatus: res.status, error: text });
  }

  const data = await res.json() as any[];
  // Return a summary of what fields/types came back
  const summary = data.map(item => ({
    type: item.type,
    isVideo: item.isVideo,
    hasVideoUrl: !!item.videoUrl,
    videoPlayCount: item.videoPlayCount,
    videoViewCount: item.videoViewCount,
    playCount: item.playCount,
    viewCount: item.viewCount,
    views: item.views,
    likesCount: item.likesCount,
    commentsCount: item.commentsCount,
    shortCode: item.shortCode,
    url: item.url,
    displayUrl: item.displayUrl ? "(present)" : null,
    thumbnailUrl: item.thumbnailUrl ? "(present)" : null,
    ownerUsername: item.ownerUsername,
  }));
  return NextResponse.json({ total: data.length, summary });
}
