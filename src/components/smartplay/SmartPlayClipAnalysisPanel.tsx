import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { AlertCircle, CheckCircle2, Clock3, Download, ExternalLink, FileVideo, Play, RefreshCw, Share2, Square, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, resolveApiUrl } from "@/lib/api";
import { getToken } from "@/lib/session";

type AdminUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
};

type CourtRow = {
  id: number;
  name: string;
  court_type: string;
  arena_name: string;
  calib_id: number | null;
};

type Clip = {
  id: number;
  matchId: number | null;
  externalMatchKey: string | null;
  playerUserId: number;
  cameraId: string;
  sportType: string;
  originalFilename: string;
  storedVideoPath: string;
  status: string;
  courtId: number | null;
  assignedPlayerIds: number[];
  sharedAt: string | null;
  createdAt: string;
  videoUrl?: string;
  previewVideoUrl?: string | null;
};

type ClipJob = {
  id: number;
  externalJobId: string | null;
  status: string;
  currentStep: string;
  homographyPath?: string | null;
  renderedVideoPath?: string | null;
  errorMessage?: string | null;
};

type ClipEvent = {
  frame: number | null;
  time_sec: number | null;
  event_type: string | null;
  winner_side: string | null;
  confidence: number | null;
  reason: string | null;
};

type ClipDetails = {
  clip: Clip;
  job: ClipJob | null;
  events: ClipEvent[];
};

const statusStyle: Record<string, string> = {
  uploaded: "bg-slate-500/15 text-slate-300 border-slate-500/25",
  awaiting_court_annotation: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  court_annotation_done: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  processing: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  done: "bg-green-500/15 text-green-300 border-green-500/25",
  failed: "bg-red-500/15 text-red-300 border-red-500/25",
  canceled: "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
  canceling: "bg-amber-500/15 text-amber-300 border-amber-500/25",
};

function StatusBadge({ status }: { status: string }) {
  const Icon =
    status === "done" ? CheckCircle2 :
    status === "failed" ? AlertCircle :
    status === "canceled" ? Square :
    status === "processing" || status === "canceling" ? RefreshCw : Clock3;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${statusStyle[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      <Icon size={11} className={status === "processing" ? "animate-spin" : ""} />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

async function authenticatedBlob(path: string) {
  const token = getToken();
  const response = await fetch(resolveApiUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error("Rendered video is not available yet.");
  return URL.createObjectURL(await response.blob());
}

export default function SmartPlayClipAnalysisPanel({ users = [] }: { users: AdminUser[] }) {
  const players = useMemo(() => users.filter((u) => u.role === "player"), [users]);

  // Upload form
  const [matchId, setMatchId] = useState("match_0004_padel");
  const [assignedPlayerIds, setAssignedPlayerIds] = useState<Set<number>>(new Set());
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [cameraId, setCameraId] = useState("camera_01");
  const [sportType, setSportType] = useState("padel");
  const [files, setFiles] = useState<FileList | null>(null);

  // Courts
  const [courts, setCourts] = useState<CourtRow[]>([]);

  // Clip list
  const [clips, setClips] = useState<Clip[]>([]);
  const [details, setDetails] = useState<Record<number, ClipDetails>>({});
  const [homography, setHomography] = useState<Record<number, string>>({});
  const [renderedUrls, setRenderedUrls] = useState<Record<number, string>>({});
  const [videoErrors, setVideoErrors] = useState<Record<number, string>>({});
  const [pausedJobPolling, setPausedJobPolling] = useState<Record<number, string>>({});
  const [jobStderr, setJobStderr] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyClipId, setBusyClipId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const cancelingRef = useRef<Set<number>>(new Set());

  async function loadCourts() {
    try {
      const res = await api<{ courts: CourtRow[] }>("/api/admin/courts-with-calibrations", { authenticated: true });
      setCourts(res.courts ?? []);
    } catch { /* courts optional — silent fail */ }
  }

  async function loadClips(options: { quiet?: boolean } = {}) {
    if (!options.quiet) setLoading(true);
    try {
      const result = await api<{ clips: Clip[] }>("/api/smartplay/clips", { authenticated: true });
      setClips(result.clips ?? []);
    } catch (error) {
      if (!options.quiet) toast.error(error instanceof Error ? error.message : "Unable to load SmartPlay clips.");
    } finally {
      if (!options.quiet) setLoading(false);
    }
  }

  async function loadDetails(clipId: number) {
    const result = await api<ClipDetails>(`/api/smartplay/clips/${clipId}`, { authenticated: true });
    setDetails((current) => ({ ...current, [clipId]: result }));
    return result;
  }

  useEffect(() => {
    loadClips();
    loadCourts();
  }, []);

  // Polling
  const activePollingKey = useMemo(() => {
    return clips
      .filter((clip) =>
        ["processing", "court_annotation_done"].includes(clip.status) ||
        ["queued", "running"].includes(details[clip.id]?.job?.status ?? "")
      )
      .filter((clip) => !pausedJobPolling[clip.id])
      .map((clip) => clip.id)
      .sort()
      .join(",");
  }, [clips, details, pausedJobPolling]);

  useEffect(() => {
    if (!activePollingKey) return undefined;
    const ids = activePollingKey.split(",").map(Number);
    const timer = window.setInterval(() => {
      ids.forEach((clipId) => void refreshJob(clipId, { quiet: true }));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activePollingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function onFilesChange(e: ChangeEvent<HTMLInputElement>) {
    setFiles(e.target.files);
  }

  function togglePlayer(id: number, checked: boolean) {
    setAssignedPlayerIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function uploadClips(event: FormEvent) {
    event.preventDefault();
    if (!files?.length) return toast.error("Choose at least one video clip.");
    const count = assignedPlayerIds.size;
    if (count < 2) return toast.error("Select at least 2 players.");
    if (count !== 2 && count !== 4) return toast.error("Select exactly 2 or 4 players.");

    const ids = Array.from(assignedPlayerIds);
    const form = new FormData();
    form.set("match_id", matchId);
    form.set("player_user_id", String(ids[0]));
    form.set("assigned_player_ids", JSON.stringify(ids));
    if (selectedCourtId) form.set("court_id", selectedCourtId);
    form.set("camera_id", cameraId);
    form.set("sport_type", sportType);
    Array.from(files).forEach((file) => form.append("clips", file));

    setUploading(true);
    try {
      const token = getToken();
      const response = await fetch(resolveApiUrl("/api/smartplay/clips/upload"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Upload failed.");
      toast.success("Clip uploaded for SmartPlay analysis.");
      setFiles(null);
      await loadClips();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteClip(clipId: number) {
    try {
      await api(`/api/smartplay/clips/${clipId}`, { method: "DELETE", authenticated: true });
      setConfirmDeleteId(null);
      toast.success("Clip deleted.");
      setDetails((d) => { const n = { ...d }; delete n[clipId]; return n; });
      await loadClips();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete clip.");
    }
  }

  async function startAnnotation(clipId: number) {
    setBusyClipId(clipId);
    try {
      const payload = await api<{ command: string; suggestedOutputJsonl: string }>(`/api/smartplay/clips/${clipId}/start-court-annotation`, {
        method: "POST",
        authenticated: true,
        body: {},
      });
      await loadDetails(clipId);
      toast.message("Court annotation command prepared", { description: payload.command });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start annotation.");
    } finally {
      setBusyClipId(null);
    }
  }

  async function confirmHomography(clipId: number) {
    const homographyPath = homography[clipId]?.trim();
    if (!homographyPath) return toast.error("Paste the homography .npy path first.");
    setBusyClipId(clipId);
    try {
      await api(`/api/smartplay/clips/${clipId}/confirm-homography`, {
        method: "POST",
        authenticated: true,
        body: { homography_path: homographyPath },
      });
      await Promise.all([loadDetails(clipId), loadClips()]);
      toast.success("Homography confirmed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to confirm homography.");
    } finally {
      setBusyClipId(null);
    }
  }

  async function processClip(clipId: number) {
    const existing = details[clipId]?.job;
    if (existing && ["queued", "running"].includes(existing.status)) {
      toast.error("A job is already running for this clip. Cancel it first.");
      return;
    }
    setBusyClipId(clipId);
    try {
      await api(`/api/smartplay/clips/${clipId}/process`, {
        method: "POST",
        authenticated: true,
        body: { render_debug: true },
      });
      setPausedJobPolling((current) => { const next = { ...current }; delete next[clipId]; return next; });
      await Promise.all([loadDetails(clipId), loadClips()]);
      toast.success("SmartPlay AI processing started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start processing.");
    } finally {
      setBusyClipId(null);
    }
  }

  async function cancelClip(clipId: number) {
    if (cancelingRef.current.has(clipId)) return;
    cancelingRef.current.add(clipId);
    setBusyClipId(clipId);
    try {
      await api(`/api/smartplay/clips/${clipId}/cancel`, { method: "POST", authenticated: true });
      setPausedJobPolling((current) => ({ ...current, [clipId]: "Job canceled." }));
      await Promise.all([loadDetails(clipId), loadClips()]);
      toast.success("SmartPlay processing canceled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel processing.");
    } finally {
      cancelingRef.current.delete(clipId);
      setBusyClipId(null);
    }
  }

  async function shareClip(clipId: number) {
    setBusyClipId(clipId);
    try {
      const result = await api<{ message: string }>(`/api/smartplay/clips/${clipId}/share-with-players`, { method: "POST", authenticated: true });
      await loadClips();
      toast.success(result.message ?? "Shared with players.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to share clip.");
    } finally {
      setBusyClipId(null);
    }
  }

  async function refreshJob(clipId: number, options: { quiet?: boolean } = {}) {
    if (!options.quiet) setBusyClipId(clipId);
    try {
      const result = await api<{ warning?: string; aiServiceAvailable?: boolean; stderr_tail?: string }>(`/api/smartplay/clips/${clipId}/job`, { authenticated: true });
      if (result.warning || result.aiServiceAvailable === false) {
        setPausedJobPolling((current) => ({ ...current, [clipId]: result.warning ?? "SmartPlay AI service is offline." }));
      } else {
        setPausedJobPolling((current) => { const next = { ...current }; delete next[clipId]; return next; });
      }
      if (result.stderr_tail) {
        setJobStderr((current) => ({ ...current, [clipId]: result.stderr_tail! }));
      } else {
        setJobStderr((current) => { const next = { ...current }; delete next[clipId]; return next; });
      }
      await Promise.all([loadDetails(clipId), loadClips({ quiet: options.quiet })]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh job.";
      setPausedJobPolling((current) => ({ ...current, [clipId]: message }));
      if (!options.quiet) toast.error(message);
    } finally {
      if (!options.quiet) setBusyClipId(null);
    }
  }

  async function generatePreview(clipId: number) {
    setBusyClipId(clipId);
    try {
      const result = await api<{ clip: Clip }>(`/api/smartplay/clips/${clipId}/generate-preview`, { method: "POST", authenticated: true });
      setClips((current) => current.map((clip) => (clip.id === clipId ? { ...clip, ...result.clip } : clip)));
      setDetails((current) => ({
        ...current,
        [clipId]: current[clipId] ? { ...current[clipId], clip: { ...current[clipId].clip, ...result.clip } } : current[clipId],
      }));
      setVideoErrors((current) => { const next = { ...current }; delete next[clipId]; return next; });
      toast.success("Browser preview generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate browser preview.");
    } finally {
      setBusyClipId(null);
    }
  }

  async function openRenderedVideo(clipId: number) {
    setBusyClipId(clipId);
    try {
      const url = await authenticatedBlob(`/api/smartplay/clips/${clipId}/rendered-video`);
      setRenderedUrls((current) => ({ ...current, [clipId]: url }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rendered video is not available yet.");
    } finally {
      setBusyClipId(null);
    }
  }

  const playerSelectionValid = assignedPlayerIds.size === 2 || assignedPlayerIds.size === 4;

  return (
    <section className="gradient-card rounded-2xl border border-border/50 p-5 space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-display font-bold flex items-center gap-2">
            <Video size={18} className="text-primary" /> SmartPlay Clip Analysis
          </h3>
          <p className="text-xs text-muted-foreground">Upload clips, confirm court homography, then run the AI pipeline.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => loadClips()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      <form onSubmit={uploadClips} className="space-y-3">
        {/* Row 1: match, court, camera, sport */}
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_120px]">
          <Input value={matchId} onChange={(e) => setMatchId(e.target.value)} placeholder="match_0004_padel" />
          <select
            value={selectedCourtId}
            onChange={(e) => setSelectedCourtId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">No court selected</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.arena_name ? `${c.arena_name} — ` : ""}{c.name}{c.calib_id ? " ✓" : ""} ({c.court_type ?? "padel"})
              </option>
            ))}
          </select>
          <Input value={cameraId} onChange={(e) => setCameraId(e.target.value)} placeholder="camera_01" />
          <Input value={sportType} onChange={(e) => setSportType(e.target.value)} placeholder="padel" />
        </div>

        {/* Row 2: player assignment */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Assign players <span className="text-red-400">*</span>
            <span className="ml-1 opacity-60">(select exactly 2 or 4)</span>
            {assignedPlayerIds.size > 0 && (
              <span className={`ml-2 font-bold ${playerSelectionValid ? "text-green-400" : "text-amber-400"}`}>
                {assignedPlayerIds.size} selected
              </span>
            )}
          </p>
          {players.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No players found in the system.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {players.map((player) => {
                const checked = assignedPlayerIds.has(player.id);
                return (
                  <label
                    key={player.id}
                    className={`flex items-center gap-2 cursor-pointer rounded-md px-2.5 py-2 border text-sm transition-colors ${checked ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/50 hover:bg-muted/20 text-muted-foreground"}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary flex-shrink-0"
                      checked={checked}
                      onChange={(e) => togglePlayer(player.id, e.target.checked)}
                    />
                    <span className="truncate">{player.first_name} {player.last_name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Row 3: file + upload button */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input type="file" accept="video/*" multiple onChange={onFilesChange} />
          </div>
          <Button type="submit" disabled={uploading}>
            <Upload size={14} /> {uploading ? "Uploading…" : "Upload clips"}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-4">
          {clips.map((clip) => {
            const detail = details[clip.id];
            const job = detail?.job;
            const events = detail?.events ?? [];
            const busy = busyClipId === clip.id;
            const originalVideoUrl = clip.videoUrl ? resolveApiUrl(clip.videoUrl) : "";
            const previewVideoUrl = clip.previewVideoUrl ? resolveApiUrl(clip.previewVideoUrl) : "";
            const canCancel = ["processing", "queued", "running", "canceling"].includes(clip.status) || ["queued", "running", "canceling"].includes(job?.status ?? "");
            return (
              <article key={clip.id} className="rounded-xl border border-border/50 bg-background/35 p-4 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileVideo size={16} className="text-primary" />
                      <p className="font-semibold truncate">{clip.originalFilename}</p>
                      <StatusBadge status={clip.status} />
                      {job?.currentStep && <span className="text-xs text-muted-foreground">Step: {job.currentStep}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Match {clip.externalMatchKey ?? clip.matchId ?? "-"} · Player #{clip.playerUserId} · {clip.cameraId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => loadDetails(clip.id)} disabled={busy}>
                      <RefreshCw size={14} /> Details
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => startAnnotation(clip.id)} disabled={busy}>
                      <Clock3 size={14} /> Annotation
                    </Button>
                    <Button type="button" size="sm" onClick={() => processClip(clip.id)} disabled={busy || !job?.homographyPath}>
                      <Play size={14} /> Process
                    </Button>
                    {canCancel && (
                      <Button type="button" size="sm" variant="destructive" onClick={() => cancelClip(clip.id)} disabled={busy}>
                        <Square size={14} /> Cancel
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => refreshJob(clip.id)} disabled={busy}>
                      <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Job
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDeleteId(clip.id)}
                      disabled={busy}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {pausedJobPolling[clip.id] && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Job polling paused: {pausedJobPolling[clip.id]}
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clip preview</p>
                    {originalVideoUrl ? (
                      <div className="space-y-2">
                        {previewVideoUrl ? (
                          <video
                            src={previewVideoUrl}
                            controls
                            preload="metadata"
                            onError={() => setVideoErrors((current) => ({ ...current, [clip.id]: "The generated preview could not be played. Open or download the original clip below." }))}
                            className="aspect-video w-full rounded-lg border border-border/50 bg-black object-contain"
                          />
                        ) : (
                          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/10 p-4 text-center text-sm text-muted-foreground">
                            <Video size={22} />
                            <span>Original saved. Browser preview needs H.264 MP4 or server-side ffmpeg.</span>
                            <Button type="button" size="sm" variant="outline" onClick={() => generatePreview(clip.id)} disabled={busy}>
                              <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Generate preview
                            </Button>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <a href={originalVideoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink size={12} /> Open original
                          </a>
                          <a href={originalVideoUrl} download className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Download size={12} /> Download
                          </a>
                          {previewVideoUrl && (
                            <a href={previewVideoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              <ExternalLink size={12} /> Open preview MP4
                            </a>
                          )}
                        </div>
                        {videoErrors[clip.id] && <p className="text-xs text-amber-300">{videoErrors[clip.id]}</p>}
                      </div>
                    ) : (
                      <div className="aspect-video rounded-lg border border-border/50 bg-muted/20" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Rendered AI output</p>
                      {clip.status === "done" && clip.assignedPlayerIds?.length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant={clip.sharedAt ? "ghost" : "outline"}
                          disabled={busy}
                          onClick={() => shareClip(clip.id)}
                          className={clip.sharedAt ? "text-green-400 hover:text-green-300" : ""}
                        >
                          <Share2 size={13} className="mr-1" />
                          {clip.sharedAt ? "Shared ✓" : `Share with ${clip.assignedPlayerIds.length} player${clip.assignedPlayerIds.length !== 1 ? "s" : ""}`}
                        </Button>
                      )}
                    </div>
                    {renderedUrls[clip.id] ? (
                      <video src={renderedUrls[clip.id]} controls className="aspect-video w-full rounded-lg border border-border/50 bg-black object-contain" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => openRenderedVideo(clip.id)}
                        className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/10 text-sm text-muted-foreground hover:bg-muted/20"
                      >
                        <Download size={16} /> Load rendered video
                      </button>
                    )}
                  </div>
                </div>

                {clip.status === "awaiting_court_annotation" ? (
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <Input
                      value={homography[clip.id] ?? job?.homographyPath ?? ""}
                      onChange={(e) => setHomography((current) => ({ ...current, [clip.id]: e.target.value }))}
                      placeholder="C:\\path\\to\\camera_01_H.npy"
                    />
                    <Button type="button" variant="outline" onClick={() => confirmHomography(clip.id)} disabled={busy}>
                      Confirm homography
                    </Button>
                  </div>
                ) : job?.homographyPath ? (
                  <p className="text-xs text-green-400 truncate">
                    ✓ Homography: {job.homographyPath}
                  </p>
                ) : null}

                {job?.errorMessage && (
                  <div className="rounded border border-red-500/30 bg-red-950/40 p-2">
                    <p className="text-sm font-medium text-red-300">{job.errorMessage}</p>
                    {jobStderr[clip.id] && (
                      <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] text-red-200/70">
                        {jobStderr[clip.id].slice(-2000)}
                      </pre>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!clips.length && (
            <p className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
              No SmartPlay clips uploaded yet.
            </p>
          )}
        </div>
      )}

      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this clip?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the clip and all associated AI jobs and events. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDeleteId !== null) void deleteClip(confirmDeleteId); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
