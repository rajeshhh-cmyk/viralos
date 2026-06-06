// YouTube Data API v3 - All-time most viewed videos

const YT_BASE = "https://www.googleapis.com/youtube/v3";

function getKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY not set");
  return key;
}

export interface YTVideo {
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
  thumbnail: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
  duration: string;
  description: string;
  url: string;
}

export interface YTChannel {
  id: string;
  title: string;
  thumbnail: string;
  subscribers: number;
  videoCount: number;
  viewCount: number;
  description: string;
  url: string;
}

// Search top Shorts by keyword (≤ 180s, sorted by view count)
export async function searchTopVideos(keyword: string, maxResults = 20, period = "all"): Promise<YTVideo[]> {
  const key = getKey();

  const fetchCount = Math.min(maxResults * 2, 50);
  const afterParam = period !== "all" ? `&publishedAfter=${encodeURIComponent(periodToISO(period))}` : "";
  const searchRes = await fetch(
    `${YT_BASE}/search?part=id,snippet&q=${encodeURIComponent(keyword)}&type=video&order=viewCount&videoDuration=short&maxResults=${fetchCount}${afterParam}&key=${key}`
  );
  if (!searchRes.ok) throw new Error(`YouTube search error: ${await searchRes.text()}`);
  const searchData = await searchRes.json();

  const videoIds = searchData.items?.map((i: any) => i.id.videoId).filter(Boolean) || [];
  if (videoIds.length === 0) return [];

  const videos = await getVideoDetails(videoIds);
  // v.duration is "M:SS" format — use durationStringToSeconds not parseDurationSeconds
  return videos.filter(v => durationStringToSeconds(v.duration) <= 180).slice(0, maxResults);
}

// Get channel's top Shorts sorted by real view count.
// Uses YouTube search (scans the full channel history index, not just recent uploads)
// + real stats to verify and sort correctly.
export async function getChannelTopVideos(
  channelInput: string,
  maxResults = 20,
  period = "all"
): Promise<YTVideo[]> {
  const key = getKey();

  // ── 1. Resolve channel ID ─────────────────────────────────────────────
  let channelId = channelInput;

  if (!channelInput.startsWith("UC")) {
    const handle = channelInput.startsWith("@") ? channelInput : `@${channelInput}`;
    // forHandle gives an exact match for @handles
    const r = await fetch(
      `${YT_BASE}/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${key}`
    );
    if (r.ok) {
      const d = await r.json();
      channelId = d.items?.[0]?.id ?? channelInput;
    }
    // fallback: text search
    if (!channelId.startsWith("UC")) {
      const sr = await fetch(
        `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(channelInput.replace("@", ""))}&type=channel&maxResults=1&key=${key}`
      );
      if (sr.ok) {
        const sd = await sr.json();
        channelId = sd.items?.[0]?.id?.channelId ?? channelInput;
      }
    }
  }

  // ── 2. Collect video IDs via search ───────────────────────────────────
  // search.list with channelId + order=viewCount queries the channel's FULL history
  // (it's a search index, not a time-ordered list) — this is the right tool for all-time.
  // Get 4 pages (200 candidates) to have enough to surface true top performers.
  const afterParam = period !== "all"
    ? `&publishedAfter=${encodeURIComponent(periodToISO(period))}`
    : "";

  const videoIds: string[] = [];
  let pageToken: string | undefined;
  for (let p = 0; p < 4; p++) {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const r = await fetch(
      `${YT_BASE}/search?part=id&channelId=${channelId}&type=video&videoDuration=short&order=viewCount&maxResults=50${afterParam}${pageParam}&key=${key}`
    );
    if (!r.ok) break;
    const d = await r.json();
    videoIds.push(...(d.items?.map((i: any) => i.id?.videoId).filter(Boolean) ?? []));
    pageToken = d.nextPageToken;
    if (!pageToken) break;
  }

  if (videoIds.length === 0) return [];

  // ── 3. Fetch real stats for all candidates in parallel ────────────────
  const unique = [...new Set(videoIds)];
  const videos = (await Promise.all(
    Array.from({ length: Math.ceil(unique.length / 50) }, (_, i) =>
      getVideoDetails(unique.slice(i * 50, (i + 1) * 50))
    )
  )).flat();

  // ── 4. Filter to true Shorts (≤180 s), sort by real views ────────────
  const shorts = videos.filter(v => durationStringToSeconds(v.duration) <= 180);
  return (shorts.length > 0 ? shorts : videos)
    .sort((a, b) => b.views - a.views)
    .slice(0, maxResults);
}

// Get video details in bulk
async function getVideoDetails(videoIds: string[]): Promise<YTVideo[]> {
  const key = getKey();
  const ids = videoIds.join(",");
  const res = await fetch(
    `${YT_BASE}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${key}`
  );
  if (!res.ok) throw new Error(`YouTube videos error: ${await res.text()}`);
  const data = await res.json();

  return (data.items || []).map((item: any) => {
    const isoDuration = item.contentDetails?.duration || "";
    const secs = parseDurationSeconds(isoDuration);
    return {
      id: item.id,
      title: item.snippet?.title || "",
      channelTitle: item.snippet?.channelTitle || "",
      channelId: item.snippet?.channelId || "",
      thumbnail: item.snippet?.thumbnails?.maxres?.url || item.snippet?.thumbnails?.high?.url || "",
      views: parseInt(item.statistics?.viewCount || "0"),
      likes: parseInt(item.statistics?.likeCount || "0"),
      comments: parseInt(item.statistics?.commentCount || "0"),
      publishedAt: item.snippet?.publishedAt || "",
      duration: parseDuration(isoDuration),
      description: item.snippet?.description?.slice(0, 300) || "",
      url: secs <= 180
        ? `https://www.youtube.com/shorts/${item.id}`
        : `https://www.youtube.com/watch?v=${item.id}`,
    };
  });
}

// Search top channels by keyword
export async function searchTopChannels(keyword: string, maxResults = 10): Promise<YTChannel[]> {
  const key = getKey();
  const res = await fetch(
    `${YT_BASE}/search?part=id,snippet&q=${encodeURIComponent(keyword)}&type=channel&maxResults=${maxResults}&key=${key}`
  );
  if (!res.ok) throw new Error(`YouTube channel search error: ${await res.text()}`);
  const data = await res.json();

  const channelIds = data.items?.map((i: any) => i.id.channelId).filter(Boolean) || [];
  if (channelIds.length === 0) return [];

  const detailRes = await fetch(
    `${YT_BASE}/channels?part=snippet,statistics&id=${channelIds.join(",")}&key=${key}`
  );
  if (!detailRes.ok) throw new Error("Channel details error");
  const detailData = await detailRes.json();

  return (detailData.items || [])
    .map((item: any) => ({
      id: item.id,
      title: item.snippet?.title || "",
      thumbnail: item.snippet?.thumbnails?.high?.url || "",
      subscribers: parseInt(item.statistics?.subscriberCount || "0"),
      videoCount: parseInt(item.statistics?.videoCount || "0"),
      viewCount: parseInt(item.statistics?.viewCount || "0"),
      description: item.snippet?.description?.slice(0, 200) || "",
      url: `https://www.youtube.com/channel/${item.id}`,
    }))
    .sort((a: YTChannel, b: YTChannel) => b.subscribers - a.subscribers);
}

// Parses ISO 8601 duration (PT1M30S) → seconds — used inside getVideoDetails
function parseDurationSeconds(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0");
}

// Parses formatted duration string ("1:30", "1:02:30") → seconds — used after getVideoDetails
function durationStringToSeconds(dur: string): number {
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function periodToISO(period: string): string {
  const days: Record<string, number> = { "14d": 14, "30d": 30, "6mo": 180, "1y": 365, "2y": 730 };
  return new Date(Date.now() - (days[period] ?? 0) * 86400000).toISOString();
}

function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
