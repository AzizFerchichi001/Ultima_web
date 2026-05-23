import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Play, Square, Trash2, Eye, Plus, RefreshCw, Zap,
  Settings, AlertCircle, CheckCircle2, Clock, Wifi,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/i18n/locale";

type CourtSummary = { id: number; name: string; arena_name: string; sport: string };
type LiveSession  = {
  id: number;
  status: "starting" | "running" | "error" | "stopped" | "created";
  mode: string;
  arenaId: number;
  courtId: number;
  courtName: string | null;
  arenaName: string | null;
  fps: number | null;
  aiStatusMessage: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
};

const STATUS_CLS: Record<string, { cls: string; icon: React.ElementType }> = {
  running:  { cls: "bg-red-500/15 text-red-400 border-red-500/30 animate-pulse", icon: Zap },
  starting: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",         icon: Clock },
  error:    { cls: "bg-red-500/15 text-red-400 border-red-500/30",                icon: AlertCircle },
  stopped:  { cls: "bg-muted text-muted-foreground border-border",                icon: Square },
  created:  { cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",             icon: CheckCircle2 },
};
const MODES = ["real", "file_demo", "mock"];

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cfg = STATUS_CLS[status] ?? STATUS_CLS.stopped;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${cfg.cls}`}>
      <Icon size={9}/> {label}
    </span>
  );
}

export default function LiveSessionsPanel({ courts }: { courts: CourtSummary[] }) {
  const navigate = useNavigate();
  const { t } = useLocale();

  const statusLabel: Record<string, string> = {
    running:  t("admin.live.statusLive"),
    starting: t("admin.live.statusStart"),
    error:    t("admin.live.statusError"),
    stopped:  t("admin.live.statusStop"),
    created:  t("admin.live.statusReady"),
  };
  const [sessions, setSessions]         = useState<LiveSession[]>([]);
  const [loading, setLoading]           = useState(true);
  const [actionId, setActionId]         = useState<number | null>(null);
  const [deleteId, setDeleteId]         = useState<number | null>(null);

  // Create dialog
  const [showCreate, setShowCreate]     = useState(false);
  const [createForm, setCreateForm]     = useState({ courtId: "", mode: "real" });
  const [creating, setCreating]         = useState(false);

  // Configure dialog
  const [configSession, setConfigSession] = useState<LiveSession | null>(null);
  const [configForm, setConfigForm]       = useState({ mode: "real", courtId: "" });
  const [saving, setSaving]               = useState(false);

  // Confirm delete dialog
  const [confirmDelete, setConfirmDelete] = useState<LiveSession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ sessions: LiveSession[] }>("/api/live-sessions", { authenticated: true });
      setSessions(data.sessions ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.live.failLoad"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function startSession(s: LiveSession) {
    setActionId(s.id);
    try {
      await api(`/api/live-sessions/${s.id}/start`, { method: "POST", authenticated: true, body: { mode: s.mode } });
      toast.success(t("admin.live.sessionStarted"));
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : t("admin.live.failStart")); }
    finally { setActionId(null); }
  }

  async function stopSession(s: LiveSession) {
    setActionId(s.id);
    try {
      await api(`/api/live-sessions/${s.id}/stop`, { method: "POST", authenticated: true });
      toast.success(t("admin.live.sessionStopped"));
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : t("admin.live.failStop")); }
    finally { setActionId(null); }
  }

  async function deleteSession() {
    if (!confirmDelete) return;
    setDeleteId(confirmDelete.id);
    try {
      await api(`/api/live-sessions/${confirmDelete.id}`, { method: "DELETE", authenticated: true });
      toast.success(t("admin.live.sessionDeleted"));
      setConfirmDelete(null);
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : t("admin.live.failDelete")); }
    finally { setDeleteId(null); }
  }

  async function createSession() {
    if (!createForm.courtId) { toast.error(t("admin.live.selectCourt")); return; }
    setCreating(true);
    try {
      await api("/api/live-sessions", {
        method: "POST", authenticated: true,
        body: { courtId: Number(createForm.courtId), mode: createForm.mode },
      });
      toast.success(t("admin.live.sessionCreated"));
      setShowCreate(false);
      setCreateForm({ courtId: "", mode: "real" });
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : t("admin.live.failCreate")); }
    finally { setCreating(false); }
  }

  async function saveConfig() {
    if (!configSession) return;
    setSaving(true);
    try {
      await api(`/api/live-sessions/${configSession.id}`, {
        method: "PATCH", authenticated: true,
        body: {
          mode: configForm.mode,
          ...(configForm.courtId ? { courtId: Number(configForm.courtId) } : {}),
        },
      });
      toast.success(t("admin.live.sessionUpdated"));
      setConfigSession(null);
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : t("admin.live.failUpdate")); }
    finally { setSaving(false); }
  }

  const active  = sessions.filter(s => s.status === "running" || s.status === "starting").length;
  const stopped = sessions.filter(s => s.status === "stopped").length;
  const errors  = sessions.filter(s => s.status === "error").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <Wifi size={20} className="text-primary"/> {t("admin.live.title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("admin.live.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""}/> {t("admin.refresh")}
          </Button>
          <Button size="sm" className="glow-yellow" onClick={() => setShowCreate(true)}>
            <Plus size={14}/> {t("admin.live.newBtn")}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("admin.live.statTotal"),   value: sessions.length, color: "text-foreground" },
          { label: t("admin.live.statLive"),    value: active,           color: "text-red-400"    },
          { label: t("admin.live.statStopped"), value: stopped,          color: "text-muted-foreground" },
          { label: t("admin.live.statErrors"),  value: errors,           color: "text-amber-400"  },
        ].map(s => (
          <div key={s.label} className="gradient-card rounded-xl border border-border/50 px-4 py-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Sessions list */}
      {loading ? (
        <div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-20 rounded-2xl"/>)}</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-2xl text-muted-foreground text-sm">
          {t("admin.live.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const busy = actionId === s.id;
            const canStart = s.status === "stopped" || s.status === "created" || s.status === "error";
            const canStop  = s.status === "running"  || s.status === "starting";
            return (
              <div key={s.id} className={`gradient-card rounded-2xl border px-5 py-4 flex items-center gap-4 flex-wrap ${s.status === "running" ? "border-red-500/30" : "border-border/50"}`}>
                {/* Status + info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={s.status} label={statusLabel[s.status] ?? s.status}/>
                    <span className="font-semibold text-sm">{s.courtName ?? `Court #${s.courtId}`}</span>
                    <span className="text-xs text-muted-foreground">{s.arenaName}</span>
                    <span className="text-[10px] rounded border border-border/50 bg-muted/20 px-1.5 py-0.5 text-muted-foreground font-mono uppercase">{s.mode}</span>
                    {s.fps != null && s.status === "running" && (
                      <span className="text-[10px] text-green-400 font-bold">{s.fps} fps</span>
                    )}
                  </div>
                  {s.aiStatusMessage && (
                    <p className="text-xs text-muted-foreground truncate">{s.aiStatusMessage}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    #{s.id}
                    {s.startedAt && ` · ${t("admin.live.started")} ${new Date(s.startedAt).toLocaleString()}`}
                    {s.stoppedAt && ` · ${t("admin.live.stopped")} ${new Date(s.stoppedAt).toLocaleString()}`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                  {canStop && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => stopSession(s)}
                      className="h-8 text-xs text-amber-400 hover:bg-amber-500/10">
                      {busy ? <RefreshCw size={11} className="animate-spin"/> : <Square size={11}/>} {t("admin.live.stop")}
                    </Button>
                  )}
                  {canStart && (
                    <Button size="sm" disabled={busy} onClick={() => startSession(s)}
                      className="h-8 text-xs glow-yellow">
                      {busy ? <RefreshCw size={11} className="animate-spin"/> : <Play size={11}/>} {t("admin.live.start")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 text-xs"
                    onClick={() => navigate(`/live-sessions/${s.id}`)}>
                    <Eye size={11}/> {t("admin.live.watch")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => { setConfigSession(s); setConfigForm({ mode: s.mode, courtId: String(s.courtId) }); }}>
                    <Settings size={13}/>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                    disabled={deleteId === s.id} onClick={() => setConfirmDelete(s)}>
                    <Trash2 size={13}/>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create session dialog */}
      <Dialog open={showCreate} onOpenChange={v => !v && setShowCreate(false)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={15} className="text-primary"/> {t("admin.live.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.live.courtLabel")}</label>
              <select value={createForm.courtId} onChange={e => setCreateForm(f => ({ ...f, courtId: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
                <option value="">{t("admin.live.courtPh")}</option>
                {courts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} — {c.arena_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.live.modeLabel")}</label>
              <select value={createForm.mode} onChange={e => setCreateForm(f => ({ ...f, mode: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {createForm.mode === "real" && t("admin.live.modeReal")}
                {createForm.mode === "mock" && t("admin.live.modeMock")}
                {createForm.mode === "file_demo" && t("admin.live.modeDemo")}
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>{t("admin.cancel")}</Button>
              <Button className="flex-1 glow-yellow" onClick={createSession} disabled={creating}>
                {creating ? <RefreshCw size={13} className="animate-spin"/> : <Zap size={13}/>} {t("admin.live.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Configure session dialog */}
      <Dialog open={!!configSession} onOpenChange={v => !v && setConfigSession(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings size={15} className="text-primary"/> {t("admin.live.configTitle")} #{configSession?.id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.live.modeLabel")}</label>
              <select value={configForm.mode} onChange={e => setConfigForm(f => ({ ...f, mode: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.live.courtLabel2")}</label>
              <select value={configForm.courtId} onChange={e => setConfigForm(f => ({ ...f, courtId: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
                {courts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} — {c.arena_name}</option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {t("admin.live.configWarn")}
            </p>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setConfigSession(null)}>{t("admin.cancel")}</Button>
              <Button className="flex-1 glow-yellow" onClick={saveConfig} disabled={saving}>
                {saving ? <RefreshCw size={13} className="animate-spin"/> : <Settings size={13}/>} {t("admin.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 size={15}/> {t("admin.live.deleteTitle")} #{confirmDelete?.id}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              {t("admin.live.deleteMsg").replace("{court}", confirmDelete?.courtName ?? "")}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>{t("admin.cancel")}</Button>
              <Button variant="destructive" className="flex-1" onClick={deleteSession} disabled={!!deleteId}>
                {deleteId ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>} {t("admin.delete")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
