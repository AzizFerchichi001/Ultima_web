import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Calendar, ChevronRight, Clock, History, MapPin, Trophy } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useLocale } from "@/i18n/locale";

type ReservationRecord = {
  id: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status: string;
  court_name: string;
  arena_name: string;
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
  sharedAt: string | null;
};

function statusVariant(s: string): "secondary" | "destructive" | "outline" {
  if (s === "confirmed") return "secondary";
  if (s === "cancelled") return "destructive";
  return "outline";
}

type Tab = "reservations" | "competitions" | "smartplay";

export default function AccountHistory() {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("reservations");
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([]);
  const [clips, setClips] = useState<SmartPlayClip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      api<{ reservations: ReservationRecord[] }>("/api/player/history/reservations", { authenticated: true }),
      api<{ competitions: CompetitionRecord[] }>("/api/player/history/competitions", { authenticated: true }),
      api<{ clips: SmartPlayClip[] }>("/api/smartplay/my-clips", { authenticated: true }),
    ]).then(([r, c, s]) => {
      if (!mounted) return;
      if (r.status === "fulfilled") setReservations(r.value.reservations ?? []);
      if (c.status === "fulfilled") setCompetitions(c.value.competitions ?? []);
      if (s.status === "fulfilled") setClips(s.value.clips ?? []);
    }).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "reservations", label: t("account.history.tabReservations"), count: reservations.length },
    { key: "competitions", label: t("account.history.tabCompetitions"), count: competitions.length },
    { key: "smartplay", label: t("account.history.tabSmartplay"), count: clips.length },
  ];

  return (
    <Layout>
      <div className="container py-8 space-y-6">
        <Link
          to="/account"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> {t("account.back")}
        </Link>

        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-7">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("account.title")}</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold">{t("account.history.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("account.history.subtitle")}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {!loading && count > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : tab === "reservations" ? (
          reservations.length ? (
            <div className="space-y-3">
              {reservations.map((res) => (
                <Link
                  key={res.id}
                  to={`/player/reservations/${res.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/35 transition-colors"
                >
                  <div className="rounded-xl bg-primary/10 p-2.5 shrink-0">
                    <Calendar size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{res.court_name}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin size={11} /> {res.arena_name}</span>
                      <span className="flex items-center gap-1"><Calendar size={11} /> {res.reservation_date}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {res.start_time?.slice(0, 5)} – {res.end_time?.slice(0, 5)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant(res.status)}>{res.status}</Badge>
                    <ChevronRight size={14} className="text-muted-foreground/50" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={Calendar} message={t("account.history.empty")} />
          )
        ) : tab === "competitions" ? (
          competitions.length ? (
            <div className="space-y-3">
              {competitions.map((comp) => {
                const id = comp.competition_id ?? comp.id;
                return (
                  <Link
                    key={id}
                    to={`/competitions/${id}`}
                    className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/35 transition-colors"
                  >
                    <div className="rounded-xl bg-orange-500/10 p-2.5 shrink-0">
                      <Trophy size={16} className="text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{comp.name}</p>
                      <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                        {comp.arena_name && (
                          <span className="flex items-center gap-1"><MapPin size={11} /> {comp.arena_name}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar size={11} /> {new Date(comp.start_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {comp.registration_status && <Badge variant="secondary">{comp.registration_status}</Badge>}
                      <ChevronRight size={14} className="text-muted-foreground/50" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Trophy} message={t("account.history.empty")} />
          )
        ) : (
          clips.length ? (
            <div className="space-y-3">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4"
                >
                  <div className="rounded-xl bg-primary/10 p-2.5 shrink-0">
                    <Brain size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{clip.courtName ?? clip.originalFilename}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                      {clip.sharedAt && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {new Date(clip.sharedAt).toLocaleDateString()}
                        </span>
                      )}
                      <span className="truncate text-muted-foreground/70">{clip.originalFilename}</span>
                    </div>
                  </div>
                  <Badge variant={clip.jobStatus === "done" || clip.jobStatus === "completed" ? "secondary" : "outline"}>
                    {clip.jobStatus ?? "—"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Brain} message={t("account.history.empty")} />
          )
        )}
      </div>
    </Layout>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof History; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <Icon size={36} className="mx-auto mb-3 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground font-medium">{message}</p>
    </div>
  );
}
