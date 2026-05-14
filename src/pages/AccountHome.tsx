import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell, Brain, Calendar, CalendarCheck, CalendarPlus,
  ChevronRight, Clock, GraduationCap, History, MapPin,
  Radio, Settings, Trophy, UserSearch, Users, Zap,
} from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { useLocale } from "@/i18n/locale";

type DashboardStats = { upcomingBookings: number; totalMatches: number; winRate: string; ranking: number };
type ReservationRecord = {
  id: number; reservation_date: string; start_time: string; end_time: string;
  status: string; court_name: string; arena_name: string; participants?: unknown[];
};
type NotificationRecord = { id: number; title: string; body: string; readAt: string | null };

function StatCard({ icon: Icon, value, label, color = "text-primary" }: {
  icon: typeof Calendar; value: string | number; label: string; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm flex items-center gap-4">
      <div className={`rounded-xl bg-primary/10 p-2.5 ${color === "text-primary" ? "bg-primary/10" : color === "text-green-400" ? "bg-green-400/10" : "bg-amber-400/10"}`}>
        <Icon size={18} className={color} />
      </div>
      <div>
        <p className="text-2xl font-display font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

type ActionCardProps = { to: string; icon: typeof Calendar; label: string; description: string; accent?: string };
function ActionCard({ to, icon: Icon, label, description, accent = "bg-primary/10 text-primary" }: ActionCardProps) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all flex flex-col gap-3"
    >
      <div className={`w-fit rounded-xl p-2.5 ${accent} transition-colors`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="font-semibold text-sm leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
      <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-primary transition-colors mt-auto self-end" />
    </Link>
  );
}

function statusVariant(s: string): "secondary" | "destructive" | "outline" {
  if (s === "confirmed") return "secondary";
  if (s === "cancelled") return "destructive";
  return "outline";
}

export default function AccountHome() {
  const user = getSessionUser();
  const { t } = useLocale();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      api<DashboardStats>("/api/player/dashboard", { authenticated: true }),
      api<{ reservations: ReservationRecord[] }>("/api/player/history/reservations", { authenticated: true }),
      api<{ notifications: NotificationRecord[] }>("/api/notifications", { authenticated: true }),
    ]).then(([s, r, n]) => {
      if (!mounted) return;
      if (s.status === "fulfilled") setStats(s.value);
      if (r.status === "fulfilled") setReservations(r.value.reservations ?? []);
      if (n.status === "fulfilled") setNotifications(n.value.notifications ?? []);
    }).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const upcoming = useMemo(() =>
    reservations
      .filter(r => r.status !== "cancelled")
      .sort((a, b) => `${a.reservation_date}T${a.start_time}`.localeCompare(`${b.reservation_date}T${b.start_time}`))
      .filter(r => `${r.reservation_date}T${r.start_time}` >= new Date().toISOString().slice(0, 16))
      .slice(0, 3),
  [reservations]);

  const unread = notifications.filter(n => !n.readAt).length;

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  return (
    <Layout>
      <div className="container py-8 space-y-8">

        {/* ── Hero card ── */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-xl shadow-black/5 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary font-display font-bold text-2xl select-none flex-shrink-0">
                {initials}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">{t("account.title")}</p>
                <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                  {user?.firstName} {user?.lastName}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
                {memberSince && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {t("account.memberSince")} {memberSince}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
              <Badge variant={user?.status === "active" ? "secondary" : "destructive"}>
                {user?.status ?? "—"}
              </Badge>
              <Badge variant="outline" className="capitalize">{t("auth.role.player")}</Badge>
            </div>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
          ) : (
            <>
              <StatCard icon={Calendar} value={stats?.upcomingBookings ?? upcoming.length} label={t("account.stats.upcoming")} color="text-primary" />
              <StatCard icon={Bell} value={unread} label={t("account.stats.unread")} color="text-amber-400" />
              <StatCard icon={Trophy} value={stats?.totalMatches ?? 0} label={t("account.stats.matches")} color="text-green-400" />
            </>
          )}
        </div>

        {/* ── Quick actions ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold">{t("account.quickActions")}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <ActionCard
              to="/reservation"
              icon={CalendarPlus}
              label={t("account.actions.bookCourt")}
              description={t("player.action.bookCourt")}
              accent="bg-primary/10 text-primary"
            />
            <ActionCard
              to="/account/reservations"
              icon={CalendarCheck}
              label={t("account.actions.myReservations")}
              description={t("account.reservations.subtitle")}
              accent="bg-blue-500/10 text-blue-400"
            />
            <ActionCard
              to="/player/coach-booking"
              icon={GraduationCap}
              label={t("account.actions.bookCoach")}
              description={t("player.action.bookCoach")}
              accent="bg-violet-500/10 text-violet-400"
            />
            <ActionCard
              to="/coaches"
              icon={UserSearch}
              label={t("nav.coaches")}
              description={t("account.actions.browseCoaches")}
              accent="bg-cyan-500/10 text-cyan-400"
            />
            <ActionCard
              to="/account/notifications"
              icon={Bell}
              label={t("account.actions.notifications")}
              description={t("account.notifications.subtitle")}
              accent="bg-amber-500/10 text-amber-400"
            />
            <ActionCard
              to="/account/ai-analysis"
              icon={Brain}
              label={t("account.actions.aiAnalysis")}
              description={t("account.ai.subtitle")}
              accent="bg-primary/10 text-primary"
            />
            <ActionCard
              to="/account/live-sessions"
              icon={Radio}
              label={t("account.actions.liveSessions")}
              description={t("account.live.subtitle")}
              accent="bg-green-500/10 text-green-400"
            />
            <ActionCard
              to="/account/competitions"
              icon={Trophy}
              label={t("account.actions.competitions")}
              description={t("account.competitions.subtitle")}
              accent="bg-orange-500/10 text-orange-400"
            />
            <ActionCard
              to="/account/settings"
              icon={Settings}
              label={t("account.actions.settings")}
              description={t("account.settings.subtitle")}
              accent="bg-muted text-muted-foreground"
            />
          </div>
        </section>

        {/* ── Recent reservations ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold">{t("account.recentReservations")}</h2>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link to="/account/reservations">
                {t("account.viewAll")} <ChevronRight size={13} />
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          ) : upcoming.length ? (
            <div className="space-y-3">
              {upcoming.map(res => (
                <Link
                  key={res.id}
                  to={`/player/reservations/${res.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/35 transition-colors sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="rounded-xl bg-primary/10 p-2.5 flex-shrink-0">
                      <Calendar size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{res.court_name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin size={11} /> {res.arena_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <div className="text-xs text-muted-foreground flex flex-col gap-1">
                      <span className="flex items-center gap-1"><Calendar size={11} /> {res.reservation_date}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {res.start_time?.slice(0,5)} – {res.end_time?.slice(0,5)}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-auto sm:ml-0">
                      {(res.participants?.length ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users size={11} /> {res.participants?.length}
                        </span>
                      )}
                      <Badge variant={statusVariant(res.status)}>{res.status}</Badge>
                      <ChevronRight size={14} className="text-muted-foreground/50" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <Calendar size={36} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground font-medium">{t("player.empty.noReservations")}</p>
              <Button asChild size="sm" className="mt-4 glow-yellow gap-2">
                <Link to="/reservation"><CalendarPlus size={14} /> {t("player.action.bookCourt")}</Link>
              </Button>
            </div>
          )}
        </section>

        {/* ── Bottom links: History + AI ── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/account/history" className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card px-5 py-4 hover:border-primary/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-muted/60 p-2">
                <History size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm font-semibold">{t("account.actions.history")}</span>
            </div>
            <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
          </Link>
          <Link to="/account/settings" className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card px-5 py-4 hover:border-primary/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-muted/60 p-2">
                <Zap size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm font-semibold">{t("account.actions.settings")}</span>
            </div>
            <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
          </Link>
        </div>
      </div>
    </Layout>
  );
}
