"use client";

import { useState } from "react";
import {
  ScanText, Loader2, Copy, Check, Download, Eye, Heart, MessageCircle, Share2, Bookmark,
  ExternalLink, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { VideoInsight } from "@/lib/video-insights";

type Result = VideoInsight | { url: string; error: string };

const PLATFORM_STYLE: Record<string, string> = {
  youtube: "bg-red-500/15 text-red-300 border-red-500/30",
  instagram: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  tiktok: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
};

const fmt = (n: number | null) =>
  n === null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function VideoInsightsPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");

  const urls = input.split(/[\s,]+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));

  const run = async () => {
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = await fetch("/api/video-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResults(data.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const ok = results.filter((r): r is VideoInsight => "platform" in r);
    const header = ["url", "platform", "author", "title", "posted", "views", "likes", "comments", "shares", "saves", "engagement_rate_%", "transcript"];
    const rows = ok.map((r) => [
      r.url, r.platform, r.stats.author, r.stats.title, r.stats.postedAt, r.stats.views, r.stats.likes,
      r.stats.comments, r.stats.shares, r.stats.saves, r.stats.engagementRate, r.transcript,
    ].map(csvCell).join(","));
    download("video-insights.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600">
            <ScanText className="h-5 w-5 text-white" />
          </span>
          Video Insights
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Transcripts (TokScript) + views, likes, comments, shares (Apify) for YouTube, Instagram &amp; TikTok
        </p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <label className="text-xs text-muted-foreground block">Video URLs — one per line (max 10)</label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"https://www.instagram.com/reel/...\nhttps://www.tiktok.com/@user/video/...\nhttps://www.youtube.com/shorts/..."}
          className="rounded-xl glass border-white/[0.08] min-h-28 text-sm font-mono"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={loading || urls.length === 0 || urls.length > 10}
            className="h-11 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 border-0 font-semibold gap-2">
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching {urls.length} video{urls.length === 1 ? "" : "s"}...</>
              : <><ScanText className="h-4 w-4" /> Get Insights</>}
          </Button>
          {results.length > 0 && (
            <Button variant="ghost" onClick={exportCsv} className="h-11 rounded-xl glass border-white/[0.08] text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {urls.length > 10 ? "Too many URLs — max 10" : `${urls.length} URL${urls.length === 1 ? "" : "s"} detected`}
          </span>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="space-y-4">
        {results.map((r, i) => <ResultCard key={`${r.url}-${i}`} result={r} />)}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: Result }) {
  const [copied, setCopied] = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  if (!("platform" in result)) {
    return (
      <div className="glass rounded-2xl p-5 border border-red-500/20">
        <p className="text-xs text-muted-foreground break-all">{result.url}</p>
        <p className="text-sm text-red-400 mt-1">{result.error}</p>
      </div>
    );
  }

  const { stats, transcript, segments, platform } = result;
  const metrics = [
    { icon: Eye, label: "Views", value: stats.views },
    { icon: Heart, label: "Likes", value: stats.likes },
    { icon: MessageCircle, label: "Comments", value: stats.comments },
    { icon: Share2, label: "Shares", value: stats.shares },
    { icon: Bookmark, label: "Saves", value: stats.saves },
  ];

  const copy = () => {
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass rounded-2xl p-5 border border-white/[0.06] space-y-4">
      <div className="flex gap-4">
        {stats.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/proxy-image?url=${encodeURIComponent(stats.thumbnail)}`} alt=""
            className="h-28 w-20 rounded-xl object-cover shrink-0 bg-white/[0.04]" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] uppercase ${PLATFORM_STYLE[platform]}`}>{platform}</Badge>
            {stats.author && <span className="text-sm font-semibold">@{stats.author}</span>}
            {stats.authorFollowers !== null && (
              <span className="text-xs text-muted-foreground">{fmt(stats.authorFollowers)} followers</span>
            )}
            <a href={result.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {stats.title && <p className="text-sm text-muted-foreground line-clamp-2">{stats.title}</p>}
          <p className="text-[11px] text-muted-foreground/70">
            {stats.postedAt && new Date(stats.postedAt).toLocaleDateString()}
            {stats.durationSec !== null && ` • ${fmtTime(stats.durationSec)}`}
            {` • stats via ${result.sources.stats}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {metrics.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"
            title={value === null ? `${label} not publicly available on ${platform}` : undefined}>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
              <Icon className="h-3 w-3" /> {label}
            </div>
            <p className="text-lg font-bold mt-0.5">{fmt(value)}</p>
          </div>
        ))}
        <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3">
          <div className="text-[10px] text-sky-300 uppercase tracking-wider">Engagement</div>
          <p className="text-lg font-bold mt-0.5">{stats.engagementRate === null ? "—" : `${stats.engagementRate}%`}</p>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="flex gap-2 text-xs text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5 break-all">{result.errors.map((e) => <p key={e}>{e}</p>)}</div>
        </div>
      )}

      {transcript && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Transcript {result.language && <span className="normal-case">({result.language})</span>}
            </p>
            <div className="flex gap-2">
              {segments.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowSegments(!showSegments)}
                  className="rounded-xl glass border-white/[0.08] text-xs h-8 gap-1.5">
                  {showSegments ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Timestamps
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={copy} className="rounded-xl glass border-white/[0.08] text-xs h-8 gap-1.5">
                {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />} Copy
              </Button>
              <Button variant="ghost" size="sm"
                onClick={() => download(`transcript-${stats.author || platform}.txt`, transcript, "text/plain")}
                className="rounded-xl glass border-white/[0.08] text-xs h-8 gap-1.5">
                <Download className="h-3 w-3" /> .txt
              </Button>
            </div>
          </div>
          {showSegments ? (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 max-h-80 overflow-y-auto space-y-1">
              {segments.map((s, i) => (
                <p key={i} className="text-sm leading-relaxed">
                  <span className="text-sky-300/80 font-mono text-xs mr-2">{fmtTime(s.start)}</span>{s.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
              {transcript}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
