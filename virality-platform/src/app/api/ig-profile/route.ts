import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const token = process.env.APIFY_API_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_API_TOKEN not set" }, { status: 500 });

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${username}/reels/`],
          resultsType: "posts",
          resultsLimit: 500,
          isUserReelFeedURL: true,
          addParentData: false,
          timeoutSecs: 180,
        }),
      }
    );

    if (!res.ok) throw new Error(`Apify error ${res.status}: ${await res.text()}`);

    const data = await res.json() as any[];

    const reels = data
      .filter((item: any) => !!item.videoUrl)
      .sort((a: any, b: any) => (b.videoPlayCount || 0) - (a.videoPlayCount || 0))
      .slice(0, limit)
      .map((item: any, i: number) => ({
        rank: i + 1,
        url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : ""),
        videoUrl: item.videoUrl,
        thumbnail: item.displayUrl || item.thumbnailUrl,
        caption: item.caption || "",
        views: item.videoPlayCount || 0,
        likes: item.likesCount || 0,
        comments: item.commentsCount || 0,
        timestamp: item.timestamp,
        shortCode: item.shortCode,
      }));

    console.log(`[ig-profile] @${username} → ${data.length} total, ${reels.length} reels`);
    return NextResponse.json({ reels, total: data.length });
  } catch (err: any) {
    console.error("[ig-profile] error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
