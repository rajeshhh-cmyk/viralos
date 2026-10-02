// Video Insights: transcript (TokScript) + reel stats (Apify) for YouTube, Instagram and TikTok.

export type Platform = "youtube" | "instagram" | "tiktok";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface VideoStats {
  title: string;
  author: string;
  authorFollowers: number | null;
  thumbnail: string;
  postedAt: string;
  durationSec: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  // null = the platform does not expose this metric publicly
  shares: number | null;
  saves: number | null;
  engagementRate: number | null;
}

export interface VideoInsight {
  url: string;
  platform: Platform;
  stats: VideoStats;
  transcript: string;
  segments: TranscriptSegment[];
  language: string;
  sources: { stats: "apify" | "tokscript" | "none"; transcript: "tokscript" | "none" };
  errors: string[];
}

export function detectPlatform(url: string): Platform | null {
  if (/(youtube\.com|youtu\.be)\//i.test(url)) return "youtube";
  if (/instagram\.com\//i.test(url)) return "instagram";
  if (/tiktok\.com\//i.test(url)) return "tiktok";
  return null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const first = <T>(...vals: T[]): T | undefined => vals.find((v) => v !== undefined && v !== null && v !== "");

// ---------------------------------------------------------------- TokScript

const TOKSCRIPT_ACTIONS: Record<Platform, string> = {
  youtube: "get_youtube_transcript",
  instagram: "get_instagram_transcript",
  tiktok: "get_tiktok_transcript",
};

interface TokScriptResult {
  transcript: string;
  segments: TranscriptSegment[];
  language: string;
  stats: Partial<VideoStats>;
}

// TokScript's REST API mirrors its MCP actions: POST {TOKSCRIPT_API_URL}/{action}
// with { video_url, format }. Base URL is configurable in case the account's
// endpoint differs.
export async function fetchTokScriptTranscript(url: string, platform: Platform): Promise<TokScriptResult> {
  const key = process.env.TOKSCRIPT_API_KEY;
  if (!key) throw new Error("TOKSCRIPT_API_KEY not set");
  const base = (process.env.TOKSCRIPT_API_URL || "https://api.tokscript.com/v1").replace(/\/$/, "");

  const res = await fetch(`${base}/${TOKSCRIPT_ACTIONS[platform]}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "x-api-key": key,
    },
    body: JSON.stringify({ video_url: url, format: "json" }),
  });
  if (!res.ok) throw new Error(`TokScript error ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = await res.json();
  return parseTokScript(json?.data ?? json?.result ?? json);
}

function parseTokScript(d: any): TokScriptResult {
  const rawSegs: any[] = Array.isArray(d?.segments)
    ? d.segments
    : Array.isArray(d?.transcript)
      ? d.transcript
      : Array.isArray(d?.transcript?.segments)
        ? d.transcript.segments
        : [];

  const segments: TranscriptSegment[] = rawSegs
    .map((s) => ({
      start: num(first(s.start, s.offset, s.startTime)) ?? 0,
      end: num(first(s.end, s.endTime)) ?? (num(first(s.start, s.offset)) ?? 0) + (num(s.duration) ?? 0),
      text: String(first(s.text, s.content, "") ?? "").trim(),
    }))
    .filter((s) => s.text);

  const text =
    typeof d?.transcript === "string"
      ? d.transcript
      : first(d?.text, d?.transcript?.text, d?.full_text) ?? segments.map((s) => s.text).join(" ");

  const eng = d?.engagement ?? d?.stats ?? d?.statistics ?? {};
  const author = d?.author ?? {};
  return {
    transcript: String(text || "").trim(),
    segments,
    language: String(first(d?.language, d?.lang, "") ?? ""),
    stats: {
      title: first(d?.title, d?.description, ""),
      author: typeof author === "string" ? author : first(author.username, author.name, author.uniqueId, ""),
      authorFollowers: num(first(author.followers, author.follower_count, author.followerCount)),
      thumbnail: first(d?.thumbnail, d?.cover, d?.thumbnail_url, ""),
      durationSec: num(d?.duration),
      views: num(first(d?.views, eng.views, eng.plays, eng.play_count)),
      likes: num(first(d?.likes, eng.likes, eng.like_count)),
      comments: num(first(d?.comments, eng.comments, eng.comment_count)),
      shares: num(first(d?.shares, eng.shares, eng.share_count)),
      saves: num(first(d?.saves, eng.saves, eng.collects, eng.collect_count)),
    },
  };
}

// ---------------------------------------------------------------- Apify

function apifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");
  return token;
}

async function runActor(actor: string, input: Record<string, unknown>): Promise<any[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${apifyToken()}&timeout=120`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
  );
  if (!res.ok) throw new Error(`Apify ${actor} error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as any[];
}

function parseDuration(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  // "HH:MM:SS" or "MM:SS"
  if (/^\d+(:\d+)+$/.test(v)) return v.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
  return num(v);
}

async function apifyTikTok(url: string): Promise<Partial<VideoStats>> {
  const [item] = await runActor("clockworks~tiktok-scraper", {
    postURLs: [url],
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
  });
  if (!item) throw new Error("Apify returned no TikTok data");
  return {
    title: item.text || "",
    author: item.authorMeta?.name || "",
    authorFollowers: num(item.authorMeta?.fans),
    thumbnail: item.videoMeta?.coverUrl || "",
    postedAt: item.createTimeISO || "",
    durationSec: num(item.videoMeta?.duration),
    views: num(item.playCount),
    likes: num(item.diggCount),
    comments: num(item.commentCount),
    shares: num(item.shareCount),
    saves: num(item.collectCount),
  };
}

async function apifyInstagram(url: string): Promise<Partial<VideoStats>> {
  const [item] = await runActor("apify~instagram-scraper", {
    directUrls: [url],
    resultsType: "posts",
    resultsLimit: 1,
    addParentData: false,
  });
  if (!item || item.error) throw new Error(`Apify returned no Instagram data${item?.error ? `: ${item.error}` : ""}`);
  return {
    title: item.caption || "",
    author: item.ownerUsername || "",
    thumbnail: item.displayUrl || "",
    postedAt: item.timestamp || "",
    durationSec: num(item.videoDuration),
    views: num(first(item.videoPlayCount, item.videoViewCount)),
    likes: num(item.likesCount),
    comments: num(item.commentsCount),
    // Instagram does not expose shares/saves publicly
  };
}

async function apifyYouTube(url: string): Promise<Partial<VideoStats>> {
  const [item] = await runActor("streamers~youtube-scraper", {
    startUrls: [{ url }],
    maxResults: 1,
    maxResultsShorts: 1,
    maxResultStreams: 0,
  });
  if (!item) throw new Error("Apify returned no YouTube data");
  return {
    title: item.title || "",
    author: item.channelName || "",
    authorFollowers: num(item.numberOfSubscribers),
    thumbnail: item.thumbnailUrl || "",
    postedAt: item.date || "",
    durationSec: parseDuration(item.duration),
    views: num(item.viewCount),
    likes: num(item.likes),
    comments: num(item.commentsCount),
    // YouTube does not expose shares publicly
  };
}

const APIFY_BY_PLATFORM: Record<Platform, (url: string) => Promise<Partial<VideoStats>>> = {
  tiktok: apifyTikTok,
  instagram: apifyInstagram,
  youtube: apifyYouTube,
};

// ---------------------------------------------------------------- Combined

function mergeStats(primary: Partial<VideoStats>, fallback: Partial<VideoStats>): VideoStats {
  const pick = <K extends keyof VideoStats>(k: K) => first(primary[k], fallback[k]);
  const stats: VideoStats = {
    title: (pick("title") as string) || "",
    author: (pick("author") as string) || "",
    authorFollowers: (pick("authorFollowers") as number) ?? null,
    thumbnail: (pick("thumbnail") as string) || "",
    postedAt: (pick("postedAt") as string) || "",
    durationSec: (pick("durationSec") as number) ?? null,
    views: (pick("views") as number) ?? null,
    likes: (pick("likes") as number) ?? null,
    comments: (pick("comments") as number) ?? null,
    shares: (pick("shares") as number) ?? null,
    saves: (pick("saves") as number) ?? null,
    engagementRate: null,
  };
  if (stats.views) {
    const interactions = (stats.likes ?? 0) + (stats.comments ?? 0) + (stats.shares ?? 0) + (stats.saves ?? 0);
    stats.engagementRate = Math.round((interactions / stats.views) * 10000) / 100;
  }
  return stats;
}

export async function getVideoInsight(
  url: string,
  opts: { transcript?: boolean; stats?: boolean } = {}
): Promise<VideoInsight> {
  const platform = detectPlatform(url);
  if (!platform) throw new Error("Unsupported URL — paste a YouTube, Instagram or TikTok link");
  const wantTranscript = opts.transcript !== false;
  const wantStats = opts.stats !== false;

  const [tok, apify] = await Promise.allSettled([
    wantTranscript ? fetchTokScriptTranscript(url, platform) : Promise.reject(new Error("skipped")),
    wantStats ? APIFY_BY_PLATFORM[platform](url) : Promise.reject(new Error("skipped")),
  ]);

  const errors: string[] = [];
  if (wantTranscript && tok.status === "rejected") errors.push(`Transcript: ${tok.reason?.message || tok.reason}`);
  if (wantStats && apify.status === "rejected") errors.push(`Stats: ${apify.reason?.message || apify.reason}`);

  const tokData = tok.status === "fulfilled" ? tok.value : null;
  const apifyData = apify.status === "fulfilled" ? apify.value : null;

  return {
    url,
    platform,
    stats: mergeStats(apifyData ?? {}, tokData?.stats ?? {}),
    transcript: tokData?.transcript ?? "",
    segments: tokData?.segments ?? [],
    language: tokData?.language ?? "",
    sources: {
      stats: apifyData ? "apify" : tokData ? "tokscript" : "none",
      transcript: tokData?.transcript ? "tokscript" : "none",
    },
    errors,
  };
}
