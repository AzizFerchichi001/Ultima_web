import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocale } from "@/i18n/locale";
import {
  Activity,
  Bell,
  BookOpenText,
  Brain,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ChevronRight,
  CircleDollarSign,
  Clock,
  FileText,
  Inbox,
  LayoutDashboard,
  Menu,
  MessageSquare,
  NotebookPen,
  PlayCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  Video,
  X,
} from "lucide-react";

type Student = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  rankingScore?: number;
  matchesPlayed?: number;
  wins?: number;
  losses?: number;
};

type CoachSession = {
  id: number;
  title?: string;
  sessionType?: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string | null;
  court?: { id: number; name: string; arenaName: string };
  students?: Array<{ id: number; firstName: string; lastName: string; email?: string }>;
};

type CoachingRequest = {
  id: number;
  playerName: string | null;
  requestedDate: string;
  requestedStartTime: string;
  requestedEndTime: string;
  playersCount: number;
  status: string;
  message?: string | null;
};

type AvailabilityRule = { dayOfWeek?: number; day_of_week?: number; startTime?: string; start_time?: string; endTime?: string; end_time?: string };
type AvailabilityException = { id?: number; date?: string; exceptionDate?: string; exception_date?: string; reason?: string | null; isAvailable?: boolean; is_available?: boolean };

type NotificationItem = { id: number; title: string; body: string; readAt: string | null; linkUrl?: string | null; createdAt?: string };
type LiveSession = { id: number; status: string; courtName?: string | null; arenaName?: string | null; fps?: number | null; aiStatusMessage?: string | null; lastUpdateAt?: string | null };
type Competition = { id: number; name: string; sport?: string; start_date?: string; startDate?: string; location?: string; status?: string; participants?: number };
type AiReview = {
  id: number;
  playerUserId?: number;
  playerName?: string | null;
  originalFilename?: string;
  status: string;
  createdAt?: string;
  sharedAt?: string | null;
  job?: { status?: string; currentStep?: string; renderedVideoPath?: string | null; ballTracksPath?: string | null; playerTracksPath?: string | null };
};
type CoachNote = { id: number; category: string; body: string; relatedType?: string | null; relatedId?: number | null; createdAt?: string };
type PaymentsSummary = { paidSessions: number; cancelledSessions: number; refundedSessions: number; estimatedEarnings: number | null; currency: string };

type CoachBundle = {
  students: Student[];
  sessions: CoachSession[];
  coachingSessions: CoachSession[];
  requests: CoachingRequest[];
  availability: { rules: AvailabilityRule[]; exceptions: AvailabilityException[] };
  notifications: NotificationItem[];
  liveSessions: LiveSession[];
  competitions: Competition[];
  aiReviews: AiReview[];
  notes: CoachNote[];
  payments: PaymentsSummary;
};

const sections = [
  { id: "overview", key: "coachWorkspace.nav.overview", icon: LayoutDashboard },
  { id: "schedule", key: "coachWorkspace.nav.schedule", icon: CalendarDays },
  { id: "sessions", key: "coachWorkspace.nav.sessions", icon: CalendarCheck },
  { id: "players", key: "coachWorkspace.nav.players", icon: Users },
  { id: "ai", key: "coachWorkspace.nav.ai", icon: Brain },
  { id: "live", key: "coachWorkspace.nav.live", icon: Video },
  { id: "competitions", key: "coachWorkspace.nav.competitions", icon: Trophy },
  { id: "notes", key: "coachWorkspace.nav.notes", icon: NotebookPen },
  { id: "notifications", key: "coachWorkspace.nav.notifications", icon: Bell },
  { id: "payments", key: "coachWorkspace.nav.payments", icon: CircleDollarSign },
  { id: "settings", key: "coachWorkspace.nav.settings", icon: Settings },
] as const;

const noteCategories = ["positioning", "technique", "defense", "attack", "movement", "fitness", "tactical", "other"];
const statusTone: Record<string, string> = {
  scheduled: "border-blue-400/30 bg-blue-400/10 text-blue-300",
  confirmed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  completed: "border-muted bg-muted/30 text-muted-foreground",
  cancelled: "border-red-400/30 bg-red-400/10 text-red-300",
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  running: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  starting: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  error: "border-red-400/30 bg-red-400/10 text-red-300",
  done: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  processing: "border-blue-400/30 bg-blue-400/10 text-blue-300",
};

const today = new Date().toISOString().slice(0, 10);
const dayKeys = ["coachAvailability.days.0", "coachAvailability.days.1", "coachAvailability.days.2", "coachAvailability.days.3", "coachAvailability.days.4", "coachAvailability.days.5", "coachAvailability.days.6"];
const weekDows = [1, 2, 3, 4, 5, 6, 0];
const barStart = 6;
const barTotal = 17;

function Badge({ value }: { value: string }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusTone[value] ?? "border-border bg-muted/20 text-muted-foreground"}`}>{value}</span>;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Inbox; title: string; text?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/5 px-4 py-10 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="font-semibold text-sm">{title}</p>
      {text && <p className="mt-1 text-xs text-muted-foreground">{text}</p>}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string | number; hint?: string }) {
  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-display font-bold">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon size={18} /></div>
      </div>
    </div>
  );
}

function timeToHour(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) + (minutes || 0) / 60;
}

function normalizeRule(rule: AvailabilityRule) {
  return {
    startTime: String(rule.startTime ?? rule.start_time ?? "").slice(0, 5),
    endTime: String(rule.endTime ?? rule.end_time ?? "").slice(0, 5),
  };
}

function ScheduleTimeBar({ rules }: { rules: Array<{ startTime: string; endTime: string }> }) {
  if (!rules.length) {
    return <div className="mt-3 h-3 rounded-full border border-dashed border-border/40 bg-muted/20" />;
  }

  const sorted = [...rules].sort((a, b) => a.startTime.localeCompare(b.startTime));
  type Segment = { start: number; end: number; type: "available" | "break" | "out" };
  const segments: Segment[] = [];
  const clamp = (v: number) => Math.min(barStart + barTotal, Math.max(barStart, v));
  const firstStart = timeToHour(sorted[0].startTime);
  const lastEnd = timeToHour(sorted[sorted.length - 1].endTime);
  if (firstStart > barStart) segments.push({ start: barStart, end: firstStart, type: "out" });
  sorted.forEach((rule, index) => {
    const start = timeToHour(rule.startTime);
    const end = timeToHour(rule.endTime);
    if (index > 0) {
      const previousEnd = timeToHour(sorted[index - 1].endTime);
      if (start > previousEnd) segments.push({ start: previousEnd, end: start, type: "break" });
    }
    segments.push({ start, end, type: "available" });
  });
  if (lastEnd < barStart + barTotal) segments.push({ start: lastEnd, end: barStart + barTotal, type: "out" });

  return (
    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted/20">
      {segments.map((segment, index) => {
        const size = Math.max(0, (clamp(segment.end) - clamp(segment.start)) / barTotal);
        if (size <= 0) return null;
        const cls = segment.type === "available" ? "bg-green-500/60" : segment.type === "break" ? "bg-orange-400/60" : "bg-muted/25";
        return <div key={index} className={cls} style={{ flex: size }} />;
      })}
    </div>
  );
}

export default function Coach() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const user = getSessionUser();
  const [active, setActive] = useState<(typeof sections)[number]["id"]>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [bundle, setBundle] = useState<CoachBundle | null>(null);
  const [noteForm, setNoteForm] = useState({ category: "technique", body: "" });
  const [savingNote, setSavingNote] = useState(false);
  const [selectedReview, setSelectedReview] = useState<AiReview | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<CoachBundle>("/api/coach/dashboard", { authenticated: true });
      setBundle(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("coach.desk.loadError"));
      setBundle({
        students: [], sessions: [], coachingSessions: [], requests: [], availability: { rules: [], exceptions: [] },
        notifications: [], liveSessions: [], competitions: [], aiReviews: [], notes: [],
        payments: { paidSessions: 0, cancelledSessions: 0, refundedSessions: 0, estimatedEarnings: null, currency: "TND" },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const data = bundle;
  const sessions = data?.sessions ?? [];
  const requests = data?.requests ?? [];
  const students = data?.students ?? [];
  const upcoming = sessions.filter((s) => s.reservationDate >= today && !["cancelled", "completed"].includes(s.status));
  const todaysSessions = sessions.filter((s) => s.reservationDate === today && s.status !== "cancelled");
  const cancelled = sessions.filter((s) => s.status === "cancelled");
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const pendingReviews = (data?.aiReviews ?? []).filter((r) => !["done", "completed", "reviewed"].includes(r.status));
  const unreadNotifications = (data?.notifications ?? []).filter((n) => !n.readAt);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => `${s.firstName} ${s.lastName} ${s.email}`.toLowerCase().includes(q));
  }, [students, search]);

  const saveNote = async () => {
    if (!noteForm.body.trim()) return;
    setSavingNote(true);
    try {
      await api("/api/coach/notes", { method: "POST", authenticated: true, body: JSON.stringify(noteForm) });
      setNoteForm((f) => ({ ...f, body: "" }));
      toast.success(t("coachWorkspace.notes.saved"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("coachWorkspace.notes.saveError"));
    } finally {
      setSavingNote(false);
    }
  };

  if (!user || !["coach", "admin", "super_admin"].includes(user.role)) {
    return (
      <Layout>
        <div className="container py-24 text-center text-muted-foreground">{t("coach.desk.accessDenied")}</div>
      </Layout>
    );
  }

  const nav = (
    <aside className="gradient-card h-full rounded-2xl border border-border/60 p-3">
      <div className="mb-4 px-2">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("coachWorkspace.sideLabel")}</p>
        <h2 className="mt-1 text-lg font-display font-bold">{t("coachWorkspace.title")}</h2>
      </div>
      <div className="space-y-1">
        {sections.map(({ id, key, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setActive(id); setMobileOpen(false); }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              active === id ? "bg-primary text-background shadow-sm" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <Icon size={16} />
            <span className="min-w-0 flex-1 truncate">{t(key)}</span>
          </button>
        ))}
      </div>
    </aside>
  );

  return (
    <Layout>
      <div className="container py-6 lg:py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold text-gradient uppercase tracking-tighter">{t("coachWorkspace.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("coachWorkspace.subtitle")}</p>
          </div>
          <Button variant="outline" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("coachWorkspace.openMenu")}>
            <Menu size={16} />
          </Button>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 bg-background/80 p-4 backdrop-blur lg:hidden">
            <div className="mb-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setMobileOpen(false)}><X size={18} /></Button>
            </div>
            {nav}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[260px,1fr]">
          <div className="hidden lg:block lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)]">{nav}</div>
          <main className="min-w-0 space-y-5">
            {loading ? (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
                <Skeleton className="h-96 rounded-2xl" />
              </div>
            ) : (
              <>
                {active === "overview" && (
                  <div className="space-y-5">
                    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <Kpi icon={CalendarClock} label={t("coachWorkspace.kpi.today")} value={todaysSessions.length} hint={t("coachWorkspace.kpi.todayHint")} />
                      <Kpi icon={CalendarCheck} label={t("coachWorkspace.kpi.upcoming")} value={upcoming.length} />
                      <Kpi icon={Inbox} label={t("coachWorkspace.kpi.requests")} value={pendingRequests.length} />
                      <Kpi icon={Brain} label={t("coachWorkspace.kpi.aiPending")} value={pendingReviews.length} />
                    </div>
                    <div className="grid xl:grid-cols-3 gap-4">
                      <Panel title={t("coachWorkspace.overview.today")} icon={Clock}>
                        {todaysSessions.length ? todaysSessions.slice(0, 4).map((s) => <SessionRow key={s.id} session={s} />) : <EmptyState icon={CalendarCheck} title={t("coachWorkspace.empty.noSessionsToday")} />}
                      </Panel>
                      <Panel title={t("coachWorkspace.overview.uploads")} icon={Sparkles}>
                        {(data?.aiReviews ?? []).length ? (data?.aiReviews ?? []).slice(0, 4).map((r) => <AiRow key={r.id} review={r} />) : <EmptyState icon={Brain} title={t("coachWorkspace.empty.noAi")} />}
                      </Panel>
                      <Panel title={t("coachWorkspace.overview.notifications")} icon={Bell}>
                        {unreadNotifications.length ? unreadNotifications.slice(0, 4).map((n) => <NotificationRow key={n.id} item={n} onOpen={() => n.linkUrl && navigate(n.linkUrl)} />) : <EmptyState icon={Bell} title={t("coachWorkspace.empty.noNotifications")} />}
                      </Panel>
                    </div>
                    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <Kpi icon={X} label={t("coachWorkspace.kpi.cancelled")} value={cancelled.length} />
                      <Kpi icon={Video} label={t("coachWorkspace.kpi.live")} value={(data?.liveSessions ?? []).filter((s) => ["running", "starting"].includes(s.status)).length} />
                      <Kpi icon={Users} label={t("coachWorkspace.kpi.players")} value={students.length} />
                      <Kpi icon={Bell} label={t("coachWorkspace.kpi.notifications")} value={unreadNotifications.length} />
                    </div>
                  </div>
                )}

                {active === "schedule" && (
                  <div className="space-y-4">
                    <SectionHeader title={t("coachWorkspace.schedule.title")} text={t("coachWorkspace.schedule.text")} action={<Link to="/coach/availability"><Button className="gap-2"><Plus size={14} />{t("coachWorkspace.schedule.manage")}</Button></Link>} />
                    <div className="grid xl:grid-cols-[1fr,320px] gap-4 items-start">
                      <div className="space-y-3">
                        {(data?.availability.rules ?? []).length ? weekDows.map((dow) => {
                          const rules = (data?.availability.rules ?? [])
                            .filter((r) => (r.dayOfWeek ?? r.day_of_week) === dow)
                            .map(normalizeRule)
                            .filter((r) => r.startTime && r.endTime);
                          const isClosed = rules.length === 0;
                          return (
                            <div key={dow} className={`rounded-2xl border p-4 transition-colors ${isClosed ? "border-border/30 bg-muted/5" : "gradient-card border-border/50"}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-bold text-sm ${isClosed ? "text-muted-foreground" : "text-foreground"}`}>{t(dayKeys[dow])}</p>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                                      isClosed ? "border-red-400/20 bg-red-400/5 text-red-300/80" : "border-green-400/25 bg-green-400/10 text-green-300"
                                    }`}>
                                      {isClosed ? t("coachAvailability.dayOff") : `${rules[0].startTime}-${rules[rules.length - 1].endTime}`}
                                    </span>
                                    {!isClosed && rules.length > 1 && (
                                      <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-orange-300">
                                        {rules.length - 1} {t("coachAvailability.breaks")}
                                      </span>
                                    )}
                                  </div>
                                  <ScheduleTimeBar rules={rules} />
                                </div>
                                <CalendarDays className={isClosed ? "text-muted-foreground/40" : "text-primary"} size={18} />
                              </div>
                              {!isClosed && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {rules.map((rule, index) => (
                                    <span key={index} className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-xs text-emerald-300">
                                      {rule.startTime} - {rule.endTime}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }) : <EmptyState icon={CalendarDays} title={t("coachWorkspace.schedule.empty")} text={t("coachWorkspace.schedule.emptyText")} />}
                      </div>
                      <aside className="space-y-4 xl:sticky xl:top-24">
                        <div className="gradient-card rounded-2xl border border-border/50 p-4">
                          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("coachAvailability.weeklyTitle")}</h3>
                          <div className="grid grid-cols-7 gap-1">
                            {weekDows.map((dow) => {
                              const rules = (data?.availability.rules ?? [])
                                .filter((r) => (r.dayOfWeek ?? r.day_of_week) === dow)
                                .map(normalizeRule)
                                .filter((r) => r.startTime && r.endTime);
                              return (
                                <div key={dow} className="flex flex-col items-center gap-1">
                                  <span className="text-[9px] font-bold uppercase text-muted-foreground">{t(dayKeys[dow]).slice(0, 2)}</span>
                                  <div className={`flex h-16 w-full flex-col gap-px overflow-hidden rounded border ${rules.length ? "border-green-500/20 bg-green-500/10 p-1" : "border-dashed border-border/40 bg-muted/10"}`}>
                                    {rules.length ? rules.map((_, index) => <div key={index} className="min-h-[4px] flex-1 rounded-sm bg-green-500/45" />) : <div className="flex h-full items-center justify-center text-[8px] font-bold text-red-300/50">OFF</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-green-500/50" />{t("admin.coach.legendAvail")}</span>
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-orange-400/60" />{t("admin.coach.legendBreak")}</span>
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded border border-dashed border-border" />{t("admin.coach.legendOff")}</span>
                          </div>
                        </div>
                        <Panel title={t("coachWorkspace.schedule.exceptions")} icon={CalendarOff}>
                          {(data?.availability.exceptions ?? []).length ? (data?.availability.exceptions ?? []).map((e, i) => (
                            <div key={e.id ?? i} className="rounded-xl border border-border/50 p-3 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold">{String(e.date ?? e.exceptionDate ?? e.exception_date).slice(0, 10)}</span>
                                <Badge value={(e.isAvailable ?? e.is_available) ? t("coachAvailability.available") : t("coachAvailability.unavailable")} />
                              </div>
                              {e.reason && <p className="mt-1 text-xs text-muted-foreground">{e.reason}</p>}
                            </div>
                          )) : <EmptyState icon={CalendarOff} title={t("coachAvailability.noExceptions")} />}
                        </Panel>
                      </aside>
                    </div>
                  </div>
                )}

                {active === "sessions" && (
                  <div className="space-y-4">
                    <SectionHeader title={t("coachWorkspace.sessions.title")} text={t("coachWorkspace.sessions.text")} />
                    <div className="grid xl:grid-cols-3 gap-4">
                      <SessionList title={t("coachWorkspace.sessions.upcoming")} items={upcoming} />
                      <SessionList title={t("coachWorkspace.sessions.completed")} items={sessions.filter((s) => s.status === "completed")} />
                      <SessionList title={t("coachWorkspace.sessions.cancelled")} items={cancelled} />
                    </div>
                    <Panel title={t("coachWorkspace.sessions.requests")} icon={Inbox}>
                      {requests.length ? requests.map((r) => <RequestRow key={r.id} req={r} />) : <EmptyState icon={Inbox} title={t("coachRequests.empty")} />}
                    </Panel>
                  </div>
                )}

                {active === "players" && (
                  <div className="space-y-4">
                    <SectionHeader title={t("coachWorkspace.players.title")} text={t("coachWorkspace.players.text")} action={<Link to="/coach/requests"><Button variant="outline">{t("coachWorkspace.players.requests")}</Button></Link>} />
                    <div className="relative max-w-md">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input className="pl-9" placeholder={t("coachWorkspace.players.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredPlayers.length ? filteredPlayers.map((p) => <PlayerCard key={p.id} player={p} t={t} />) : <EmptyState icon={Users} title={t("coach.desk.noStudents")} />}
                    </div>
                  </div>
                )}

                {active === "ai" && (
                  <div className="space-y-4">
                    <SectionHeader title={t("coachWorkspace.ai.title")} text={t("coachWorkspace.ai.text")} />
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {(data?.aiReviews ?? []).length ? (data?.aiReviews ?? []).map((r) => <AiCard key={r.id} review={r} t={t} onOpen={() => setSelectedReview(r)} />) : <EmptyState icon={Brain} title={t("coachWorkspace.empty.noAi")} />}
                    </div>
                  </div>
                )}

                {active === "live" && (
                  <div className="space-y-4">
                    <SectionHeader title={t("coachWorkspace.live.title")} text={t("coachWorkspace.live.text")} />
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {(data?.liveSessions ?? []).length ? (data?.liveSessions ?? []).map((s) => (
                        <div key={s.id} className="gradient-card rounded-2xl border border-border/50 p-4">
                          <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{s.courtName || t("coachWorkspace.live.court")}</p><p className="text-xs text-muted-foreground">{s.arenaName}</p></div><Badge value={s.status} /></div>
                          <p className="mt-3 text-xs text-muted-foreground">{t("coachWorkspace.live.aiStatus")}: {s.aiStatusMessage || t("coachWorkspace.common.notAvailable")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t("coachWorkspace.live.fps")}: {s.fps ?? t("coachWorkspace.common.notAvailable")}</p>
                          <Link to={`/live-sessions/${s.id}`}><Button size="sm" variant="outline" className="mt-4 gap-2"><PlayCircle size={14} />{t("coachWorkspace.live.open")}</Button></Link>
                        </div>
                      )) : <EmptyState icon={Video} title={t("coachWorkspace.empty.noLive")} />}
                    </div>
                  </div>
                )}

                {active === "competitions" && (
                  <div className="space-y-4">
                    <SectionHeader title={t("coachWorkspace.competitions.title")} text={t("coachWorkspace.competitions.text")} />
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {(data?.competitions ?? []).length ? (data?.competitions ?? []).map((c) => (
                        <div key={c.id} className="gradient-card rounded-2xl border border-border/50 p-4">
                          <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{c.name}</p><p className="text-xs text-muted-foreground">{c.location || c.sport}</p></div>{c.status && <Badge value={c.status} />}</div>
                          <p className="mt-3 text-xs text-muted-foreground">{String(c.start_date ?? c.startDate ?? "").slice(0, 10)}</p>
                          <Link to={`/competitions/${c.id}`}><Button size="sm" variant="outline" className="mt-4">{t("coachWorkspace.competitions.open")}</Button></Link>
                        </div>
                      )) : <EmptyState icon={Trophy} title={t("coachWorkspace.empty.noCompetitions")} />}
                    </div>
                  </div>
                )}

                {active === "notes" && (
                  <div className="space-y-4">
                    <SectionHeader title={t("coachWorkspace.notes.title")} text={t("coachWorkspace.notes.text")} />
                    <div className="grid xl:grid-cols-[360px,1fr] gap-4">
                      <Panel title={t("coachWorkspace.notes.add")} icon={NotebookPen}>
                        <select className="mb-3 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={noteForm.category} onChange={(e) => setNoteForm((f) => ({ ...f, category: e.target.value }))}>
                          {noteCategories.map((c) => <option key={c} value={c}>{t(`coachWorkspace.notes.cat.${c}`)}</option>)}
                        </select>
                        <Textarea value={noteForm.body} onChange={(e) => setNoteForm((f) => ({ ...f, body: e.target.value }))} placeholder={t("coachWorkspace.notes.placeholder")} rows={5} />
                        <Button className="mt-3 w-full" disabled={savingNote || !noteForm.body.trim()} onClick={() => void saveNote()}>{savingNote ? t("coachWorkspace.common.saving") : t("coachWorkspace.notes.save")}</Button>
                      </Panel>
                      <Panel title={t("coachWorkspace.notes.recent")} icon={FileText}>
                        {(data?.notes ?? []).length ? (data?.notes ?? []).map((n) => <div key={n.id} className="rounded-xl border border-border/50 p-3"><Badge value={t(`coachWorkspace.notes.cat.${n.category}`)} /><p className="mt-2 text-sm">{n.body}</p><p className="mt-2 text-xs text-muted-foreground">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}</p></div>) : <EmptyState icon={FileText} title={t("coachWorkspace.empty.noNotes")} />}
                      </Panel>
                    </div>
                  </div>
                )}

                {active === "notifications" && (
                  <Panel title={t("coachWorkspace.notifications.title")} icon={Bell}>
                    {(data?.notifications ?? []).length ? (data?.notifications ?? []).map((n) => <NotificationRow key={n.id} item={n} onOpen={() => n.linkUrl && navigate(n.linkUrl)} />) : <EmptyState icon={Bell} title={t("notifications.empty")} />}
                  </Panel>
                )}

                {active === "payments" && (
                  <div className="space-y-4">
                    <SectionHeader title={t("coachWorkspace.payments.title")} text={t("coachWorkspace.payments.text")} />
                    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <Kpi icon={CircleDollarSign} label={t("coachWorkspace.payments.estimated")} value={data?.payments.estimatedEarnings === null ? t("coachWorkspace.common.notAvailable") : `${data?.payments.estimatedEarnings} ${data?.payments.currency}`} />
                      <Kpi icon={CalendarCheck} label={t("coachWorkspace.payments.paid")} value={data?.payments.paidSessions ?? 0} />
                      <Kpi icon={X} label={t("coachWorkspace.payments.cancelled")} value={data?.payments.cancelledSessions ?? 0} />
                      <Kpi icon={Activity} label={t("coachWorkspace.payments.refunded")} value={data?.payments.refundedSessions ?? 0} />
                    </div>
                    {data?.payments.estimatedEarnings === null && <EmptyState icon={CircleDollarSign} title={t("coachWorkspace.empty.noPayments")} />}
                  </div>
                )}

                {active === "settings" && (
                  <div className="grid md:grid-cols-3 gap-3">
                    <SettingsLink to="/coach/profile" icon={UserCheck} title={t("coach.desk.editProfile")} text={t("coachWorkspace.settings.profile")} />
                    <SettingsLink to="/coach/availability" icon={CalendarDays} title={t("coach.desk.mySchedule")} text={t("coachWorkspace.settings.availability")} />
                    <SettingsLink to="/coach/requests" icon={Inbox} title={t("coach.desk.requests")} text={t("coachWorkspace.settings.requests")} />
                  </div>
                )}
              </>
            )}
          </main>
        </div>
        {selectedReview && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur sm:items-center">
            <div className="gradient-card w-full max-w-xl rounded-2xl border border-border p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("coachWorkspace.ai.title")}</p>
                  <h3 className="mt-1 truncate text-xl font-display font-bold">{selectedReview.originalFilename || `#${selectedReview.id}`}</h3>
                  <p className="text-sm text-muted-foreground">{selectedReview.playerName || t("coachWorkspace.ai.assignedPlayer")}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedReview(null)}><X size={16} /></Button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-background/35 p-3">
                  <p className="text-xs text-muted-foreground">{t("coachWorkspace.ai.jobStatus")}</p>
                  <div className="mt-2"><Badge value={selectedReview.job?.status || selectedReview.status} /></div>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/35 p-3">
                  <p className="text-xs text-muted-foreground">{t("coachWorkspace.ai.currentStep")}</p>
                  <p className="mt-1 text-sm font-semibold">{selectedReview.job?.currentStep || t("coachWorkspace.common.notAvailable")}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/35 p-3">
                  <p className="text-xs text-muted-foreground">{t("coachWorkspace.ai.minimap")}</p>
                  <p className="mt-1 text-sm font-semibold">{selectedReview.job?.renderedVideoPath ? t("coachWorkspace.common.available") : t("coachWorkspace.common.notAvailable")}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background/35 p-3">
                  <p className="text-xs text-muted-foreground">{t("coachWorkspace.ai.tracking")}</p>
                  <p className="mt-1 text-sm font-semibold">{selectedReview.job?.playerTracksPath || selectedReview.job?.ballTracksPath ? t("coachWorkspace.common.available") : t("coachWorkspace.common.notAvailable")}</p>
                </div>
              </div>
              <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{t("coachWorkspace.ai.noFinalScoring")}</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Inbox; children: React.ReactNode }) {
  return (
    <section className="gradient-card rounded-2xl border border-border/50 p-4">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground"><Icon size={14} />{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SectionHeader({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-2xl font-display font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  );
}

function SessionRow({ session }: { session: CoachSession }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/35 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{session.title || session.sessionType}</p><p className="text-xs text-muted-foreground">{session.court?.name} · {session.court?.arenaName}</p></div>
        <Badge value={session.status} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{session.reservationDate} · {session.startTime} - {session.endTime}</p>
    </div>
  );
}

function SessionList({ title, items }: { title: string; items: CoachSession[] }) {
  return (
    <Panel title={title} icon={CalendarCheck}>
      {items.length ? items.map((s) => <SessionRow key={s.id} session={s} />) : <EmptyState icon={CalendarCheck} title={title} />}
    </Panel>
  );
}

function PlayerCard({ player, t }: { player: Student; t: (key: string) => string }) {
  const recent = (player.wins ?? 0) + (player.losses ?? 0);
  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{player.firstName?.[0]}{player.lastName?.[0]}</div>
        <div className="min-w-0 flex-1"><p className="truncate font-bold">{player.firstName} {player.lastName}</p><p className="truncate text-xs text-muted-foreground">{player.email}</p></div>
        <Badge value={t("coachWorkspace.players.active")} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-muted/20 p-2"><p className="text-muted-foreground">{t("coachWorkspace.players.lastSession")}</p><p className="font-semibold">{t("coachWorkspace.common.notAvailable")}</p></div>
        <div className="rounded-xl bg-muted/20 p-2"><p className="text-muted-foreground">{t("coachWorkspace.players.aiCount")}</p><p className="font-semibold">{recent}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/performance?player=${player.id}`}><Button size="sm" variant="outline">{t("coachWorkspace.players.viewProfile")}</Button></Link>
      </div>
    </div>
  );
}

function AiRow({ review }: { review: AiReview }) {
  return <div className="rounded-xl border border-border/50 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{review.originalFilename || `#${review.id}`}</p><Badge value={review.status} /></div><p className="mt-1 text-xs text-muted-foreground">{review.playerName || review.playerUserId}</p></div>;
}

function AiCard({ review, t, onOpen }: { review: AiReview; t: (key: string) => string; onOpen: () => void }) {
  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold">{review.originalFilename || `#${review.id}`}</p><p className="text-xs text-muted-foreground">{review.playerName || t("coachWorkspace.ai.assignedPlayer")}</p></div><Badge value={review.status} /></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-muted/20 p-2">{t("coachWorkspace.ai.minimap")}<p className="font-semibold">{review.job?.renderedVideoPath ? t("coachWorkspace.common.available") : t("coachWorkspace.common.notAvailable")}</p></div>
        <div className="rounded-xl bg-muted/20 p-2">{t("coachWorkspace.ai.tracking")}<p className="font-semibold">{review.job?.playerTracksPath || review.job?.ballTracksPath ? t("coachWorkspace.common.available") : t("coachWorkspace.common.notAvailable")}</p></div>
      </div>
      <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={onOpen}><BookOpenText size={14} />{t("coachWorkspace.ai.open")}</Button>
    </div>
  );
}

function RequestRow({ req }: { req: CoachingRequest }) {
  return <div className="rounded-xl border border-border/50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-sm">{req.playerName}</p><p className="text-xs text-muted-foreground">{req.requestedDate} · {req.requestedStartTime} - {req.requestedEndTime}</p></div><Badge value={req.status} /></div></div>;
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  return <button onClick={onOpen} className={`w-full rounded-xl border border-border/50 p-3 text-left transition-colors hover:bg-muted/20 ${item.readAt ? "opacity-70" : "bg-primary/5"}`}><div className="flex gap-2"><MessageSquare size={14} className="mt-0.5 text-primary" /><div><p className="text-sm font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{item.body}</p></div></div></button>;
}

function SettingsLink({ to, icon: Icon, title, text }: { to: string; icon: typeof Settings; title: string; text: string }) {
  return <Link to={to} className="gradient-card rounded-2xl border border-border/50 p-5 transition-colors hover:border-primary/40"><Icon className="mb-4 text-primary" size={22} /><p className="font-bold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p><ChevronRight className="mt-4 text-muted-foreground" size={16} /></Link>;
}
