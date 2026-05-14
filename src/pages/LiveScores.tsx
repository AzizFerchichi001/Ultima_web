import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "@/components/Layout";
import {
  Radio, Play, Clock, MapPin, Users, RefreshCw, Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import LiveAIStatusBadge from "@/components/smartplay/LiveAIStatusBadge";
import type { LiveSession } from "@/components/smartplay/liveTypes";

const LIVE_STATUSES = ["created", "starting", "running"];

function LiveSessionCard({ session, basePath }: { session: LiveSession; basePath: string }) {
  return (
    <div className="gradient-card rounded-2xl border border-green-500/20 p-5 flex flex-col gap-4 hover:border-green-500/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">
            {session.courtName ?? `Court ${session.courtId}`}
          </p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <MapPin size={10} />
            <span className="truncate">{session.arenaName ?? "Arena"}</span>
          </div>
        </div>
        <LiveAIStatusBadge status={session.status} fps={session.fps} />
      </div>

      {session.players && session.players.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users size={11} className="shrink-0" />
          <span className="truncate">{session.players.map((p) => p.name).join(" · ")}</span>
        </div>
      )}

      <Button
        asChild
        size="sm"
        variant="outline"
        className="w-full gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-300 border-green-500/20"
      >
        <Link to={`${basePath}/${session.id}`}>
          <Play size={12} fill="currentColor" /> Watch Live
        </Link>
      </Button>
    </div>
  );
}

function RecentSessionRow({ session, basePath }: { session: LiveSession; basePath: string }) {
  return (
    <div className="gradient-card rounded-xl border border-border/40 px-4 py-3 flex items-center gap-4 hover:border-border/60 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {session.courtName ?? `Court ${session.courtId}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {session.arenaName ?? "Arena"} · session #{session.id}
        </p>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/50 shrink-0">
        Ended
      </span>
      <Button asChild size="sm" variant="ghost" className="shrink-0">
        <Link to={`${basePath}/${session.id}`}>Review</Link>
      </Button>
    </div>
  );
}

const LiveScores = () => {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const location = useLocation();
  const liveBasePath = location.pathname.startsWith("/player") ? "/player/live" : "/live-sessions";

  const load = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const result = await api<{ sessions: LiveSession[] }>("/api/live-sessions", { authenticated: true });
      setSessions(result.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const liveNow = sessions.filter((s) => LIVE_STATUSES.includes(s.status));
  const recent = sessions.filter((s) => s.status === "stopped").slice(0, 6);

  return (
    <Layout>
      <div className="container py-8 lg:py-12 space-y-10">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
                <Radio size={22} className="text-green-400" />
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tighter">
                Live <span className="text-gradient">Sessions</span>
              </h1>
            </div>
            <p className="text-muted-foreground text-sm ml-14">
              Watch live court streams and AI-powered match analysis
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="shrink-0"
          >
            {refreshing
              ? <Loader2 size={14} className="animate-spin mr-2" />
              : <RefreshCw size={14} className="mr-2" />}
            Refresh
          </Button>
        </div>

        {/* Live Now */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-widest text-green-400">
              Live Now{!loading && liveNow.length > 0 && ` · ${liveNow.length}`}
            </h2>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
            </div>
          ) : liveNow.length === 0 ? (
            <div className="gradient-card rounded-2xl border border-border/40 p-12 text-center">
              <div className="p-4 rounded-2xl bg-green-500/5 border border-green-500/10 w-fit mx-auto mb-4">
                <Radio size={32} className="text-green-500/30" />
              </div>
              <p className="font-medium text-sm text-muted-foreground">No live sessions right now</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Check back when a match starts — you'll be notified</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveNow.map((session) => (
                <LiveSessionCard key={session.id} session={session} basePath={liveBasePath} />
              ))}
            </div>
          )}
        </section>

        {/* Recent Sessions */}
        {!loading && recent.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <Clock size={13} /> Recent Sessions
            </h2>
            <div className="space-y-2">
              {recent.map((session) => (
                <RecentSessionRow key={session.id} session={session} basePath={liveBasePath} />
              ))}
            </div>
          </section>
        )}

        {/* Empty history */}
        {!loading && liveNow.length === 0 && recent.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">No past sessions found for your account.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default LiveScores;
