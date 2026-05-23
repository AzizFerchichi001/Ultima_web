import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Brain,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  MapPin,
  Radio,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import PlayerShell from "@/components/player/PlayerShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { useLocale } from "@/i18n/locale";
import type { LiveSession } from "@/components/smartplay/liveTypes";

type DashboardStats = {
  totalMatches: number;
  winRate: string;
  ranking: number;
  upcomingBookings: number;
  wins?: number;
  losses?: number;
};

type ReservationRecord = {
  id: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status: string;
  court_name: string;
  arena_name: string;
  participants?: unknown[];
};

type CompetitionRecord = {
  competition_id?: number;
  id?: number;
  name: string;
  arena_name?: string;
  start_date: string;
  competition_status?: string;
  registration_status?: string;
};

type SmartPlayClip = {
  id: number;
  originalFilename: string;
  courtName: string | null;
  jobStatus: string | null;
  renderedVideoPath: string | null;
  sharedAt: string | null;
};

type NotificationRecord = {
  id: number;
  title: string;
  body: string;
  readAt: string | null;
  createdAt?: string;
  linkUrl?: string | null;
};

function EmptyState({ icon: Icon, title, action }: { icon: typeof Calendar; title: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <Icon size={28} className="mx-auto mb-3 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, hint }: { icon: typeof Calendar; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5">
      <div className="mb-4 flex items-center justify-between">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Icon size={20} />
        </div>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-display font-bold">{value}</p>
    </div>
  );
}

export default function PlayerDashboard() {
  const user = getSessionUser();
  const { t } = useLocale();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [clips, setClips] = useState<SmartPlayClip[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      api<DashboardStats>("/api/player/dashboard", { authenticated: true }),
      api<{ reservations: ReservationRecord[] }>("/api/player/history/reservations", { authenticated: true }),
      api<{ sessions: LiveSession[] }>("/api/live-sessions", { authenticated: true }),
      api<{ clips: SmartPlayClip[] }>("/api/smartplay/my-clips", { authenticated: true }),
      api<{ competitions: CompetitionRecord[] }>("/api/player/history/competitions", { authenticated: true }),
      api<{ notifications: NotificationRecord[] }>("/api/notifications", { authenticated: true }),
    ]).then((results) => {
      if (!mounted) return;
      if (results[0].status === "fulfilled") setStats(results[0].value);
      if (results[1].status === "fulfilled") setReservations(results[1].value.reservations ?? []);
      if (results[2].status === "fulfilled") setLiveSessions(results[2].value.sessions ?? []);
      if (results[3].status === "fulfilled") setClips(results[3].value.clips ?? []);
      if (results[4].status === "fulfilled") setCompetitions(results[4].value.competitions ?? []);
      if (results[5].status === "fulfilled") setNotifications(results[5].value.notifications ?? []);
    }).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const upcoming = useMemo(() => (
    reservations
      .filter((r) => r.status !== "cancelled")
      .sort((a, b) => `${a.reservation_date}T${a.start_time}`.localeCompare(`${b.reservation_date}T${b.start_time}`))
      .slice(0, 3)
  ), [reservations]);
  const liveNow = liveSessions.filter((s) => ["created", "starting", "running"].includes(s.status)).slice(0, 2);
  const recentClip = clips[0];
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <PlayerShell>
      <div className="space-y-6">
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("player.dashboard.eyebrow")}</p>
              <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                {t("player.dashboard.welcome").replace("{name}", user?.firstName ?? "")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("player.dashboard.subtitle")}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="gap-2 glow-yellow">
                <Link to="/player/reservations/new"><CalendarPlus size={16} /> {t("player.action.bookCourt")}</Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/player/coach-booking"><Users size={16} /> {t("player.action.bookCoach")}</Link>
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />) : (
            <>
              <KpiCard icon={Calendar} label={t("player.kpi.upcoming")} value={stats?.upcomingBookings ?? upcoming.length} />
              <KpiCard icon={Trophy} label={t("player.kpi.matches")} value={stats?.totalMatches ?? 0} hint={stats?.winRate ?? "0%"} />
              <KpiCard icon={Zap} label={t("player.kpi.ranking")} value={stats?.ranking ?? 1000} />
              <KpiCard icon={Bell} label={t("player.kpi.unread")} value={unread} />
            </>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">{t("player.dashboard.upcoming")}</h2>
                <p className="text-sm text-muted-foreground">{t("player.dashboard.upcomingHint")}</p>
              </div>
              <Button asChild variant="ghost" size="sm"><Link to="/player/reservations">{t("common.viewAll")}</Link></Button>
            </div>
            {loading ? <Skeleton className="h-40 rounded-xl" /> : upcoming.length ? (
              <div className="space-y-3">
                {upcoming.map((res) => (
                  <Link key={res.id} to={`/player/reservations/${res.id}`} className="block rounded-xl border border-border/60 bg-background/55 p-4 transition-colors hover:border-primary/35">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{res.court_name}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin size={13} /> {res.arena_name}</p>
                      </div>
                      <Badge variant="secondary">{res.status}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {res.reservation_date}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {res.start_time?.slice(0, 5)} - {res.end_time?.slice(0, 5)}</span>
                      <span className="flex items-center gap-1"><Users size={12} /> {res.participants?.length ?? 0}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={Calendar} title={t("player.empty.noReservations")} action={<Button asChild size="sm"><Link to="/player/reservations/new">{t("player.action.bookCourt")}</Link></Button>} />
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">{t("player.dashboard.liveNow")}</h2>
                <p className="text-sm text-muted-foreground">{t("player.dashboard.liveHint")}</p>
              </div>
              <Button asChild variant="ghost" size="sm"><Link to="/player/live">{t("common.viewAll")}</Link></Button>
            </div>
            {loading ? <Skeleton className="h-40 rounded-xl" /> : liveNow.length ? (
              <div className="space-y-3">
                {liveNow.map((session) => (
                  <Link key={session.id} to={`/player/live/${session.id}`} className="block rounded-xl border border-green-500/25 bg-green-500/8 p-4 hover:border-green-500/45">
                    <p className="font-semibold">{session.courtName ?? `Court ${session.courtId}`}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{session.arenaName ?? t("res.review.arena")}</p>
                    <Badge className="mt-3 bg-green-500/15 text-green-300 hover:bg-green-500/15">{t("player.status.live")}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={Radio} title={t("player.empty.noLive")} />
            )}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5">
            <Brain size={20} className="mb-3 text-primary" />
            <h2 className="font-display text-xl font-bold">{t("player.dashboard.ai")}</h2>
            {recentClip ? (
              <div className="mt-4 rounded-xl border border-border/60 bg-background/55 p-4">
                <p className="truncate font-semibold">{recentClip.originalFilename}</p>
                <p className="mt-1 text-xs text-muted-foreground">{recentClip.courtName ?? t("res.review.court")}</p>
                <Badge variant="outline" className="mt-3">{recentClip.renderedVideoPath ? t("player.ai.ready") : recentClip.jobStatus ?? t("player.ai.processing")}</Badge>
              </div>
            ) : <EmptyState icon={Brain} title={t("player.empty.noAi")} />}
            <Button asChild variant="outline" className="mt-4 w-full"><Link to="/player/ai">{t("player.action.openAi")}</Link></Button>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5">
            <Trophy size={20} className="mb-3 text-primary" />
            <h2 className="font-display text-xl font-bold">{t("player.dashboard.competitions")}</h2>
            {competitions.slice(0, 2).map((comp) => (
              <Link key={comp.competition_id ?? comp.id ?? comp.name} to={`/player/competitions/${comp.competition_id ?? comp.id}`} className="mt-4 block rounded-xl border border-border/60 bg-background/55 p-4 hover:border-primary/35">
                <p className="font-semibold">{comp.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{comp.arena_name ?? ""} {comp.start_date}</p>
              </Link>
            ))}
            {!competitions.length && <EmptyState icon={Trophy} title={t("player.empty.noCompetitions")} />}
            <Button asChild variant="outline" className="mt-4 w-full"><Link to="/player/competitions">{t("player.action.browseCompetitions")}</Link></Button>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5">
            <Bell size={20} className="mb-3 text-primary" />
            <h2 className="font-display text-xl font-bold">{t("player.dashboard.notifications")}</h2>
            {notifications.slice(0, 3).map((notification) => (
              <div key={notification.id} className="mt-3 rounded-xl border border-border/60 bg-background/55 p-3">
                <div className="flex items-start gap-2">
                  {!notification.readAt && <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-primary" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{notification.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
                  </div>
                </div>
              </div>
            ))}
            {!notifications.length && <EmptyState icon={Bell} title={t("player.empty.noNotifications")} />}
            <Button asChild variant="outline" className="mt-4 w-full"><Link to="/player/notifications">{t("player.action.viewNotifications")}</Link></Button>
          </section>
        </div>
      </div>
    </PlayerShell>
  );
}
