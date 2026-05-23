import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/i18n/locale";
import {
  Award,
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  Clock,
  Globe,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";

type CoachProfile = {
  userId: number;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  headline: string | null;
  bio: string | null;
  expertise: string[];
  qualities: string[];
  certifications: string[];
  previousWorkplaces: string[];
  languages: string[];
  yearsExperience: number | null;
  hourlyRate: number | null;
  currency: string;
  isVerified: boolean;
  arenaName: string | null;
  arenaCity: string | null;
  arenaRegion: string | null;
};

type Slot = { start: string; end: string };
type WeekDaySlots = { date: string; label: string; dayName: string; isPast: boolean; isToday: boolean; slots: Slot[] };

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const startOfWeek = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const mondayOffset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - mondayOffset);
  return next;
};
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const formatShortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const formatWeekday = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "short" });
const todayStr = () => toDateKey(new Date());
const panelClass = "rounded-2xl border border-border bg-card shadow-sm";

const ProfileSkeleton = () => (
  <Layout>
    <div className="container py-10 space-y-6">
      <Skeleton className="h-44 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-6">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  </Layout>
);

const CoachProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => toDateKey(startOfWeek(new Date())));
  const [weekSlots, setWeekSlots] = useState<Record<string, Slot[]>>({});
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    api<{ profile: CoachProfile }>(`/api/player/coaches/${id}`, { authenticated: true })
      .then((data) => {
        if (!data.profile) navigate("/coaches");
        else setProfile(data.profile);
      })
      .catch(() => navigate("/coaches"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (!id) return;
    setSlotsLoading(true);
    const monday = new Date(`${weekStart}T00:00:00`);
    const dates = Array.from({ length: 7 }, (_, index) => toDateKey(addDays(monday, index)));
    Promise.all(
      dates.map((date) =>
        api<{ slots: Slot[] }>(`/api/player/coaches/${id}/slots?date=${date}`, { authenticated: true })
          .then((data) => [date, data.slots ?? []] as const)
          .catch(() => [date, []] as const)
      )
    )
      .then((entries) => setWeekSlots(Object.fromEntries(entries)))
      .finally(() => setSlotsLoading(false));
  }, [id, weekStart]);

  const weekDays = useMemo<WeekDaySlots[]>(() => {
    const monday = new Date(`${weekStart}T00:00:00`);
    const today = todayStr();
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index);
      const key = toDateKey(date);
      return {
        date: key,
        label: formatShortDate(date),
        dayName: formatWeekday(date),
        isPast: key < today,
        isToday: key === today,
        slots: weekSlots[key] ?? [],
      };
    });
  }, [weekStart, weekSlots]);
  const weekEndLabel = formatShortDate(addDays(new Date(`${weekStart}T00:00:00`), 6));

  const moveWeek = (offset: number) => {
    setWeekStart((current) => toDateKey(addDays(new Date(`${current}T00:00:00`), offset * 7)));
  };

  if (loading) return <ProfileSkeleton />;
  if (!profile) return null;

  const initials = `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase();
  const place = [profile.arenaName, profile.arenaCity ?? profile.arenaRegion].filter(Boolean).join(", ");

  return (
    <Layout>
      <div className="border-b border-border bg-background">
        <div className="container py-8">
          <button
            onClick={() => navigate("/coaches")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> {t("coaches.title")}
          </button>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="w-28 h-28 rounded-2xl border border-border overflow-hidden bg-muted shadow-sm shrink-0">
              {profile.profileImageUrl ? (
                <img
                  src={profile.profileImageUrl}
                  alt={`${profile.firstName} ${profile.lastName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground">
                  {initials}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-3xl font-display font-bold text-foreground">
                  {profile.firstName} {profile.lastName}
                </h1>
                {profile.isVerified && (
                  <Badge className="border-0 bg-primary/10 text-primary gap-1">
                    <ShieldCheck className="w-3 h-3" /> {t("coaches.card.verified")}
                  </Badge>
                )}
              </div>

              {profile.headline && (
                <p className="text-muted-foreground max-w-2xl mb-4">
                  {profile.headline}
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {place && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-primary" /> {place}
                  </span>
                )}
                {profile.yearsExperience != null && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {profile.yearsExperience} {t("coaches.card.experience")}
                  </span>
                )}
                {profile.hourlyRate != null && (
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Star className="w-4 h-4 text-primary" />
                    {profile.hourlyRate} {profile.currency}{t("coaches.card.rate")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-10 grid grid-cols-1 xl:grid-cols-[1fr,480px] gap-8 items-start">
        <div className="space-y-6">
          {profile.bio && (
            <section className={`${panelClass} p-6`}>
              <h2 className="font-semibold text-foreground mb-3">{t("coachProfile.about")}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{profile.bio}</p>
            </section>
          )}

          <section className={`${panelClass} p-6 space-y-6`}>
            {profile.expertise.length > 0 && (
              <div>
                <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {t("coachProfile.expertise")}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.expertise.map((e) => (
                    <Badge key={e} variant="secondary" className="rounded-full text-xs px-3 py-1">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {profile.qualities?.length > 0 && (
              <div>
                <h2 className="font-semibold text-foreground mb-3">{t("coachProfile.qualities")}</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.qualities.map((q) => (
                    <Badge key={q} variant="outline" className="rounded-full text-xs px-3 py-1">
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {profile.languages?.length > 0 && (
              <div>
                <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  {t("coachProfile.languages")}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map((l) => (
                    <Badge key={l} variant="outline" className="rounded-full text-xs px-3 py-1">
                      {l}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </section>

          {(profile.certifications?.length > 0 || profile.previousWorkplaces?.length > 0) && (
            <section className={`${panelClass} p-6 grid gap-6 md:grid-cols-2`}>
              {profile.certifications?.length > 0 && (
                <div>
                  <h2 className="font-semibold text-foreground mb-3">{t("coachProfile.certifications")}</h2>
                  <ul className="space-y-2">
                    {profile.certifications.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {profile.previousWorkplaces?.length > 0 && (
                <div>
                  <h2 className="font-semibold text-foreground mb-3">{t("coachProfile.workplaces")}</h2>
                  <ul className="space-y-2">
                    {profile.previousWorkplaces.map((w) => (
                      <li key={w} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Award className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className={`${panelClass} sticky top-20 max-h-[calc(100vh-7rem)] overflow-hidden p-6`}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                {t("coachProfile.schedule")}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {t("coachProfile.scheduleHint")}
              </p>
            </div>
          </div>

          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
            <button
              type="button"
              onClick={() => moveWeek(-1)}
              className="rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("coachProfile.previousWeek")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t("coachProfile.weekOf")}</p>
              <p className="text-sm font-semibold text-foreground">
                {formatShortDate(new Date(`${weekStart}T00:00:00`))} - {weekEndLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => moveWeek(1)}
              className="rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("coachProfile.nextWeek")}
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>

          {slotsLoading ? (
            <div className="coach-week-scroll max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <div className="coach-week-scroll max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {weekDays.map((day) => (
                <div
                  key={day.date}
                  className={`rounded-xl border p-2.5 transition-all ${
                    day.isPast
                      ? "border-border bg-muted/25 opacity-50 blur-[0.4px] grayscale"
                      : day.isToday
                        ? "border-primary/45 bg-primary/10"
                        : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{day.dayName}</p>
                      <p className="text-xs text-muted-foreground">{day.label}</p>
                    </div>
                    {day.isToday && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {t("coachProfile.today")}
                      </span>
                    )}
                  </div>

                  {day.slots.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
                      {day.isPast ? t("coachProfile.pastDay") : t("coachProfile.noSlots")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {day.slots.map((slot) => (
                        <div
                          key={`${day.date}-${slot.start}`}
                          className="rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-center text-xs font-semibold text-foreground"
                        >
                          {slot.start}-{slot.end}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </Layout>
  );
};

export default CoachProfilePage;
