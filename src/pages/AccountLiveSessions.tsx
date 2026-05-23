import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, Loader2, Play, Radio, RefreshCw } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useLocale } from "@/i18n/locale";
import LiveAIStatusBadge from "@/components/smartplay/LiveAIStatusBadge";
import type { LiveSession } from "@/components/smartplay/liveTypes";

const LIVE_STATUSES = ["created", "starting", "running"];

export default function AccountLiveSessions() {
  const { t } = useLocale();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const recent = sessions.filter((s) => s.status === "stopped").slice(0, 8);

  return (
    <Layout>
      <div className="container py-8 space-y-6">
        <Link
          to="/account"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> {t("account.back")}
        </Link>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("account.title")}</p>
            <h1 className="mt-1.5 font-display text-2xl font-bold">{t("account.live.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("account.live.subtitle")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="gap-2 shrink-0"
          >
            {refreshing
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
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
              {t("account.live.liveNow")}{!loading && liveNow.length > 0 && ` · ${liveNow.length}`}
            </h2>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
            </div>
          ) : liveNow.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <Radio size={36} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-semibold text-sm text-muted-foreground">{t("account.live.empty")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{t("account.live.emptyHint")}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveNow.map((session) => (
                <div
                  key={session.id}
                  className="rounded-2xl border border-green-500/20 bg-card p-5 flex flex-col gap-4 hover:border-green-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{session.courtName ?? `Court ${session.courtId}`}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{session.arenaName ?? "Arena"}</p>
                    </div>
                    <LiveAIStatusBadge status={session.status} fps={session.fps} />
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="w-full gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-300 border-green-500/20"
                  >
                    <Link to={`/player/live/${session.id}`}>
                      <Play size={12} fill="currentColor" /> Watch Live
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent */}
        {!loading && recent.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <Clock size={13} /> {t("account.live.recent")}
            </h2>
            <div className="space-y-2">
              {recent.map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl border border-border/40 bg-card px-4 py-3 flex items-center gap-4 hover:border-border/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{session.courtName ?? `Court ${session.courtId}`}</p>
                    <p className="text-xs text-muted-foreground">{session.arenaName ?? "Arena"} · #{session.id}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/50 shrink-0">
                    Ended
                  </span>
                  <Button asChild size="sm" variant="ghost" className="shrink-0">
                    <Link to={`/player/live/${session.id}`}>Review</Link>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
