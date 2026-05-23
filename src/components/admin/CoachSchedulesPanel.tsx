import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, RefreshCw, User, Edit2,
  Plus, Trash2, CalendarOff, Clock, BellRing,
} from "lucide-react";
import { useLocale } from "@/i18n/locale";

// ── Types ──────────────────────────────────────────────────────────────────────

type Coach = {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  expertise: string | null;
};

type Rule = {
  id?: number;
  day_of_week: number;   // 0=Sun…6=Sat
  start_time: string;    // HH:MM
  end_time: string;
  is_available: boolean;
};

type Exception = {
  id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  is_available: boolean;
  reason: string | null;
};

type Session = {
  id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  players_count: number;
  player_name: string;
  player_email: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 07–23

// Reorder so Mon=0 for the weekly display
const WEEK_DOWS = [1, 2, 3, 4, 5, 6, 0]; // Mon…Sun

// ── Helpers ───────────────────────────────────────────────────────────────────

function mondayOf(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function timeToH(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

// ── Edit-dialog types ─────────────────────────────────────────────────────────

type BreakRow = { start: string; end: string };
type DayEdit = {
  dow: number;
  isOff: boolean;
  startTime: string;
  endTime: string;
  breaks: BreakRow[];
};

function rulesТoDayEdits(rules: Rule[]): DayEdit[] {
  return Array.from({ length: 7 }, (_, dow) => {
    const dayRules = rules.filter(r => r.day_of_week === dow);
    const available = dayRules.filter(r => r.is_available);
    const breaks    = dayRules.filter(r => !r.is_available);
    const first = available[0];
    return {
      dow,
      isOff:     available.length === 0,
      startTime: first?.start_time ?? "08:00",
      endTime:   first?.end_time   ?? "22:00",
      breaks:    breaks.map(b => ({ start: b.start_time, end: b.end_time })),
    };
  });
}

function dayEditsToRules(days: DayEdit[]): Omit<Rule, "id">[] {
  const out: Omit<Rule, "id">[] = [];
  for (const day of days) {
    if (day.isOff) continue;
    out.push({ day_of_week: day.dow, start_time: day.startTime, end_time: day.endTime, is_available: true });
    for (const b of day.breaks) {
      if (b.start && b.end) {
        out.push({ day_of_week: day.dow, start_time: b.start, end_time: b.end, is_available: false });
      }
    }
  }
  return out;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CoachSchedulesPanel() {
  const { t } = useLocale();
  const today     = new Date().toISOString().slice(0, 10);
  const [coaches, setCoaches]       = useState<Coach[]>([]);
  const [loadingCoaches, setLC]     = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [weekStart, setWeekStart]   = useState(() => mondayOf(today));

  const [rules, setRules]           = useState<Rule[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [sessions, setSessions]     = useState<Session[]>([]);
  const [loadingAvail, setLA]       = useState(false);

  // Edit schedule dialog
  const [editOpen, setEditOpen]     = useState(false);
  const [dayEdits, setDayEdits]     = useState<DayEdit[]>([]);
  const [editMsg, setEditMsg]       = useState("");
  const [saving, setSaving]         = useState(false);

  // Exception dialog
  const [excOpen, setExcOpen]       = useState(false);
  const [excForm, setExcForm]       = useState({ date: today, isOff: true, startTime: "08:00", endTime: "22:00", reason: "" });
  const [savingExc, setSavingExc]   = useState(false);

  // Load coaches
  useEffect(() => {
    setLC(true);
    api<{ coaches: Coach[] }>("/api/admin/coaches", { authenticated: true })
      .then(d => {
        setCoaches(d.coaches ?? []);
        if ((d.coaches ?? []).length > 0) setSelectedId(d.coaches[0].userId);
      })
      .catch(err => toast.error(err instanceof Error ? err.message : t("admin.coach.loadFail")))
      .finally(() => setLC(false));
  }, []);

  // Load availability + sessions when coach or week changes
  useEffect(() => {
    if (!selectedId) return;
    setLA(true);
    setRules([]);
    setExceptions([]);
    setSessions([]);
    Promise.all([
      api<{ rules: Rule[]; exceptions: Exception[] }>(
        `/api/admin/coaches/${selectedId}/availability`, { authenticated: true }
      ).catch(() => ({ rules: [], exceptions: [] })),
      api<{ sessions: Session[] }>(
        `/api/admin/coaches/${selectedId}/sessions?weekStart=${weekStart}`, { authenticated: true }
      ).catch(() => ({ sessions: [] })),
    ]).then(([avail, sess]) => {
      setRules(avail.rules ?? []);
      setExceptions(avail.exceptions ?? []);
      setSessions(sess.sessions ?? []);
    }).finally(() => setLA(false));
  }, [selectedId, weekStart]);

  const selectedCoach = coaches.find(c => c.userId === selectedId);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)); // Mon…Sun
  const weekEnd  = addDays(weekStart, 6);

  // Build session map: date → sessions
  const sessionsByDate = useMemo(() => {
    const m: Record<string, Session[]> = {};
    for (const s of sessions) {
      if (!m[s.session_date]) m[s.session_date] = [];
      m[s.session_date].push(s);
    }
    return m;
  }, [sessions]);

  // Exception map: date → Exception
  const excByDate = useMemo(() => {
    const m: Record<string, Exception> = {};
    for (const e of exceptions) m[e.date] = e;
    return m;
  }, [exceptions]);

  function getCellKind(date: string, hour: number): "off" | "break" | "available" | "session" | "outside" {
    const dow = new Date(date + "T00:00:00").getDay();
    // Check exception first
    const exc = excByDate[date];
    if (exc) {
      if (!exc.is_available) return "off";
      // Override hours
      if (exc.start_time && exc.end_time) {
        const sh = timeToH(exc.start_time);
        const eh = timeToH(exc.end_time);
        if (hour < sh || hour >= eh) return "outside";
        // Check session
        const daySessions = sessionsByDate[date] ?? [];
        const sess = daySessions.find(s => hour >= timeToH(s.start_time) && hour < timeToH(s.end_time));
        if (sess) return "session";
        return "available";
      }
    }
    // Use base rules for that DOW
    const dayRules = rules.filter(r => r.day_of_week === dow);
    const available = dayRules.filter(r => r.is_available);
    if (available.length === 0) return "off";
    const inAvail = available.some(r => hour >= timeToH(r.start_time) && hour < timeToH(r.end_time));
    if (!inAvail) return "outside";
    // Check break
    const breaks = dayRules.filter(r => !r.is_available);
    const inBreak = breaks.some(r => hour >= timeToH(r.start_time) && hour < timeToH(r.end_time));
    if (inBreak) return "break";
    // Check session
    const daySessions = sessionsByDate[date] ?? [];
    const sess = daySessions.find(s => hour >= timeToH(s.start_time) && hour < timeToH(s.end_time));
    if (sess) return "session";
    return "available";
  }

  function getSession(date: string, hour: number): Session | undefined {
    return (sessionsByDate[date] ?? []).find(s => hour >= timeToH(s.start_time) && hour < timeToH(s.end_time));
  }

  function openEditDialog() {
    setDayEdits(rulesТoDayEdits(rules));
    setEditMsg("");
    setEditOpen(true);
  }

  async function saveSchedule() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const newRules = dayEditsToRules(dayEdits);
      const data = await api<{ rules: Rule[]; exceptions: Exception[] }>(
        `/api/admin/coaches/${selectedId}/availability`,
        { method: "PUT", authenticated: true, body: { rules: newRules, message: editMsg || undefined } }
      );
      setRules(data.rules ?? []);
      setExceptions(data.exceptions ?? []);
      toast.success(t("admin.coach.saved"));
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.coach.saveFail"));
    } finally {
      setSaving(false);
    }
  }

  async function saveException() {
    if (!selectedId) return;
    setSavingExc(true);
    try {
      const body = excForm.isOff
        ? { date: excForm.date, isAvailable: false, reason: excForm.reason || undefined }
        : { date: excForm.date, isAvailable: true, startTime: excForm.startTime, endTime: excForm.endTime, reason: excForm.reason || undefined };
      const data = await api<{ exception: Exception }>(
        `/api/admin/coaches/${selectedId}/exceptions`,
        { method: "POST", authenticated: true, body }
      );
      setExceptions(prev => {
        const filtered = prev.filter(e => e.date !== data.exception.date);
        return [...filtered, data.exception];
      });
      toast.success(t("admin.coach.excSaved"));
      setExcOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.coach.excFail"));
    } finally {
      setSavingExc(false);
    }
  }

  async function removeException(exc: Exception) {
    if (!selectedId) return;
    try {
      await api(`/api/admin/coaches/${selectedId}/exceptions/${exc.id}`, { method: "DELETE", authenticated: true });
      setExceptions(prev => prev.filter(e => e.id !== exc.id));
      toast.success(t("admin.coach.excRemoved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.coach.excRemFail"));
    }
  }

  function updateDayEdit(dow: number, patch: Partial<DayEdit>) {
    setDayEdits(prev => prev.map(d => d.dow === dow ? { ...d, ...patch } : d));
  }
  function addBreak(dow: number) {
    setDayEdits(prev => prev.map(d =>
      d.dow === dow ? { ...d, breaks: [...d.breaks, { start: "12:00", end: "13:00" }] } : d
    ));
  }
  function removeBreak(dow: number, idx: number) {
    setDayEdits(prev => prev.map(d =>
      d.dow === dow ? { ...d, breaks: d.breaks.filter((_, i) => i !== idx) } : d
    ));
  }
  function updateBreak(dow: number, idx: number, field: "start" | "end", val: string) {
    setDayEdits(prev => prev.map(d =>
      d.dow === dow ? { ...d, breaks: d.breaks.map((b, i) => i === idx ? { ...b, [field]: val } : b) } : d
    ));
  }

  // Upcoming exceptions for this week
  const weekExceptions = exceptions.filter(e => e.date >= weekStart && e.date <= weekEnd);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-bold">{t("admin.coach.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("admin.coach.subtitle")}</p>
        </div>
      </div>

      {loadingCoaches ? (
        <Skeleton className="h-10 w-64 rounded-xl" />
      ) : coaches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.coach.noCoaches")}</p>
      ) : (
        <>
          {/* Coach selector */}
          <div className="flex flex-wrap gap-2">
            {coaches.map(c => (
              <button key={c.userId} onClick={() => setSelectedId(c.userId)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                  selectedId === c.userId
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                }`}>
                <User size={13} />
                {c.firstName} {c.lastName}
                {c.expertise && <span className="text-[10px] bg-muted/50 rounded px-1.5 py-0.5">{c.expertise}</span>}
              </button>
            ))}
          </div>

          {selectedCoach && (
            <div className="gradient-card rounded-2xl border border-border/50 p-5 space-y-4">
              {/* Coach info + controls */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-bold">{selectedCoach.firstName} {selectedCoach.lastName}</p>
                  <p className="text-xs text-muted-foreground">{selectedCoach.email}{selectedCoach.expertise ? ` · ${selectedCoach.expertise}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Week navigation */}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(w => addDays(w, -7))}>
                    <ChevronLeft size={14} />
                  </Button>
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap">
                    {fmtShort(weekStart)} – {fmtShort(weekEnd)}
                  </span>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(w => addDays(w, 7))}>
                    <ChevronRight size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(mondayOf(today))}>
                    <RefreshCw size={12} />
                  </Button>
                  {/* Actions */}
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openEditDialog}>
                    <Edit2 size={12} /> {t("admin.coach.editBtn")}
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { setExcForm({ date: today, isOff: true, startTime: "08:00", endTime: "22:00", reason: "" }); setExcOpen(true); }}>
                    <CalendarOff size={12} /> {t("admin.coach.addExcBtn")}
                  </Button>
                </div>
              </div>

              {/* Exceptions for this week */}
              {weekExceptions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {weekExceptions.map(exc => (
                    <div key={exc.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                      exc.is_available ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}>
                      <CalendarOff size={10} />
                      <span className="font-medium">{fmtShort(exc.date)}</span>
                      {exc.is_available ? (
                        <span className="text-muted-foreground">{exc.start_time}–{exc.end_time}</span>
                      ) : (
                        <span>{t("admin.coach.dayOff")}</span>
                      )}
                      {exc.reason && <span className="text-muted-foreground">· {exc.reason}</span>}
                      <button onClick={() => removeException(exc)} className="ml-1 hover:text-foreground transition-colors">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Weekly grid */}
              {loadingAvail ? (
                <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className="w-12 text-left text-muted-foreground pb-2 font-normal">{t("admin.court.timeCol")}</th>
                        {weekDays.map(d => {
                          const isToday = d === today;
                          const dow = new Date(d + "T00:00:00").getDay();
                          const exc = excByDate[d];
                          const dayRules = rules.filter(r => r.day_of_week === dow && r.is_available);
                          const isDayOff = exc ? !exc.is_available : dayRules.length === 0;
                          const daySessions = sessionsByDate[d] ?? [];
                          return (
                            <th key={d} className="pb-2 px-1 text-center font-medium min-w-[90px]">
                              <div className={`rounded-lg px-2 py-1 ${isToday ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                                <div className="font-bold">{DOW_LABELS[dow]}</div>
                                <div className={`text-[10px] ${isToday ? "text-primary/70" : "text-muted-foreground/60"}`}>{fmtShort(d)}</div>
                                <div className={`text-[10px] mt-0.5 ${
                                  isDayOff ? "text-red-400/70" :
                                  daySessions.length > 0 ? "text-amber-400" : "text-green-400"
                                }`}>
                                  {isDayOff
                                    ? t("admin.coach.dayOff")
                                    : daySessions.length > 0
                                      ? t("admin.coach.booked").replace("{n}", String(daySessions.length))
                                      : t("admin.coach.available")}
                                </div>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {HOURS.map(hour => (
                        <tr key={hour} className="h-9">
                          <td className="text-muted-foreground/60 text-right pr-2 align-middle tabular-nums">
                            {String(hour).padStart(2, "0")}:00
                          </td>
                          {weekDays.map(d => {
                            const kind = getCellKind(d, hour);
                            const sess = kind === "session" ? getSession(d, hour) : undefined;
                            const isFirst = sess ? timeToH(sess.start_time) === hour : false;
                            return (
                              <td key={d} className="px-0.5 align-middle">
                                {kind === "session" ? (
                                  <div className={`h-8 rounded flex items-center px-1.5 gap-1 overflow-hidden border transition-colors
                                    bg-amber-500/20 border-amber-500/40 group cursor-default relative`}>
                                    {isFirst && (
                                      <>
                                        <User size={9} className="text-amber-400 flex-shrink-0" />
                                        <span className="text-[10px] font-bold text-amber-400 truncate">{sess!.player_name}</span>
                                        {/* Hover tooltip */}
                                        <div className="absolute left-0 top-full mt-1 z-20 hidden group-hover:block bg-popover border border-border rounded-xl px-3 py-2 text-xs shadow-xl min-w-48 pointer-events-none">
                                          <p className="font-bold text-foreground">{sess!.player_name}</p>
                                          <p className="text-muted-foreground text-[11px]">{sess!.player_email}</p>
                                          <p className="text-muted-foreground mt-1">{sess!.start_time} – {sess!.end_time}</p>
                                          {sess!.players_count > 1 && (
                                            <p className="text-muted-foreground">{sess!.players_count} players</p>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ) : kind === "break" ? (
                                  <div className="h-8 rounded flex items-center justify-center border bg-orange-500/10 border-orange-500/20">
                                    <span className="text-[10px] text-orange-400 font-bold">{t("admin.coach.break")}</span>
                                  </div>
                                ) : kind === "available" ? (
                                  <div className="h-8 rounded border bg-green-500/10 border-green-500/20" />
                                ) : kind === "off" ? (
                                  <div className="h-8 rounded border bg-red-500/5 border-red-500/10 flex items-center justify-center">
                                    <span className="text-[9px] text-red-400/50">{t("admin.coach.off")}</span>
                                  </div>
                                ) : (
                                  <div className="h-8 rounded border-transparent" />
                                )}
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
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/30 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-green-500/15 border border-green-500/30" /> {t("admin.coach.legendAvail")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-amber-500/20 border border-amber-500/40" /> {t("admin.coach.legendBooked")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                    <span className="text-[8px] text-orange-400 font-bold">B</span>
                  </span> {t("admin.coach.legendBreak")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-red-500/5 border border-red-500/10" /> {t("admin.coach.legendOff")}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Edit Schedule Dialog ─────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={v => !v && setEditOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock size={15} className="text-primary" />
              {t("admin.coach.editTitle")} — {selectedCoach?.firstName} {selectedCoach?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Day rows */}
            {WEEK_DOWS.map(dow => {
              const day = dayEdits.find(d => d.dow === dow);
              if (!day) return null;
              return (
                <div key={dow} className="rounded-xl border border-border/40 p-3 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="w-24 font-bold text-sm">{DOW_FULL[dow]}</span>
                    {/* Day Off toggle */}
                    <button
                      onClick={() => updateDayEdit(dow, { isOff: !day.isOff })}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                        day.isOff
                          ? "bg-red-500/15 border-red-500/30 text-red-400"
                          : "border-border/50 text-muted-foreground hover:border-border"
                      }`}>
                      <CalendarOff size={11} />
                      {day.isOff ? t("admin.coach.isDayOff") : t("admin.coach.markOff")}
                    </button>
                    {/* Hours */}
                    {!day.isOff && (
                      <div className="flex items-center gap-2">
                        <Input type="time" className="h-8 w-28 text-xs"
                          value={day.startTime} onChange={e => updateDayEdit(dow, { startTime: e.target.value })} />
                        <span className="text-muted-foreground text-xs">{t("admin.coach.to")}</span>
                        <Input type="time" className="h-8 w-28 text-xs"
                          value={day.endTime} onChange={e => updateDayEdit(dow, { endTime: e.target.value })} />
                      </div>
                    )}
                    {/* Add break */}
                    {!day.isOff && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 ml-auto text-muted-foreground hover:text-foreground"
                        onClick={() => addBreak(dow)}>
                        <Plus size={11} /> {t("admin.coach.addBreak")}
                      </Button>
                    )}
                  </div>
                  {/* Breaks */}
                  {!day.isOff && day.breaks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 pl-4">
                      <span className="text-[10px] text-orange-400 font-bold w-12">{t("admin.coach.break")}</span>
                      <Input type="time" className="h-7 w-24 text-xs"
                        value={b.start} onChange={e => updateBreak(dow, i, "start", e.target.value)} />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input type="time" className="h-7 w-24 text-xs"
                        value={b.end} onChange={e => updateBreak(dow, i, "end", e.target.value)} />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                        onClick={() => removeBreak(dow, i)}>
                        <Trash2 size={11} />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Notification message */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <BellRing size={11} /> {t("admin.coach.notifLabel")}
              </label>
              <Input
                placeholder={t("admin.coach.notifPh")}
                value={editMsg}
                onChange={e => setEditMsg(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>{t("admin.cancel")}</Button>
              <Button className="flex-1 glow-yellow" onClick={saveSchedule} disabled={saving}>
                {saving ? <RefreshCw size={13} className="animate-spin" /> : null}
                {t("admin.coach.saveNotify")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Exception Dialog ─────────────────────────────────────────────── */}
      <Dialog open={excOpen} onOpenChange={v => !v && setExcOpen(false)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff size={14} className="text-orange-400" />
              {t("admin.coach.excTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.coach.excDate")}</label>
              <Input type="date" value={excForm.date}
                onChange={e => setExcForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setExcForm(f => ({ ...f, isOff: true }))}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                  excForm.isOff ? "bg-red-500/15 border-red-500/30 text-red-400" : "border-border/50 text-muted-foreground hover:border-border"
                }`}>
                {t("admin.coach.excOff")}
              </button>
              <button onClick={() => setExcForm(f => ({ ...f, isOff: false }))}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                  !excForm.isOff ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "border-border/50 text-muted-foreground hover:border-border"
                }`}>
                {t("admin.coach.excHours")}
              </button>
            </div>
            {!excForm.isOff && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.coach.excStart")}</label>
                  <Input type="time" value={excForm.startTime}
                    onChange={e => setExcForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.coach.excEnd")}</label>
                  <Input type="time" value={excForm.endTime}
                    onChange={e => setExcForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{t("admin.coach.excReason")}</label>
              <Input placeholder={t("admin.coach.excReasonPh")} value={excForm.reason}
                onChange={e => setExcForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setExcOpen(false)}>{t("admin.cancel")}</Button>
              <Button className="flex-1 glow-yellow" onClick={saveException} disabled={savingExc}>
                {savingExc ? <RefreshCw size={13} className="animate-spin" /> : null}
                {t("admin.coach.saveExc")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
