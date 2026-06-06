import { NextRequest, NextResponse } from "next/server";
import { searchTopVideos, getChannelTopVideos, searchTopChannels } from "@/lib/youtube";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode"); // "keyword" | "channel" | "channels"
  const q = searchParams.get("q") || "";
  const max = parseInt(searchParams.get("max") || "20");
  const period = searchParams.get("period") || "all";

  try {
    if (mode === "keyword") {
      const videos = await searchTopVideos(q, max, period);
      return NextResponse.json({ videos });
    }
    if (mode === "channel") {
      const videos = await getChannelTopVideos(q, max, period);
      return NextResponse.json({ videos });
    }
    if (mode === "channels") {
      const channels = await searchTopChannels(q, max);
      return NextResponse.json({ channels });
    }
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
