import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/i18n/locale";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Globe,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";

type CoachCard = {
  userId: number;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  headline: string | null;
  expertise: string[];
  qualities: string[];
  languages: string[];
  yearsExperience: number | null;
  hourlyRate: number | null;
  currency: string;
  isVerified: boolean;
  arenaName: string | null;
  arenaCity: string | null;
  arenaRegion: string | null;
};

const initials = (first: string, last: string) =>
  `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();

const CoachCardSkeleton = () => (
  <div className="rounded-2xl border border-border bg-card overflow-hidden">
    <div className="p-6 flex gap-5">
      <Skeleton className="h-20 w-20 rounded-2xl shrink-0" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </div>
    <Skeleton className="h-14 w-full rounded-none" />
  </div>
);

const Coaches = () => {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [coaches, setCoaches] = useState<CoachCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    api<{ coaches: CoachCard[] }>(`/api/player/coaches?${params}`, { authenticated: true })
      .then((data) => setCoaches(data.coaches ?? []))
      .catch(() => setCoaches([]))
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  const featuredLocations = useMemo(() => {
    const cities = coaches
      .map((coach) => coach.arenaCity ?? coach.arenaRegion)
      .filter(Boolean) as string[];
    return Array.from(new Set(cities)).slice(0, 5);
  }, [coaches]);

  return (
    <Layout>
      <div className="border-b border-border bg-background">
        <div className="container py-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              {t("coaches.title")}
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">
              {t("coaches.title")}
            </h1>
            <p className="text-muted-foreground max-w-2xl mb-7">
              {t("coaches.subtitle")}
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("coaches.search.placeholder")}
                  className="pl-10 h-12 rounded-xl border-border bg-card text-foreground"
                />
              </div>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="h-12 rounded-xl border border-border px-4 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  {t("res.arena.all")}
                </button>
              )}
            </div>

            {featuredLocations.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {featuredLocations.map((city) => (
                  <button
                    key={city}
                    onClick={() => setSearch(city)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container py-10">
        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {[...Array(6)].map((_, i) => <CoachCardSkeleton key={i} />)}
          </div>
        ) : coaches.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-muted-foreground gap-3">
            <Star className="w-10 h-10 opacity-20" />
            <p className="text-base">{t("coaches.empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {coaches.map((coach) => {
              const place = [coach.arenaName, coach.arenaCity ?? coach.arenaRegion].filter(Boolean).join(", ");
              return (
                <article
                  key={coach.userId}
                  onClick={() => navigate(`/coaches/${coach.userId}`)}
                  className="group rounded-2xl border border-border bg-card overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-xl"
                >
                  <div className="p-6 sm:p-7">
                    <div className="flex flex-col sm:flex-row gap-5">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 bg-muted border border-border shadow-sm">
                        {coach.profileImageUrl ? (
                          <img
                            src={coach.profileImageUrl}
                            alt={`${coach.firstName} ${coach.lastName}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                            {initials(coach.firstName, coach.lastName)}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h2 className="text-xl font-bold text-foreground leading-tight">
                            {coach.firstName} {coach.lastName}
                          </h2>
                          {coach.isVerified && (
                            <Badge className="border-0 bg-primary/10 text-primary gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              {t("coaches.card.verified")}
                            </Badge>
                          )}
                        </div>

                        {coach.headline && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {coach.headline}
                          </p>
                        )}

                        {place && (
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
                            <MapPin className="w-4 h-4 text-primary shrink-0" />
                            <span className="truncate">{place}</span>
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {coach.expertise.slice(0, 4).map((exp) => (
                            <Badge key={exp} variant="secondary" className="rounded-full text-xs px-3 py-1">
                              {exp}
                            </Badge>
                          ))}
                          {coach.qualities.slice(0, Math.max(0, 4 - coach.expertise.length)).map((quality) => (
                            <Badge key={quality} variant="outline" className="rounded-full text-xs px-3 py-1">
                              {quality}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border bg-muted/20 px-6 sm:px-7 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {coach.yearsExperience != null && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {coach.yearsExperience} {t("coaches.card.experience")}
                        </span>
                      )}
                      {coach.languages.length > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-4 h-4" />
                          {coach.languages.slice(0, 2).join(", ")}
                        </span>
                      )}
                      {coach.hourlyRate != null && (
                        <span className="font-semibold text-foreground">
                          {coach.hourlyRate} {coach.currency}{t("coaches.card.rate")}
                        </span>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      <CalendarDays className="w-4 h-4" />
                      {t("coaches.card.viewSchedule")}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Coaches;
