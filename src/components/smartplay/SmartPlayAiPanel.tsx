import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Brain, CheckCircle2, Clock3, ExternalLink, Play, RefreshCw, Video, Wifi, WifiOff, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, resolveApiUrl } from "@/lib/api";
import { getSessionUser } from "@/lib/session";

type SmartPlayStatus = {
  connected: boolean;
  version?: string | null;
  message?: string;
};

type SmartPlayJob = {
  job_id: string;
  status: "queued" | "running" | "done" | "failed" | string;
  match_id: string;
  camera_id: string;
  stdout_tail?: string;
  stderr_tail?: string;
  return_code?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
};

type SmartPlayEvent = {
  frame: number | null;
  time_sec: number | null;
  event_type: string | null;
  winner_side: string | null;
  confidence: number | null;
  reason: string | null;
};

type SmartPlayEventsResponse = {
  match_id: string;
  camera_id: string;
  events: SmartPlayEvent[];
};

const statusStyles: Record<string, string> = {
  queued: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  running: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  done: "bg-green-500/15 text-green-300 border-green-500/25",
  failed: "bg-red-500/15 text-red-300 border-red-500/25",
};

function JobBadge({ status }: { status: string }) {
  const cls = statusStyles[status] ?? "bg-muted text-muted-foreground border-border";
  const Icon = status === "done" ? CheckCircle2 : status === "failed" ? AlertCircle : status === "running" ? RefreshCw : Clock3;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${cls}`}>
      <Icon size={11} className={status === "running" ? "animate-spin" : ""} />
      {status}
    </span>
  );
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function formatTime(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)}s`;
}

export default function SmartPlayAiPanel({ matchId = "match_0004_padel" }: { matchId?: string }) {
  const user = getSessionUser();
  const canRunAnalysis = !!user && ["admin", "super_admin"].includes(user.role);
  const [status, setStatus] = useState<SmartPlayStatus | null>(null);
  const [job, setJob] = useState<SmartPlayJob | null>(null);
  const [events, setEvents] = useState<SmartPlayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const debugVideoUrl = useMemo(
    () => resolveApiUrl(`/api/smartplay/matches/${encodeURIComponent(matchId)}/debug-video`),
    [matchId]
  );

  const loadStatus = async () => {
    try {
      const result = await api<SmartPlayStatus>("/api/smartplay/status");
      setStatus(result);
    } catch (error) {
      setStatus({ connected: false, message: error instanceof Error ? error.message : "Unable to reach SmartPlay AI." });
    }
  };

  const loadEvents = async () => {
    try {
      const result = await api<SmartPlayEventsResponse>(`/api/smartplay/matches/${encodeURIComponent(matchId)}/events`, {
        optionalAuth: true,
      } as RequestInit & { optionalAuth: boolean });
      setEvents(result.events ?? []);
      setEventsError(null);
    } catch (error) {
      setEvents([]);
      setEventsError(error instanceof Error ? error.message : "No scoring events are available yet.");
    }
  };

  const loadPanel = async () => {
    setLoading(true);
    await Promise.all([loadStatus(), loadEvents()]);
    setLoading(false);
  };

  useEffect(() => {
    void loadPanel();
  }, [matchId]);

  useEffect(() => {
    if (!job?.job_id || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await api<SmartPlayJob>(`/api/smartplay/jobs/${encodeURIComponent(job.job_id)}`, {
          authenticated: true,
        });
        setJob(result);
        if (["done", "failed"].includes(result.status)) {
          window.clearInterval(timer);
          if (result.status === "done") {
            toast.success("SmartPlay AI analysis completed.");
            void loadEvents();
          } else {
            toast.error(result.error_message ?? "SmartPlay AI analysis failed.");
          }
        }
      } catch (error) {
        window.clearInterval(timer);
        toast.error(error instanceof Error ? error.message : "Unable to refresh SmartPlay job.");
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job?.job_id, job?.status]);

  const startAnalysis = async () => {
    if (!canRunAnalysis) {
      toast.error("Admin access is required to run SmartPlay AI analysis.");
      return;
    }

    setRunning(true);
    try {
      const result = await api<SmartPlayJob>(`/api/smartplay/matches/${encodeURIComponent(matchId)}/scoring/start`, {
        method: "POST",
        authenticated: true,
        body: { render_debug: false },
      });
      setJob(result);
      toast.success("SmartPlay AI analysis started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start SmartPlay AI analysis.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="gradient-card rounded-2xl border border-purple-500/20 p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Brain size={20} className="text-purple-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-display font-bold">SmartPlay AI Demo Match</h3>
              <span className="text-[10px] font-bold uppercase tracking-widest rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
                {matchId}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Scoring v2 events from the FastAPI SmartPlay service.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadPanel()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button size="sm" onClick={startAnalysis} disabled={!canRunAnalysis || running || !status?.connected}>
            <Play size={14} />
            {running ? "Starting..." : "Run SmartPlay AI Analysis"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(debugVideoUrl, "_blank", "noopener,noreferrer")}>
            <Video size={14} />
            Debug Video
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className={`rounded-xl border p-4 ${status?.connected ? "border-green-500/25 bg-green-500/5" : "border-orange-500/25 bg-orange-500/5"}`}>
          <div className="flex items-center gap-2 mb-1">
            {status?.connected ? <Wifi size={14} className="text-green-300" /> : <WifiOff size={14} className="text-orange-300" />}
            <span className="text-xs font-bold uppercase tracking-widest">Service</span>
          </div>
          {loading ? <Skeleton className="h-4 w-28" /> : (
            <p className="text-sm font-semibold">{status?.connected ? "Connected" : "Unavailable"}</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">{status?.version ? `v${status.version}` : status?.message ?? "Checking..."}</p>
        </div>

        <div className="rounded-xl border border-border/50 p-4 bg-muted/10">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest">Latest Job</span>
          </div>
          {job ? (
            <div className="flex items-center gap-2 flex-wrap">
              <JobBadge status={job.status} />
              <span className="text-[11px] text-muted-foreground font-mono">{job.job_id.slice(0, 8)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No job started in this session</p>
          )}
        </div>

        <div className="rounded-xl border border-border/50 p-4 bg-muted/10">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={14} className="text-green-300" />
            <span className="text-xs font-bold uppercase tracking-widest">Events</span>
          </div>
          <p className="text-sm font-semibold">{events.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">terminal_events.parquet rows</p>
        </div>
      </div>

      {job?.error_message && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
          {job.error_message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border/50">
              <th className="text-left py-3 pr-4">Frame</th>
              <th className="text-left py-3 pr-4">Time</th>
              <th className="text-left py-3 pr-4">Event</th>
              <th className="text-left py-3 pr-4">Winner</th>
              <th className="text-left py-3 pr-4">Confidence</th>
              <th className="text-left py-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {events.slice(0, 40).map((event, index) => (
              <tr key={`${event.frame ?? index}-${event.event_type ?? "event"}`} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="py-3 pr-4 font-mono text-xs">{event.frame ?? "-"}</td>
                <td className="py-3 pr-4 text-xs">{formatTime(event.time_sec)}</td>
                <td className="py-3 pr-4">
                  <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-purple-200">
                    {event.event_type ?? "unknown"}
                  </span>
                </td>
                <td className="py-3 pr-4 text-xs">{event.winner_side ?? "-"}</td>
                <td className="py-3 pr-4 font-mono text-xs">{formatNumber(event.confidence)}</td>
                <td className="py-3 text-xs text-muted-foreground min-w-[260px]">{event.reason ?? "-"}</td>
              </tr>
            ))}
            {!events.length && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground">
                  {eventsError ?? "No SmartPlay AI events loaded yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground border-t border-border/30 pt-3">
        <span>Showing up to 40 events for the v1 demo match.</span>
        <a className="inline-flex items-center gap-1 hover:text-primary transition-colors" href={debugVideoUrl} target="_blank" rel="noreferrer">
          Open debug video <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}
