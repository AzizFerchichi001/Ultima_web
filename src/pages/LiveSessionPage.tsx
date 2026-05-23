import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { api, resolveApiUrl } from "@/lib/api";
import { getToken, getSessionUser } from "@/lib/session";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, Copy, Play, Radio, RotateCcw, Square, Users, Zap } from "lucide-react";
import LiveAIStatusBadge from "@/components/smartplay/LiveAIStatusBadge";
import LiveMinimap from "@/components/smartplay/LiveMinimap";
import LiveVideoPanel from "@/components/smartplay/LiveVideoPanel";
import type { LiveSession, LiveVisualUpdate } from "@/components/smartplay/liveTypes";

type StatusEntry = { msg: string; time: Date };

export default function LiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [update, setUpdate] = useState<LiveVisualUpdate | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<StatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const sessionRef = useRef<LiveSession | null>(null);
  sessionRef.current = session;

  const currentUser = getSessionUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const mockEnabled = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_ENABLE_MOCK_LIVE === "1";
  const apiRoot = useMemo(() => resolveApiUrl("").replace(/\/+$/, ""), []);

  // isFileDemoSession: show raw source video as preview for file_demo / local_demo sessions
  const isFileDemoSession =
    session?.cameraType === "file_demo" ||
    session?.mode === "file_demo" ||
    session?.mode === "local_demo" ||
    (typeof session?.aiSessionId === "string" && (
      session.aiSessionId.startsWith("filedemo-") || session.aiSessionId.startsWith("local-")
    ));

  // noRenderedStream: only block subprocess-based dev sessions (no real MJPEG from FastAPI).
  // file_demo sessions that went through /live/start have a real aiSessionId → allow rendered stream.
  const DEV_AI_PREFIXES = ["filedemo-", "mock-", "local-"];
  const noRenderedStream =
    ["mock", "local_demo"].includes(session?.mode ?? "") ||
    (typeof session?.aiSessionId === "string" && DEV_AI_PREFIXES.some((p) => session!.aiSessionId!.startsWith(p)));

  const sourceVideoUrl = useMemo(() => {
    const token = getToken();
    if (!id || !token || !isFileDemoSession) return null;
    return resolveApiUrl(`/api/live-sessions/${id}/source-video?token=${encodeURIComponent(token)}`);
  }, [id, isFileDemoSession]);

  const renderedStreamUrl = useMemo(() => {
    const token = getToken();
    if (!id || !token || !session?.aiSessionId || session?.status === "stopped") return null;
    if (noRenderedStream) return null;
    return resolveApiUrl(`/api/live-sessions/${id}/rendered-stream?token=${encodeURIComponent(token)}`);
  }, [id, session?.aiSessionId, session?.status, noRenderedStream]);

  const pushLog = (msg: string) => {
    setStatusLog((log) => [{ msg, time: new Date() }, ...log].slice(0, 6));
  };

  useEffect(() => {
    if (!id) return;
    api<{ session: LiveSession }>(`/api/live-sessions/${id}`, { authenticated: true })
      .then((result) => {
        setSession(result.session);
        setStatusMessage(result.session.aiStatusMessage);
        if (result.session.aiStatusMessage) pushLog(result.session.aiStatusMessage);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to load live session."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const socket: Socket = io(apiRoot, {
      transports: ["websocket", "polling"],
      auth: { token: getToken() },
    });
    socket.emit("live:join", { sessionId: Number(id) });
    socket.on("live:update", (payload: LiveVisualUpdate) => {
      setUpdate(payload);
      setSession((cur) => cur ? {
        ...cur,
        fps: payload.fps ?? cur.fps,
        lastFrame: payload.frame ?? cur.lastFrame,
        status: payload.status ?? cur.status,
      } : cur);
    });
    socket.on("live:status", (payload: { status?: string; message?: string; aiSessionId?: string }) => {
      setStatusMessage(payload.message ?? null);
      if (payload.message) pushLog(payload.message);
      if (payload.status) setSession((cur) => cur ? {
        ...cur,
        status: payload.status ?? cur.status,
        ...(payload.aiSessionId ? { aiSessionId: payload.aiSessionId } : {}),
      } : cur);
      // Refetch session when AI starts so rendered stream URL gets the real aiSessionId
      if (payload.status === "running" && id) {
        api<{ session: LiveSession }>(`/api/live-sessions/${id}`, { authenticated: true })
          .then((r) => setSession(r.session))
          .catch(() => {});
      }
    });
    socket.on("live:error", (payload: { message?: string }) => {
      const msg = payload.message ?? "Live analysis error.";
      setStatusMessage(msg);
      pushLog(`Error: ${msg}`);
      setSession((cur) => cur ? { ...cur, status: "error" } : cur);
    });
    socket.on("live:stopped", () => {
      pushLog("Session stopped.");
      setSession((cur) => cur ? { ...cur, status: "stopped" } : cur);
    });
    return () => {
      socket.emit("live:leave", { sessionId: Number(id) });
      socket.disconnect();
    };
  }, [apiRoot, id]);

  useEffect(() => {
    if (!id) return;
    let canceled = false;
    const loadLatest = async () => {
      try {
        const result = await api<{ update: LiveVisualUpdate | null }>(
          `/api/live-sessions/${id}/latest-update`,
          { authenticated: true },
        );
        if (canceled || !result.update) return;
        setUpdate(result.update);
        setSession((cur) => cur ? {
          ...cur,
          fps: result.update?.fps ?? cur.fps,
          lastFrame: result.update?.frame ?? cur.lastFrame,
          status: result.update?.status ?? cur.status,
        } : cur);
      } catch { /* Socket.IO is primary; polling is a quiet fallback */ }
    };
    void loadLatest();
    const timer = window.setInterval(loadLatest, 1500);
    return () => { canceled = true; window.clearInterval(timer); };
  }, [id]);

  const startLive = async (mode: "real" | "mock" | "file_demo" = "real") => {
    if (!id) return;
    // Honour the session's own mode for file_demo sessions so the user doesn't accidentally
    // trigger a real SmartPlay AI call when clicking "Start Analysis".
    const effectiveMode = isFileDemoSession ? "file_demo" : mode;
    try {
      const result = await api<{ session: LiveSession }>(`/api/live-sessions/${id}/start`, {
        method: "POST", authenticated: true, body: { mode: effectiveMode },
      });
      setSession(result.session);
      pushLog(effectiveMode === "file_demo" ? "File demo started." : effectiveMode === "real" ? "Live analysis started." : "Mock analysis started.");
      toast.success(effectiveMode === "file_demo" ? "File demo started — streaming local video." : effectiveMode === "real" ? "Live analysis started." : "Mock live analysis started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start live analysis.");
    }
  };

  const stop = async () => {
    if (!id) return;
    setStopping(true);
    try {
      const result = await api<{ session: LiveSession }>(`/api/live-sessions/${id}/stop`, {
        method: "POST", authenticated: true,
      });
      setSession(result.session);
      pushLog("Session stopped by admin.");
      toast.success("Live analysis stopped.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to stop live.");
    } finally { setStopping(false); }
  };

  const restart = async () => {
    if (!id || !session) return;
    try {
      const result = await api<{ session: LiveSession }>(`/api/live-sessions/${id}/start`, {
        method: "POST", authenticated: true, body: { mode: session.mode },
      });
      setSession(result.session);
      pushLog("Session restarted by super admin.");
      toast.success("Session restarted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to restart.");
    }
  };

  const copyText = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied.`));
  };

  if (loading) {
    return (
      <Layout>
        <div className="container py-16">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Loading live session…
          </div>
        </div>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout>
        <div className="container py-16 text-sm text-muted-foreground">Live session not found.</div>
      </Layout>
    );
  }

  const isRunning = session.status === "running";
  const isStopped = session.status === "stopped";
  const isError = session.status === "error";

  const telemetryStats = [
    { label: "Frame", value: update?.frame ?? session.lastFrame ?? "—" },
    {
      label: "FPS",
      value: typeof (update?.fps ?? session.fps) === "number"
        ? `${Math.round((update?.fps ?? session.fps) as number)}`
        : "—",
    },
    { label: "Players", value: update?.players?.length ?? update?.pose?.trackedPlayers ?? 0 },
    {
      label: "Ball",
      value: update?.ball?.confidence != null
        ? `${Math.round(update.ball.confidence * 100)}%`
        : "—",
    },
  ];

  const callbackUrl = `${resolveApiUrl("").replace(/\/$/, "")}/api/smartplay/live/${id}/update`;

  return (
    <Layout>
      <div className="container py-10 space-y-6">

        {/* ── Breadcrumb ── */}
        <Link
          to="/smartplay-ai"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft size={14} /> SmartPlay AI
        </Link>

        {/* ── Page header ── */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary shadow-[0_0_12px_hsl(var(--primary)/0.12)]">
              <Radio size={11} className={isRunning ? "animate-pulse" : ""} />
              Live visual analysis
            </div>
            <h1 className="text-4xl font-display font-bold uppercase tracking-tight">
              {session.courtName ?? `Court ${session.courtId}`}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {session.arenaName}
              {session.arenaName && " · "}
              <span className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                {session.mode}
              </span>
              <span className="ml-2 text-muted-foreground/60">session #{session.id}</span>
              {session.lastUpdateAt && (
                <span className="ml-2 text-muted-foreground/40">
                  · {new Date(session.lastUpdateAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>
          <LiveAIStatusBadge
            status={session.status}
            fps={update?.fps ?? session.fps}
            message={statusMessage ?? session.aiStatusMessage}
          />
        </div>

        {/* ── Super-admin control panel ── */}
        {isSuperAdmin && (
          <div className="gradient-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border/40 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/15">
                  <Zap size={13} className="text-purple-300" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Super Admin Controls</span>
                <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-purple-300">
                  #{session.id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyText(String(id), "Session ID")}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Copy size={10} /> Copy ID
                </button>
                <button
                  onClick={() => copyText(callbackUrl, "Callback URL")}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                >
                  <Copy size={10} /> Copy callback URL
                </button>
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  onClick={() => startLive("real")}
                  disabled={isRunning || session.status === "starting"}
                  className="gap-2 glow-yellow"
                >
                  <Play size={14} />
                  {session.status === "starting" ? "Starting…" : isRunning ? "Running" : "Start Analysis"}
                </Button>
                {mockEnabled && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => startLive("file_demo")}
                      disabled={isRunning || session.status === "starting"}
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      File Demo
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => startLive("mock")}
                      disabled={isRunning || session.status === "starting"}
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      Dev Mock
                    </Button>
                  </>
                )}
                {(isStopped || isError) && (
                  <Button
                    variant="secondary"
                    onClick={restart}
                    className="gap-2"
                  >
                    <RotateCcw size={14} /> Restart
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={stop}
                  disabled={isStopped || stopping}
                  className="gap-2"
                >
                  <Square size={14} />
                  {stopping ? "Stopping…" : "Stop Session"}
                </Button>
              </div>
              {statusMessage && !isRunning && (
                <p className="mt-3 text-xs text-muted-foreground">{statusMessage}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Stopped / error banner ── */}
        {(isStopped || isError) && (
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            isError
              ? "border-red-500/25 bg-red-500/[0.06] text-red-300"
              : "border-border/50 bg-white/[0.02] text-muted-foreground"
          }`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${isError ? "bg-red-400" : "bg-muted-foreground/30"}`} />
            {isError
              ? (statusMessage ?? "Live analysis encountered an error.")
              : "Session stopped. Start a new analysis from the controls above."}
          </div>
        )}

        {/* ── Main content ── */}
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">

          <LiveVideoPanel
            update={update}
            cameraName={session.cameraName}
            videoUrl={sourceVideoUrl}
            renderedUrl={renderedStreamUrl}
          />

          <div className="space-y-5">

            {/* Minimap */}
            <LiveMinimap update={update} />

            {/* Players */}
            <div className="gradient-card rounded-xl p-5">
              <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <Users size={13} className="text-primary" /> Players
              </h2>
              <div className="space-y-1.5">
                {(session.players ?? []).map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{player.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {player.slot}{player.team ? ` · team ${player.team}` : ""}
                    </span>
                  </div>
                ))}
                {!(session.players ?? []).length && (
                  <p className="text-sm text-muted-foreground">No assigned players yet.</p>
                )}
              </div>
            </div>

            {/* AI telemetry */}
            <div className="gradient-card rounded-xl p-5">
              <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <Zap size={13} className="text-primary" /> AI Telemetry
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                {telemetryStats.map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-border/40 bg-white/[0.025] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                    <p className="mt-1.5 text-2xl font-display font-bold leading-none">{value}</p>
                  </div>
                ))}
              </div>
              {update?.pose?.status && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Pose: <span className="text-foreground">{update.pose.status}</span>
                </p>
              )}
            </div>

            {/* Status log — super_admin only */}
            {isSuperAdmin && statusLog.length > 0 && (
              <div className="gradient-card rounded-xl p-5">
                <h2 className="mb-3.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Clock size={13} className="text-primary" /> Status Log
                </h2>
                <div className="space-y-1.5">
                  {statusLog.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <span className="mt-0.5 shrink-0 text-muted-foreground/50 font-mono">
                        {entry.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className={`${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
                        {entry.msg}
                      </span>
                      {i === 0 && <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-primary/60" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Session info — super_admin only */}
            {isSuperAdmin && (
              <div className="gradient-card rounded-xl p-5">
                <h2 className="mb-3.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Radio size={13} className="text-primary" /> Session Info
                </h2>
                <div className="space-y-2">
                  {[
                    { label: "Session ID", value: `#${session.id}` },
                    { label: "Arena", value: session.arenaName ?? "—" },
                    { label: "Court", value: session.courtName ?? `Court ${session.courtId}` },
                    { label: "Camera", value: session.cameraName ?? "—" },
                    { label: "Camera type", value: session.cameraType ?? "—" },
                    { label: "Mode", value: session.mode },
                    { label: "AI session ID", value: session.aiSessionId ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-4 rounded-lg bg-white/[0.02] px-3 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
                      <span className="text-xs font-mono text-foreground/80 truncate max-w-[180px]" title={String(value)}>
                        {value}
                      </span>
                    </div>
                  ))}
                  <div className="mt-1 rounded-lg bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Callback endpoint</p>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate text-[10px] text-primary/80">{callbackUrl}</code>
                      <button
                        onClick={() => copyText(callbackUrl, "Callback URL")}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </Layout>
  );
}
