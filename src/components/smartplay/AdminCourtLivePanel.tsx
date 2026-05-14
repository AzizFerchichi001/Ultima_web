import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, Camera, CheckCircle2, ChevronRight,
  Play, Plus, Radio, RefreshCw, RotateCcw, Square, Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LiveAIStatusBadge from "./LiveAIStatusBadge";
import type { LiveSession } from "./liveTypes";

type Court = {
  id: number;
  name: string;
  arena_name?: string;
  arenaName?: string;
  sport?: string;
};

type CameraRecord = {
  id: number;
  name: string;
  camera_url: string;
  camera_type: string;
  is_active: boolean;
};

type CourtCalibration = {
  id?: number;
  calibration_status?: string;
  calibrationStatus?: "valid" | "pending" | "missing" | "invalid" | string;
  homography_json_path?: string | null;
  isValidForLive?: boolean;
};

type SessionFilter = "all" | "live" | "error";

export default function AdminCourtLivePanel({ courts }: { courts: Court[] }) {
  const navigate = useNavigate();
  const currentUser = getSessionUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const isAdmin = isSuperAdmin || currentUser?.role === "admin" || currentUser?.role === "arena_admin";
  const mockEnabled = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_ENABLE_MOCK_LIVE === "1";

  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [calibration, setCalibration] = useState<CourtCalibration | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [cameraForm, setCameraForm] = useState({ name: "", cameraUrl: "", cameraType: "file_demo" });
  const [saving, setSaving] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const selectedCourt = useMemo(() => courts.find((c) => String(c.id) === selectedCourtId), [courts, selectedCourtId]);

  useEffect(() => {
    if (!selectedCourtId && courts[0]) setSelectedCourtId(String(courts[0].id));
  }, [courts, selectedCourtId]);

  const loadSessions = async () => {
    const result = await api<{ sessions: LiveSession[] }>("/api/live-sessions", { authenticated: true });
    setSessions(result.sessions);
  };

  const loadCameras = async (courtId: string) => {
    if (!courtId) return;
    const result = await api<{ cameras: CameraRecord[] }>(`/api/courts/${courtId}/cameras`, { authenticated: true });
    setCameras(result.cameras);
    setSelectedCameraId((cur) => cur || String(result.cameras[0]?.id ?? ""));
  };

  const loadCalibration = async (courtId: string, cameraId?: string) => {
    if (!courtId) return;
    const suffix = cameraId ? `?cameraId=${cameraId}` : "";
    const result = await api<{ calibration: CourtCalibration }>(`/api/courts/${courtId}/calibration${suffix}`, { authenticated: true });
    setCalibration(result.calibration);
  };

  useEffect(() => { void loadSessions().catch(() => {}); }, []);
  useEffect(() => {
    setSelectedCameraId("");
    void loadCameras(selectedCourtId).catch(() => setCameras([]));
    void loadCalibration(selectedCourtId).catch(() => setCalibration(null));
  }, [selectedCourtId]);
  useEffect(() => {
    if (selectedCourtId) void loadCalibration(selectedCourtId, selectedCameraId).catch(() => setCalibration(null));
  }, [selectedCameraId]);

  const refreshAll = async () => {
    await loadSessions().catch(() => {});
    setLastRefresh(new Date());
    toast.success("Sessions refreshed.");
  };

  const createCamera = async () => {
    if (!selectedCourtId) return;
    if (!cameraForm.name.trim() || !cameraForm.cameraUrl.trim()) {
      toast.error("Camera name and source path are required.");
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ camera: CameraRecord }>(`/api/courts/${selectedCourtId}/cameras`, {
        method: "POST", authenticated: true, body: cameraForm,
      });
      setCameras((cur) => [result.camera, ...cur]);
      setSelectedCameraId(String(result.camera.id));
      toast.success("Camera saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save camera.");
    } finally { setSaving(false); }
  };

  const startSession = async (mode: "mock" | "real" | "file_demo") => {
    if (!selectedCourtId) return;
    setSaving(true);
    try {
      let cameraId = selectedCameraId ? Number(selectedCameraId) : null;
      if (!cameraId && mode === "mock") {
        const camera = await api<{ camera: CameraRecord }>(`/api/courts/${selectedCourtId}/cameras`, {
          method: "POST", authenticated: true, body: cameraForm,
        });
        cameraId = camera.camera.id;
        setCameras((cur) => [camera.camera, ...cur]);
        setSelectedCameraId(String(cameraId));
      }
      const created = await api<{ session: LiveSession }>("/api/live-sessions", {
        method: "POST", authenticated: true,
        body: { courtId: Number(selectedCourtId), cameraId, mode },
      });
      const started = await api<{ session: LiveSession }>(
        `/api/live-sessions/${created.session.id}/start`,
        { method: "POST", authenticated: true, body: { mode } },
      );
      setSessions((cur) => [started.session, ...cur.filter((s) => s.id !== started.session.id)]);
      toast.success(mode === "mock" ? "Mock live session started." : mode === "file_demo" ? "File demo started — AI pipeline running." : "Live AI started.");
      void loadSessions().catch(() => {});
      navigate(`/live-sessions/${started.session.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start live session.");
    } finally { setSaving(false); }
  };

  const stopSession = async (sessionId: number) => {
    setSaving(true);
    try {
      const result = await api<{ session: LiveSession }>(`/api/live-sessions/${sessionId}/stop`, {
        method: "POST", authenticated: true,
      });
      setSessions((cur) => cur.map((s) => s.id === sessionId ? result.session : s));
      toast.success(`Session #${sessionId} stopped.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to stop live session.");
    } finally { setSaving(false); }
  };

  const restartSession = async (session: LiveSession) => {
    if (!isSuperAdmin) return;
    setSaving(true);
    try {
      const result = await api<{ session: LiveSession }>(`/api/live-sessions/${session.id}/start`, {
        method: "POST", authenticated: true, body: { mode: session.mode },
      });
      setSessions((cur) => cur.map((s) => s.id === result.session.id ? result.session : s));
      toast.success(`Session #${session.id} restarted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to restart session.");
    } finally { setSaving(false); }
  };

  const courtSessions = sessions.filter((s) => !selectedCourtId || String(s.courtId) === selectedCourtId);
  const selectedCamera = cameras.find((c) => String(c.id) === selectedCameraId) ?? cameras[0] ?? null;
  const calibrationStatus = calibration?.calibrationStatus ?? calibration?.calibration_status ?? "missing";
  const liveReady = Boolean(selectedCamera?.is_active && calibration?.isValidForLive);

  const liveCount = courtSessions.filter((s) => s.status === "running" || s.status === "starting").length;
  const errorCount = courtSessions.filter((s) => s.status === "error").length;

  const filteredSessions = courtSessions.filter((s) => {
    if (sessionFilter === "live") return s.status === "running" || s.status === "starting";
    if (sessionFilter === "error") return s.status === "error";
    return true;
  });

  const filterTabs = [
    { key: "all" as SessionFilter, label: "All", count: courtSessions.length, countCls: "" },
    { key: "live" as SessionFilter, label: "Live", count: liveCount, countCls: liveCount > 0 ? "bg-emerald-500/20 text-emerald-400" : "" },
    { key: "error" as SessionFilter, label: "Error", count: errorCount, countCls: errorCount > 0 ? "bg-red-500/20 text-red-400" : "" },
  ];

  return (
    <div className="gradient-card rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-5 border-b border-border/40">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-[0_0_16px_hsl(var(--primary)/0.2)]">
              <Radio size={17} className="text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-gradient">Live SmartPlay AI</h3>
                {isSuperAdmin && (
                  <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-purple-300">
                    Super Admin
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Player detection · ball tracking · pose · minimap telemetry
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {liveCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300 animate-pulse-glow">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {liveCount} live
              </div>
            )}
            <button
              onClick={refreshAll}
              title={`Last refresh: ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Super-admin stats bar */}
        {isSuperAdmin && (
          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {[
              {
                label: "Running",
                value: liveCount,
                cls: liveCount > 0
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : "border-border/40 bg-white/[0.02] text-muted-foreground",
              },
              {
                label: "Total",
                value: courtSessions.length,
                cls: "border-border/40 bg-white/[0.02] text-foreground",
              },
              {
                label: "Errors",
                value: errorCount,
                cls: errorCount > 0
                  ? "border-red-500/25 bg-red-500/10 text-red-300"
                  : "border-border/40 bg-white/[0.02] text-muted-foreground",
              },
            ].map(({ label, value, cls }) => (
              <div key={label} className={`rounded-xl border px-3 py-3 text-center ${cls}`}>
                <p className="text-2xl font-display font-bold leading-none">{value}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Court · Camera · Calibration ── */}
      <div className="space-y-4 border-b border-border/40 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Court</label>
            <select
              className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm backdrop-blur-sm transition-colors focus:border-primary/50 focus:outline-none"
              value={selectedCourtId}
              onChange={(e) => setSelectedCourtId(e.target.value)}
            >
              {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {selectedCourt && (
              <p className="text-[10px] text-muted-foreground">
                {selectedCourt.arena_name ?? selectedCourt.arenaName ?? "Arena"} · {selectedCourt.sport ?? "Padel"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Camera</label>
            <select
              className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm backdrop-blur-sm transition-colors focus:border-primary/50 focus:outline-none"
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
            >
              <option value="">No camera selected</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.camera_type}{c.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </div>

          <div className={`rounded-xl border p-3.5 ${calibration?.isValidForLive ? "border-emerald-500/25 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
            <div className="mb-1.5 flex items-center gap-1.5">
              {calibration?.isValidForLive
                ? <CheckCircle2 size={12} className="text-emerald-400" />
                : <AlertTriangle size={12} className="text-amber-400" />}
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Calibration</span>
            </div>
            <p className={`text-sm font-bold capitalize ${calibration?.isValidForLive ? "text-emerald-300" : "text-amber-300"}`}>
              {calibrationStatus}
            </p>
            {!calibration?.isValidForLive ? (
              <a
                href="#court-calibration-panel"
                className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-amber-400 transition-colors hover:text-amber-200 hover:underline"
              >
                <AlertTriangle size={10} /> Annotate court →
              </a>
            ) : calibration?.homography_json_path ? (
              <p className="mt-1 truncate text-[10px] text-muted-foreground" title={calibration.homography_json_path}>
                {calibration.homography_json_path.split(/[\\/]/).pop()}
              </p>
            ) : null}
          </div>
        </div>

        {/* Camera source row */}
        {selectedCamera && (
          <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-white/[0.025] px-3 py-2">
            <Camera size={12} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">
              {selectedCamera.camera_url || "No source configured"}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${selectedCamera.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                {selectedCamera.is_active ? "active" : "inactive"}
              </span>
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                {selectedCamera.camera_type}
              </span>
            </div>
          </div>
        )}

        {/* Add camera — collapsible */}
        <details className="group rounded-xl border border-dashed border-border/50">
          <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground">
            <Plus size={12} className="transition-transform duration-200 group-open:rotate-45" />
            Add / register camera
          </summary>
          <div className="border-t border-dashed border-border/50 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Name</label>
                <Input
                  value={cameraForm.name}
                  onChange={(e) => setCameraForm((c) => ({ ...c, name: e.target.value }))}
                  placeholder="e.g. Main camera"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source path or RTSP URL</label>
                <Input
                  value={cameraForm.cameraUrl}
                  onChange={(e) => setCameraForm((c) => ({ ...c, cameraUrl: e.target.value }))}
                  placeholder="rtsp://..., 0, or /path/to/video.mp4"
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={createCamera} disabled={saving || !selectedCourtId} className="w-full sm:w-auto">
                  Save camera
                </Button>
              </div>
            </div>
          </div>
        </details>
      </div>

      {/* ── Launch ── */}
      <div className="border-b border-border/40 px-6 py-5">
        <p className="mb-3.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Launch session</p>
        <div className="flex flex-wrap gap-2.5">
          <Button
            onClick={() => startSession("real")}
            disabled={saving || !selectedCourtId || !liveReady}
            className="gap-2 glow-yellow"
          >
            <Camera size={14} /> Start Live Analysis
          </Button>
          <Button
            variant="secondary"
            onClick={() => startSession("file_demo")}
            disabled={saving || !selectedCourtId}
            className="gap-2"
          >
            <Terminal size={14} /> File Demo
          </Button>
          {mockEnabled && (
            <Button
              variant="ghost"
              onClick={() => startSession("mock")}
              disabled={saving || !selectedCourtId}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Play size={14} /> Dev Mock
            </Button>
          )}
        </div>
        {!liveReady && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-400/80">
            <AlertTriangle size={12} />
            <span>
              <span className="font-semibold text-amber-300">Live Analysis</span> needs an active camera with valid calibration.{" "}
              <span className="text-foreground/50">Local Demo works without it.</span>
            </span>
          </p>
        )}
      </div>


      {/* ── Sessions ── */}
      <div className="px-6 pb-6 pt-5 space-y-3">
        {/* Filter tabs */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-0.5 rounded-xl border border-border/40 bg-muted/10 p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSessionFilter(tab.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-150 ${
                  sessionFilter === tab.key
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tab.countCls || "bg-muted/60 text-muted-foreground"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {selectedCourt?.name ?? "All courts"}
          </p>
        </div>

        {/* Session cards */}
        <div className="space-y-2">
          {filteredSessions.map((session) => {
            const isRunning = session.status === "running";
            const isError = session.status === "error";
            const isStarting = session.status === "starting";
            return (
              <div
                key={session.id}
                className={`rounded-xl border p-4 transition-all duration-200 ${
                  isRunning
                    ? "border-emerald-500/25 bg-emerald-500/[0.04] shadow-[0_0_20px_hsl(142_76%_36%/0.06)]"
                    : isError
                      ? "border-red-500/25 bg-red-500/[0.04]"
                      : isStarting
                        ? "border-amber-500/25 bg-amber-500/[0.04]"
                        : "border-border/40 bg-white/[0.015] hover:border-border/60 transition-colors"
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      isRunning ? "animate-pulse bg-emerald-400 shadow-[0_0_6px_hsl(142_76%_55%/0.8)]"
                      : isError ? "bg-red-400"
                      : isStarting ? "animate-pulse bg-amber-400"
                      : "bg-muted-foreground/25"
                    }`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">Session #{session.id}</span>
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          {session.mode}
                        </span>
                        {session.cameraName && (
                          <span className="text-xs text-muted-foreground">· {session.cameraName}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {session.lastFrame != null && `frame ${session.lastFrame}`}
                        {session.fps != null && ` · ${Math.round(session.fps)} fps`}
                        {session.lastUpdateAt && ` · ${new Date(session.lastUpdateAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <LiveAIStatusBadge status={session.status} fps={session.fps} message={session.aiStatusMessage} />
                    <Button asChild variant="outline" size="sm" className="h-8 gap-1 border-border/50 text-xs">
                      <Link to={`/live-sessions/${session.id}`}>Open <ChevronRight size={11} /></Link>
                    </Button>
                    {isAdmin && session.status !== "stopped" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => stopSession(session.id)}
                        disabled={saving}
                        className="h-8 gap-1 text-xs"
                      >
                        <Square size={11} /> Stop
                      </Button>
                    )}
                    {isSuperAdmin && (session.status === "stopped" || session.status === "error") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restartSession(session)}
                        disabled={saving}
                        className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                        title="Restart this session"
                      >
                        <RotateCcw size={11} /> Restart
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredSessions.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/40 px-4 py-10 text-center">
              <Radio size={22} className="mx-auto mb-2.5 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                {sessionFilter === "all"
                  ? "No live sessions for this court yet."
                  : `No ${sessionFilter} sessions.`}
              </p>
              {sessionFilter === "all" && (
                <p className="mt-1 text-xs text-muted-foreground/50">Launch a session above to get started.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
