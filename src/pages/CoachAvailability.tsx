import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/i18n/locale";
import { toast } from "sonner";
import {
  CalendarDays, Clock, Plus, Save, Trash2, CheckCircle2,
  CalendarOff, ChevronDown, ChevronUp, AlertCircle, Timer, Zap, Hash,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ApiRule = { dayOfWeek?: number; day_of_week?: number; startTime?: string; start_time?: string; endTime?: string; end_time?: string };
type ApiException = { id?: number; exceptionDate?: string; exception_date?: string; isAvailable?: boolean; is_available?: boolean; startTime?: string; start_time?: string; endTime?: string; end_time?: string; reason?: string | null };
type ApiSessionLimits = { maxSessionsPerDay?: number | null; sessionDurationMinutes?: number; cooldownMinutes?: number };

type BreakSlot = { start: string; end: string };
type DayState = { isOff: boolean; mainStart: string; mainEnd: string; breaks: BreakSlot[] };
type DayStates = Record<number, DayState>;
type SessionLimits = { maxSessionsPerDay: number | null; sessionDurationMinutes: number; cooldownMinutes: number };

type Exception = {
  id?: number;
  exceptionDate: string;
  isAvailable: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

// DOW display order: Mon first
const WEEK_DOWS = [1, 2, 3, 4, 5, 6, 0];
const DAY_KEYS = [
  "coachAvailability.days.0",
  "coachAvailability.days.1",
  "coachAvailability.days.2",
  "coachAvailability.days.3",
  "coachAvailability.days.4",
  "coachAvailability.days.5",
  "coachAvailability.days.6",
];

// Bar display: 06:00–23:00
const BAR_START = 6;
const BAR_TOTAL = 17; // hours shown

const TEMPLATES = [
  { key: "coachAvailability.template.morning",   s: "08:00", e: "12:00" },
  { key: "coachAvailability.template.afternoon", s: "13:00", e: "17:00" },
  { key: "coachAvailability.template.evening",   s: "17:00", e: "22:00" },
  { key: "coachAvailability.template.fullday",   s: "08:00", e: "22:00" },
] as const;

const todayStr = () => new Date().toISOString().split("T")[0];

const DURATION_OPTIONS = [30, 45, 60, 90] as const;
const COOLDOWN_OPTIONS = [0, 15, 30, 45, 60] as const;
const DEFAULT_LIMITS: SessionLimits = { maxSessionsPerDay: null, sessionDurationMinutes: 60, cooldownMinutes: 0 };

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeToH(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

function defaultDayState(): DayState {
  return { isOff: true, mainStart: "08:00", mainEnd: "22:00", breaks: [] };
}

function normalizeDayState(state?: Partial<DayState> | null): DayState {
  const fallback = defaultDayState();
  if (!state) return fallback;
  return {
    isOff: Boolean(state.isOff),
    mainStart: state.mainStart || fallback.mainStart,
    mainEnd: state.mainEnd || fallback.mainEnd,
    breaks: Array.isArray(state.breaks)
      ? state.breaks
          .filter((slot): slot is BreakSlot => Boolean(slot?.start && slot?.end))
          .map((slot) => ({ start: slot.start, end: slot.end }))
      : [],
  };
}

function rulesToDayStates(apiRules: ApiRule[]): DayStates {
  const states: DayStates = {};
  for (let dow = 0; dow <= 6; dow++) {
    const dayRules = apiRules
      .filter(r => (r.dayOfWeek ?? r.day_of_week) === dow)
      .map(r => ({
        startTime: String(r.startTime ?? r.start_time).slice(0, 5),
        endTime: String(r.endTime ?? r.end_time).slice(0, 5),
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (dayRules.length === 0) {
      states[dow] = defaultDayState();
    } else {
      const mainStart = dayRules[0].startTime;
      const mainEnd = dayRules[dayRules.length - 1].endTime;
      const breaks: BreakSlot[] = [];
      for (let i = 0; i < dayRules.length - 1; i++) {
        breaks.push({ start: dayRules[i].endTime, end: dayRules[i + 1].startTime });
      }
      states[dow] = { isOff: false, mainStart, mainEnd, breaks };
    }
  }
  return states;
}

function dayStatesToRules(states: DayStates): { dayOfWeek: number; startTime: string; endTime: string }[] {
  const result: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
  for (let dow = 0; dow <= 6; dow++) {
    const s = normalizeDayState(states[dow]);
    if (!s || s.isOff) continue;
    const sorted = [...s.breaks].sort((a, b) => a.start.localeCompare(b.start));
    if (sorted.length === 0) {
      result.push({ dayOfWeek: dow, startTime: s.mainStart, endTime: s.mainEnd });
    } else {
      let cursor = s.mainStart;
      for (const brk of sorted) {
        if (brk.start > cursor) result.push({ dayOfWeek: dow, startTime: cursor, endTime: brk.start });
        cursor = brk.end;
      }
      if (cursor < s.mainEnd) result.push({ dayOfWeek: dow, startTime: cursor, endTime: s.mainEnd });
    }
  }
  return result;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TimeBar({ state }: { state: DayState }) {
  const safeState = normalizeDayState(state);
  if (safeState.isOff) {
    return <div className="h-3 rounded-full bg-muted/20 border border-dashed border-border/40 mt-2 mb-1" />;
  }
  const mainS = timeToH(safeState.mainStart);
  const mainE = timeToH(safeState.mainEnd);
  const sorted = [...safeState.breaks].sort((a, b) => a.start.localeCompare(b.start));

  type Seg = { size: number; type: "avail" | "break" | "out" };
  const segs: Seg[] = [];

  const clampSize = (s: number, e: number) =>
    Math.max(0, (Math.min(e, BAR_START + BAR_TOTAL) - Math.max(s, BAR_START)) / BAR_TOTAL);

  if (mainS > BAR_START) segs.push({ size: clampSize(BAR_START, mainS), type: "out" });

  let cursor = mainS;
  for (const brk of sorted) {
    const bs = timeToH(brk.start), be = timeToH(brk.end);
    if (bs > cursor) segs.push({ size: clampSize(cursor, bs), type: "avail" });
    segs.push({ size: clampSize(bs, be), type: "break" });
    cursor = be;
  }
  if (cursor < mainE) segs.push({ size: clampSize(cursor, mainE), type: "avail" });
  if (mainE < BAR_START + BAR_TOTAL) segs.push({ size: clampSize(mainE, BAR_START + BAR_TOTAL), type: "out" });

  return (
    <div className="flex h-3 rounded-full overflow-hidden mt-2 mb-1 gap-px">
      {segs.filter(s => s.size > 0).map((s, i) => (
        <div key={i}
          className={s.type === "avail" ? "bg-green-500/50" : s.type === "break" ? "bg-orange-400/50" : "bg-muted/15"}
          style={{ flex: s.size }}
        />
      ))}
    </div>
  );
}

function ExceptionChip({ exc, onRemove }: { exc: Exception; onRemove: () => void }) {
  const { t } = useLocale();
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
      exc.isAvailable
        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
        : "bg-red-500/10 border-red-500/30 text-red-400"
    }`}>
      <CalendarOff size={10} />
      <span className="font-medium">{exc.exceptionDate}</span>
      {exc.isAvailable && exc.startTime && exc.endTime
        ? <span className="text-muted-foreground">{exc.startTime.slice(0,5)}–{exc.endTime.slice(0,5)}</span>
        : <span>{t("coachAvailability.dayOff")}</span>}
      {exc.reason && <span className="text-muted-foreground">· {exc.reason}</span>}
      <button onClick={onRemove} className="ml-1 hover:text-foreground transition-colors">
        <Trash2 size={9} />
      </button>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function CoachAvailability() {
  const { t } = useLocale();
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [dirty, setDirty]                 = useState(false);
  const [dayStates, setDayStates]         = useState<DayStates>({});
  const [exceptions, setExceptions]       = useState<Exception[]>([]);
  const [expanded, setExpanded]           = useState<Record<number, boolean>>({});
  const [sessionLimits, setSessionLimits] = useState<SessionLimits>(DEFAULT_LIMITS);

  // Exception form
  const [excDate, setExcDate]       = useState(todayStr());
  const [excIsOff, setExcIsOff]     = useState(true);
  const [excStart, setExcStart]     = useState("08:00");
  const [excEnd, setExcEnd]         = useState("22:00");
  const [excReason, setExcReason]   = useState("");
  const [savingExc, setSavingExc]   = useState(false);

  useEffect(() => {
    api<{ rules: ApiRule[]; exceptions: ApiException[]; sessionLimits?: ApiSessionLimits }>("/api/coach/availability", { authenticated: true })
      .then(data => {
        setDayStates(rulesToDayStates(data.rules ?? []));
        setExceptions((data.exceptions ?? []).map(e => ({
          id: e.id,
          exceptionDate: String(e.exceptionDate ?? e.exception_date ?? (e as ApiException & { date?: string }).date ?? ""),
          isAvailable: !!(e.isAvailable ?? e.is_available),
          startTime: String(e.startTime ?? e.start_time ?? "").slice(0, 5) || null,
          endTime: String(e.endTime ?? e.end_time ?? "").slice(0, 5) || null,
          reason: e.reason ?? null,
        })));
        if (data.sessionLimits) {
          setSessionLimits({
            maxSessionsPerDay: data.sessionLimits.maxSessionsPerDay ?? null,
            sessionDurationMinutes: data.sessionLimits.sessionDurationMinutes ?? 60,
            cooldownMinutes: data.sessionLimits.cooldownMinutes ?? 0,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const patchDay = useCallback((dow: number, patch: Partial<DayState>) => {
    setDayStates(prev => ({ ...prev, [dow]: { ...normalizeDayState(prev[dow]), ...patch } }));
    setDirty(true);
  }, []);

  const patchBreak = useCallback((dow: number, idx: number, field: "start" | "end", val: string) => {
    setDayStates(prev => {
      const day = normalizeDayState(prev[dow]);
      const breaks = day.breaks.map((b, i) => i === idx ? { ...b, [field]: val } : b);
      return { ...prev, [dow]: { ...day, breaks } };
    });
    setDirty(true);
  }, []);

  const removeBreak = useCallback((dow: number, idx: number) => {
    setDayStates(prev => {
      const day = normalizeDayState(prev[dow]);
      return { ...prev, [dow]: { ...day, breaks: day.breaks.filter((_, i) => i !== idx) } };
    });
    setDirty(true);
  }, []);

  const addBreak = useCallback((dow: number) => {
    setDayStates(prev => {
      const day = normalizeDayState(prev[dow]);
      return { ...prev, [dow]: { ...day, breaks: [...day.breaks, { start: "12:00", end: "13:00" }] } };
    });
    setDirty(true);
  }, []);

  const applyTemplate = useCallback((dow: number, s: string, e: string) => {
    setDayStates(prev => ({ ...prev, [dow]: { isOff: false, mainStart: s, mainEnd: e, breaks: [] } }));
    setDirty(true);
  }, []);

  const copyToWeekdays = useCallback(() => {
    const mon = normalizeDayState(dayStates[1]);
    if (!mon || mon.isOff) { toast.error(t("coachAvailability.setMondayFirst")); return; }
    setDayStates(prev => {
      const next = { ...prev };
      for (const d of [2, 3, 4, 5]) next[d] = { ...mon, breaks: mon.breaks.map(b => ({ ...b })) };
      return next;
    });
    setDirty(true);
  }, [dayStates]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await api<{ sessionLimits?: ApiSessionLimits }>("/api/coach/availability", {
        method: "PUT",
        authenticated: true,
        body: JSON.stringify({ rules: dayStatesToRules(dayStates), sessionLimits }),
      });
      if (data.sessionLimits) {
        setSessionLimits({
          maxSessionsPerDay: data.sessionLimits.maxSessionsPerDay ?? null,
          sessionDurationMinutes: data.sessionLimits.sessionDurationMinutes ?? 60,
          cooldownMinutes: data.sessionLimits.cooldownMinutes ?? 0,
        });
      }
      toast.success(t("coachAvailability.saved"));
      setDirty(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("coachAvailability.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddException = async () => {
    if (!excDate) return;
    setSavingExc(true);
    try {
      const body = excIsOff
        ? { exceptionDate: excDate, isAvailable: false, reason: excReason || undefined }
        : { exceptionDate: excDate, isAvailable: true, startTime: excStart, endTime: excEnd, reason: excReason || undefined };
      const data = await api<{ exception: ApiException }>("/api/coach/availability/exceptions", {
        method: "POST",
        authenticated: true,
        body: JSON.stringify(body),
      });
      const e = data.exception;
      setExceptions(prev => [...prev, {
        id: e.id,
        exceptionDate: String(e.exceptionDate ?? e.exception_date),
        isAvailable: !!(e.isAvailable ?? e.is_available),
        startTime: String(e.startTime ?? e.start_time ?? "").slice(0, 5) || null,
        endTime: String(e.endTime ?? e.end_time ?? "").slice(0, 5) || null,
        reason: e.reason ?? null,
      }]);
      setExcDate(todayStr());
      setExcIsOff(true);
      setExcReason("");
      toast.success(t("coachAvailability.exceptions.add"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("coachAvailability.error"));
    } finally {
      setSavingExc(false);
    }
  };

  const removeException = async (exc: Exception) => {
    if (!exc.id) {
      setExceptions(prev => prev.filter(e => e !== exc));
      return;
    }
    try {
      await api(`/api/coach/availability/exceptions/${exc.id}`, { method: "DELETE", authenticated: true });
      setExceptions(prev => prev.filter(e => e.id !== exc.id));
      toast.success(t("coachAvailability.excRemoved"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("coachAvailability.error"));
    }
  };

  const patchLimits = useCallback((patch: Partial<SessionLimits>) => {
    setSessionLimits(prev => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const stats = useMemo(() => {
    const active = WEEK_DOWS.filter(d => dayStates[d] && !dayStates[d].isOff).length;
    const slots = dayStatesToRules(dayStates).length;
    return { active, slots };
  }, [dayStates]);

  if (loading) {
    return (
      <Layout>
        <div className="container py-10 space-y-5">
          <Skeleton className="h-16 rounded-2xl" />
          <div className="grid lg:grid-cols-2 gap-4">
            {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Top banner */}
      <div className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-lg font-display font-bold leading-tight">{t("coachAvailability.title")}</h1>
              <p className="text-xs text-muted-foreground">{t("coachAvailability.subtitle")}</p>
            </div>
            {dirty && (
              <span className="flex items-center gap-1 text-xs text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded-full px-2 py-0.5">
                <AlertCircle size={10} /> {t("coachAvailability.unsaved")}
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2 glow-yellow h-9">
            <Save className="w-4 h-4" />
            {saving ? "…" : t("coachAvailability.save")}
          </Button>
        </div>
      </div>

      <div className="container py-8 grid xl:grid-cols-[1fr,300px] gap-6 items-start">
        {/* ── Left: days ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Stats + copy button */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-3">
              <div className="gradient-card rounded-xl border border-border/50 px-4 py-2 text-center min-w-[80px]">
                <p className="text-xl font-bold text-green-400">{stats.active}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("coachAvailability.stats.activeDays")}</p>
              </div>
              <div className="gradient-card rounded-xl border border-border/50 px-4 py-2 text-center min-w-[80px]">
                <p className="text-xl font-bold text-primary">{stats.slots}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("coachAvailability.stats.slots")}</p>
              </div>
              <div className="gradient-card rounded-xl border border-border/50 px-4 py-2 text-center min-w-[80px]">
                <p className="text-xl font-bold text-blue-400">{exceptions.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("coachAvailability.exceptions.title")}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={copyToWeekdays} className="ml-auto h-9 text-xs">
              {t("coachAvailability.copyWeekdays")}
            </Button>
          </div>

          {/* Day cards */}
          {WEEK_DOWS.map(dow => {
            const state = normalizeDayState(dayStates[dow]);
            const isExpanded = expanded[dow] ?? false;
            const slotCount = dayStatesToRules({ [dow]: state }).filter(r => r.dayOfWeek === dow).length;

            return (
              <div key={dow} className={`rounded-2xl border transition-colors ${
                state.isOff ? "border-border/30 bg-muted/5" : "border-border/50 gradient-card"
              }`}>
                {/* Day header — always visible */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                  onClick={() => setExpanded(p => ({ ...p, [dow]: !p[dow] }))}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold text-sm ${state.isOff ? "text-muted-foreground" : "text-foreground"}`}>
                        {t(DAY_KEYS[dow])}
                      </span>
                      {state.isOff ? (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 border border-red-400/20 bg-red-400/5 rounded-full px-2 py-0.5">
                          {t("coachAvailability.dayOff")}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-green-400 border border-green-400/20 bg-green-400/5 rounded-full px-2 py-0.5">
                          {state.mainStart}–{state.mainEnd}
                          {state.breaks.length > 0 && `, ${t("coachAvailability.breakCount").replace("{n}", String(state.breaks.length))}`}
                        </span>
                      )}
                    </div>
                    <TimeBar state={state} />
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* On/Off toggle */}
                    <button
                      onClick={e => { e.stopPropagation(); patchDay(dow, { isOff: !state.isOff }); }}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-all ${
                        state.isOff
                          ? "border-border/50 text-muted-foreground hover:border-green-400/30 hover:text-green-400"
                          : "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
                      }`}
                    >
                      {state.isOff ? t("coachAvailability.markActive") : t("coachAvailability.dayOn")}
                    </button>
                    {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && !state.isOff && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
                    {/* Working hours */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <Clock size={11} /> {t("coachAvailability.mainHours")}
                      </p>
                      <div className="flex items-center gap-2">
                        <Input type="time" className="h-9 flex-1 text-sm" value={state.mainStart}
                          onChange={e => patchDay(dow, { mainStart: e.target.value })} />
                        <span className="text-xs text-muted-foreground">{t("coachAvailability.to")}</span>
                        <Input type="time" className="h-9 flex-1 text-sm" value={state.mainEnd}
                          onChange={e => patchDay(dow, { mainEnd: e.target.value })} />
                      </div>
                    </div>

                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATES.map(tmpl => (
                        <button key={tmpl.key}
                          onClick={() => applyTemplate(dow, tmpl.s, tmpl.e)}
                          className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">
                          {t(tmpl.key)}
                        </button>
                      ))}
                    </div>

                    {/* Breaks */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-orange-400/60 inline-block" />
                          {t("coachAvailability.breaks")}
                        </p>
                        <button onClick={() => addBreak(dow)}
                          className="text-[11px] text-primary hover:text-primary/70 transition-colors font-medium">
                          {t("coachAvailability.addBreak")}
                        </button>
                      </div>
                      {state.breaks.length === 0 ? (
                        <p className="text-xs text-muted-foreground/50 italic">{t("coachAvailability.noBreaks")}</p>
                      ) : (
                        <div className="space-y-2">
                          {state.breaks.map((brk, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-[10px] text-orange-400 font-bold w-10 flex-shrink-0">
                                {t("coachAvailability.breakLabel")}
                              </span>
                              <Input type="time" className="h-8 flex-1 text-xs" value={brk.start}
                                onChange={e => patchBreak(dow, i, "start", e.target.value)} />
                              <span className="text-xs text-muted-foreground">–</span>
                              <Input type="time" className="h-8 flex-1 text-xs" value={brk.end}
                                onChange={e => patchBreak(dow, i, "end", e.target.value)} />
                              <button onClick={() => removeBreak(dow, i)}
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-red-400 hover:border-red-400/30 transition-colors flex-shrink-0">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Collapsed "click to expand" hint when day is active */}
                {!isExpanded && !state.isOff && (
                  <div className="px-4 pb-2">
                    <p className="text-[11px] text-muted-foreground/40">
                      {slotCount > 0 && `${t("coachAvailability.slotCountWithNumber").replace("{n}", String(slotCount))} - `}
                      {t("coachAvailability.clickToEdit")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right: exceptions panel ────────────────────────────────────── */}
        <aside className="space-y-4 sticky top-20">
          {/* Week preview */}
          <div className="gradient-card rounded-2xl border border-border/50 p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              {t("coachAvailability.weeklyTitle")}
            </h3>
            <div className="grid grid-cols-7 gap-0.5">
              {WEEK_DOWS.map(dow => {
                const state = normalizeDayState(dayStates[dow]);
                return (
                  <div key={dow} className="flex flex-col items-center gap-1">
                    <span className="text-[9px] text-muted-foreground font-bold uppercase">
                      {t(DAY_KEYS[dow]).slice(0, 2)}
                    </span>
                    <div className={`w-full rounded h-16 flex flex-col overflow-hidden gap-px ${state.isOff ? "bg-muted/10 border border-dashed border-border/30" : "bg-green-500/10 border border-green-500/20"}`}>
                      {!state.isOff && (
                        <>
                          {/* Mini visual: one px row per slot */}
                          <div className="flex-1 flex flex-col gap-px p-0.5">
                            {dayStatesToRules({ [dow]: state }).filter(r => r.dayOfWeek === dow).map((r, i) => (
                              <div key={i} className="flex-1 rounded-sm bg-green-500/40 min-h-[2px]" />
                            ))}
                            {state.breaks.map((_, i) => (
                              <div key={`b${i}`} className="flex-1 rounded-sm bg-orange-400/30 min-h-[2px]" />
                            ))}
                          </div>
                          <p className="text-[8px] text-center text-green-400/70 pb-0.5 leading-none">{state.mainStart.slice(0,5)}</p>
                        </>
                      )}
                      {state.isOff && (
                        <div className="flex-1 flex items-center justify-center">
                          <span className="text-[8px] text-red-400/40 font-bold">{t("coachAvailability.offShort")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500/40" /> {t("coachAvailability.available")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-400/30" /> {t("coachAvailability.breakLabel")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-muted/20 border border-dashed border-border/30" /> {t("coachAvailability.offShort")}</span>
            </div>
          </div>

          {/* Exceptions */}
          <div className="gradient-card rounded-2xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarOff size={13} className="text-primary" />
              <h3 className="text-sm font-semibold">{t("coachAvailability.exceptions.title")}</h3>
            </div>
            <p className="text-xs text-muted-foreground">{t("coachAvailability.exceptionsHint")}</p>

            {exceptions.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto">
                {exceptions.map((exc, i) => (
                  <ExceptionChip key={exc.id ?? i} exc={exc} onRemove={() => removeException(exc)} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">{t("coachAvailability.noExceptions")}</p>
            )}

            <div className="border-t border-border/30 pt-3 space-y-3">
              <p className="text-xs font-bold text-foreground">{t("coachAvailability.exceptions.add")}</p>

              {/* Date */}
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">{t("coachAvailability.exceptions.date")}</label>
                <Input type="date" value={excDate} min={todayStr()}
                  onChange={e => setExcDate(e.target.value)} className="h-9 text-sm" />
              </div>

              {/* Type toggle */}
              <div className="flex gap-2">
                <button onClick={() => setExcIsOff(true)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all ${
                    excIsOff ? "bg-red-500/15 border-red-500/30 text-red-400" : "border-border/50 text-muted-foreground hover:border-border"
                  }`}>
                  {t("coachAvailability.excOff")}
                </button>
                <button onClick={() => setExcIsOff(false)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all ${
                    !excIsOff ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "border-border/50 text-muted-foreground hover:border-border"
                  }`}>
                  {t("coachAvailability.excHours")}
                </button>
              </div>

              {/* Changed hours */}
              {!excIsOff && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">{t("coachAvailability.excStart")}</label>
                    <Input type="time" value={excStart} onChange={e => setExcStart(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">{t("coachAvailability.excEnd")}</label>
                    <Input type="time" value={excEnd} onChange={e => setExcEnd(e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">{t("coachAvailability.exceptions.reason")}</label>
                <Input value={excReason} onChange={e => setExcReason(e.target.value)}
                  placeholder={t("coachAvailability.exceptions.reasonPh")} className="h-9 text-sm" />
              </div>

              <Button onClick={handleAddException} disabled={savingExc} className="w-full gap-2 h-9 glow-yellow">
                <Plus size={13} />
                {savingExc ? "…" : t("coachAvailability.exceptions.add")}
              </Button>
            </div>
          </div>

          {/* Legend */}
          <div className="gradient-card rounded-2xl border border-border/50 p-4 space-y-2 text-xs">
            <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">{t("coachAvailability.legend.title")}</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500/40" />
                <span className="text-muted-foreground">{t("coachAvailability.legend.available")}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-400/50" />
                <span className="text-muted-foreground">{t("coachAvailability.legend.break")}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-primary" />
                <span className="text-muted-foreground">{t("coachAvailability.legend.visible")}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Layout>
  );
}
