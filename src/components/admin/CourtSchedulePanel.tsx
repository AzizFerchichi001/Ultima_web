import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, RefreshCw, Lock, Unlock, User } from "lucide-react";
import { useLocale } from "@/i18n/locale";

type Court = {
  id: number;
  name: string;
  sport: string;
  status: string;
  arena_name: string;
  opening_time: string | null;
  closing_time: string | null;
};

type Reservation = {
  id: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status: string;
  court_name: string;
  owner_name: string;
  owner_email: string;
};

type Block = {
  id: number;
  court_id: number;
  court_name: string;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
};

// Grid config: one row per hour from 06:00 to 23:00
const HOUR_START = 6;
const HOUR_END   = 23;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

function hhmm(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", month: "short", day: "numeric",
  });
}
function timeToH(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

type CellKind =
  | { type: "outside" }
  | { type: "free" }
  | { type: "reserved"; res: Reservation }
  | { type: "blocked"; block: Block };

function cellKind(
  hour: number,
  court: Court,
  resByCourt: Record<number, Reservation[]>,
  blocksByCourt: Record<number, Block[]>,
): CellKind {
  const open  = timeToH(court.opening_time  ?? "08:00");
  const close = timeToH(court.closing_time  ?? "22:00");
  if (hour < open || hour >= close) return { type: "outside" };

  const block = blocksByCourt[court.id]?.find(b => {
    const bs = timeToH(b.start_time);
    const be = timeToH(b.end_time);
    return hour >= bs && hour < be;
  });
  if (block) return { type: "blocked", block };

  const res = resByCourt[court.id]?.find(r => {
    if (r.status === "cancelled") return false;
    const rs = timeToH(r.start_time);
    const re = timeToH(r.end_time);
    return hour >= rs && hour < re;
  });
  if (res) return { type: "reserved", res };

  return { type: "free" };
}

const REASON_KEYS = ["Break", "Maintenance", "Reserved", "Custom"] as const;
type ReasonKey = typeof REASON_KEYS[number];

export default function CourtSchedulePanel() {
  const { t } = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loadingCourts, setLC] = useState(true);
  const [loadingData, setLD] = useState(false);

  // Block dialog state
  const REASONS: Record<ReasonKey, string> = {
    Break:       t("admin.court.reasonBreak"),
    Maintenance: t("admin.court.reasonMaint"),
    Reserved:    t("admin.court.reasonRes"),
    Custom:      t("admin.court.reasonCustom"),
  };

  const [blockDlg, setBlockDlg] = useState<{
    courtId: number; courtName: string;
    startTime: string; endTime: string; reason: string;
  } | null>(null);
  const [savingBlock, setSavingBlock] = useState(false);

  // Confirm-unblock dialog
  const [unblockDlg, setUnblockDlg] = useState<Block | null>(null);
  const [deletingBlock, setDeletingBlock] = useState(false);

  // Hover tooltip state for reservations
  const [hoverRes, setHoverRes] = useState<{ res: Reservation; x: number; y: number } | null>(null);

  // Load courts once
  useEffect(() => {
    setLC(true);
    api<{ courts: Court[] }>("/api/admin/courts", { authenticated: true })
      .then(d => setCourts((d.courts ?? []).filter(c => c.status !== "inactive")))
      .catch(err => toast.error(err instanceof Error ? err.message : t("admin.court.courtsFail")))
      .finally(() => setLC(false));
  }, []);

  // Load reservations + blocks whenever date changes
  const load = useCallback(async (d: string) => {
    setLD(true);
    try {
      const [resData, blockData] = await Promise.all([
        api<{ reservations: Reservation[] }>(`/api/admin/reservations/v2?date=${d}`, { authenticated: true })
          .catch(() => api<{ reservations: Reservation[] }>("/api/admin/reservations", { authenticated: true })),
        api<{ blocks: Block[] }>(`/api/admin/court-blocks?date=${d}`, { authenticated: true })
          .catch(() => ({ blocks: [] })),
      ]);
      setReservations(resData.reservations ?? []);
      setBlocks(blockData.blocks ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.court.loadFail"));
    } finally {
      setLD(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const resByCourt = useMemo(() => {
    const map: Record<number, Reservation[]> = {};
    for (const r of reservations) {
      const court = courts.find(c => c.name === r.court_name);
      if (!court) continue;
      if (!map[court.id]) map[court.id] = [];
      map[court.id].push(r);
    }
    return map;
  }, [reservations, courts]);

  const blocksByCourt = useMemo(() => {
    const map: Record<number, Block[]> = {};
    for (const b of blocks) {
      if (!map[b.court_id]) map[b.court_id] = [];
      map[b.court_id].push(b);
    }
    return map;
  }, [blocks]);

  function openBlockDlg(court: Court, hour: number) {
    setBlockDlg({
      courtId: court.id,
      courtName: court.name,
      startTime: hhmm(hour),
      endTime: hhmm(hour + 1),
      reason: "Break",
    });
  }

  async function createBlock() {
    if (!blockDlg) return;
    setSavingBlock(true);
    try {
      const data = await api<{ block: Block }>("/api/admin/court-blocks", {
        method: "POST", authenticated: true,
        body: {
          courtId: blockDlg.courtId,
          date,
          startTime: blockDlg.startTime,
          endTime: blockDlg.endTime,
          reason: blockDlg.reason === "Custom" ? undefined : blockDlg.reason,
        },
      });
      setBlocks(prev => [...prev, { ...data.block, court_name: blockDlg.courtName }]);
      toast.success(t("admin.court.blocked"));
      setBlockDlg(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.court.blockFail"));
    } finally {
      setSavingBlock(false);
    }
  }

  async function deleteBlock(block: Block) {
    setDeletingBlock(true);
    try {
      await api(`/api/admin/court-blocks/${block.id}`, { method: "DELETE", authenticated: true });
      setBlocks(prev => prev.filter(b => b.id !== block.id));
      toast.success(t("admin.court.unblocked"));
      setUnblockDlg(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.court.unblockFail"));
    } finally {
      setDeletingBlock(false);
    }
  }

  const totalBookings = reservations.filter(r => r.status !== "cancelled").length;
  const totalBlocks   = blocks.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-bold">{t("admin.court.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("admin.court.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDate(d => addDays(d, -1))}>
            <ChevronLeft size={15} />
          </Button>
          <Input type="date" className="h-9 w-40" value={date} onChange={e => setDate(e.target.value)} />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDate(d => addDays(d, 1))}>
            <ChevronRight size={15} />
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setDate(today)}>{t("admin.today")}</Button>
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => load(date)} disabled={loadingData}>
            <RefreshCw size={13} className={loadingData ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Date + stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="font-bold text-lg">{fmtDate(date)}</p>
        <span className="text-xs rounded-full border border-border/50 px-2 py-0.5 text-muted-foreground">
          {(totalBookings === 1 ? t("admin.court.bookings") : t("admin.court.bookingsP")).replace("{n}", String(totalBookings))}
        </span>
        {totalBlocks > 0 && (
          <span className="text-xs rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-400 px-2 py-0.5">
            {(totalBlocks === 1 ? t("admin.court.blocks") : t("admin.court.blocksP")).replace("{n}", String(totalBlocks))}
          </span>
        )}
      </div>

      {loadingCourts ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
      ) : courts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("admin.court.noActive")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                {/* Time column header */}
                <th className="sticky left-0 z-10 bg-background/95 backdrop-blur border-b border-r border-border/50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-16">
                  {t("admin.court.timeCol")}
                </th>
                {courts.map(court => (
                  <th key={court.id} className="border-b border-r border-border/30 px-2 py-2 text-center min-w-[120px]">
                    <p className="font-bold text-foreground truncate">{court.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{court.sport}</p>
                    <p className="text-[10px] text-muted-foreground/60 truncate">
                      {court.opening_time?.slice(0,5) ?? "08:00"}–{court.closing_time?.slice(0,5) ?? "22:00"}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map(hour => (
                <tr key={hour} className="group">
                  {/* Time label */}
                  <td className="sticky left-0 z-10 bg-background/95 backdrop-blur border-b border-r border-border/30 px-3 py-0 text-right text-muted-foreground/70 tabular-nums font-mono h-9 align-middle">
                    {hhmm(hour)}
                  </td>
                  {courts.map(court => {
                    if (loadingData) {
                      return (
                        <td key={court.id} className="border-b border-r border-border/20 p-0.5">
                          <div className="h-8 rounded bg-muted/20 animate-pulse" />
                        </td>
                      );
                    }
                    const kind = cellKind(hour, court, resByCourt, blocksByCourt);

                    if (kind.type === "outside") {
                      return (
                        <td key={court.id} className="border-b border-r border-border/20 p-0.5">
                          <div className="h-8 rounded bg-muted/10 border border-transparent" />
                        </td>
                      );
                    }

                    if (kind.type === "reserved") {
                      const r = kind.res;
                      return (
                        <td key={court.id} className="border-b border-r border-border/20 p-0.5">
                          <div
                            className="h-8 rounded bg-amber-500/20 border border-amber-500/40 flex items-center gap-1 px-1.5 cursor-default relative group/res overflow-hidden"
                            onMouseEnter={e => setHoverRes({ res: r, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setHoverRes(null)}
                          >
                            <User size={9} className="text-amber-400 flex-shrink-0" />
                            <span className="text-amber-400 font-bold truncate text-[10px]">{r.owner_name}</span>
                          </div>
                        </td>
                      );
                    }

                    if (kind.type === "blocked") {
                      const b = kind.block;
                      return (
                        <td key={court.id} className="border-b border-r border-border/20 p-0.5">
                          <button
                            className="w-full h-8 rounded bg-orange-500/15 border border-orange-500/30 flex items-center gap-1 px-1.5 hover:bg-orange-500/25 transition-colors group/blk"
                            onClick={() => setUnblockDlg(b)}
                            title={b.reason ?? "Blocked"}
                          >
                            <Lock size={9} className="text-orange-400 flex-shrink-0" />
                            <span className="text-orange-400 font-bold truncate text-[10px]">{b.reason ?? "Blocked"}</span>
                            <Unlock size={8} className="text-orange-300 ml-auto flex-shrink-0 opacity-0 group-hover/blk:opacity-100" />
                          </button>
                        </td>
                      );
                    }

                    // free cell — click to block
                    return (
                      <td key={court.id} className="border-b border-r border-border/20 p-0.5">
                        <button
                          className="w-full h-8 rounded bg-green-500/5 border border-green-500/10 hover:bg-green-500/15 hover:border-green-500/30 transition-colors group/free flex items-center justify-center"
                          onClick={() => openBlockDlg(court, hour)}
                          title="Click to block this slot"
                        >
                          <Lock size={9} className="text-green-600/40 opacity-0 group-hover/free:opacity-100 transition-opacity" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-500/15 border border-green-500/30" /> {t("admin.court.legendFree")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40" /> {t("admin.court.legendBooked")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-orange-500/15 border border-orange-500/30" /> {t("admin.court.legendBlock")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-muted/20 border border-transparent" /> {t("admin.court.legendOut")}
        </span>
      </div>

      {/* Block slot dialog */}
      <Dialog open={!!blockDlg} onOpenChange={v => !v && setBlockDlg(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock size={14} className="text-orange-400" /> {t("admin.court.blockTitle")} — {blockDlg?.courtName}
            </DialogTitle>
          </DialogHeader>
          {blockDlg && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.court.startTime")}</label>
                  <Input type="time" value={blockDlg.startTime}
                    onChange={e => setBlockDlg(d => d ? { ...d, startTime: e.target.value } : d)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.court.endTime")}</label>
                  <Input type="time" value={blockDlg.endTime}
                    onChange={e => setBlockDlg(d => d ? { ...d, endTime: e.target.value } : d)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.court.reason")}</label>
                <div className="flex flex-wrap gap-2">
                  {REASON_KEYS.map(rk => (
                    <button key={rk}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        blockDlg.reason === rk
                          ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                          : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                      onClick={() => setBlockDlg(d => d ? { ...d, reason: rk } : d)}>
                      {REASONS[rk]}
                    </button>
                  ))}
                </div>
                {blockDlg.reason === "Custom" && (
                  <Input className="mt-2" placeholder={t("admin.court.reasonPh")}
                    onChange={e => setBlockDlg(d => d ? { ...d, reason: e.target.value } : d)} />
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setBlockDlg(null)}>{t("admin.cancel")}</Button>
                <Button className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" onClick={createBlock} disabled={savingBlock}>
                  {savingBlock ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
                  {t("admin.court.blockBtn")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Unblock confirm dialog */}
      <Dialog open={!!unblockDlg} onOpenChange={v => !v && setUnblockDlg(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock size={14} className="text-green-400" /> {t("admin.court.unblockTitle")}
            </DialogTitle>
          </DialogHeader>
          {unblockDlg && (
            <div className="space-y-4 pt-1">
              <p className="text-sm text-muted-foreground">
                {t("admin.court.unblockMsg")
                  .replace("{reason}", unblockDlg.reason ?? "block")
                  .replace("{court}", unblockDlg.court_name)
                  .replace("{start}", unblockDlg.start_time)
                  .replace("{end}", unblockDlg.end_time)}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setUnblockDlg(null)}>{t("admin.cancel")}</Button>
                <Button className="flex-1 glow-yellow" onClick={() => deleteBlock(unblockDlg)} disabled={deletingBlock}>
                  {deletingBlock ? <RefreshCw size={12} className="animate-spin" /> : <Unlock size={12} />}
                  {t("admin.court.unblockBtn")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating reservation tooltip */}
      {hoverRes && (
        <div
          className="fixed z-50 pointer-events-none bg-popover border border-border rounded-xl px-3 py-2 shadow-xl text-xs"
          style={{ left: hoverRes.x + 12, top: hoverRes.y - 10 }}
        >
          <p className="font-bold">{hoverRes.res.owner_name}</p>
          <p className="text-muted-foreground">{hoverRes.res.owner_email}</p>
          <p className="text-muted-foreground mt-0.5">{hoverRes.res.start_time} – {hoverRes.res.end_time}</p>
        </div>
      )}
    </div>
  );
}
