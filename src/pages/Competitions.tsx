import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "@/components/Layout";
import {
  Trophy, Users, Calendar, MapPin, ArrowRight,
  Medal, Crown, Swords, Clock, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { Skeleton } from "@/components/ui/skeleton";

type Competition = {
  id: number;
  name: string;
  sport: string;
  description?: string;
  start_date: string;
  end_date?: string;
  registration_deadline?: string;
  location: string;
  participants: number;
  max_participants: number;
  status: "open" | "full" | "closed";
  arena_name?: string;
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  wins: number;
  losses: number;
  points: number;
};

const SPORT_EMOJI: Record<string, string> = {
  Padel: "🎾",
  Tennis: "🎾",
  Football: "⚽",
  Basketball: "🏀",
  Volleyball: "🏐",
  Badminton: "🏸",
  Squash: "🟡",
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

const statusConfig = {
  open: { label: "Inscriptions ouvertes", cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" },
  full: { label: "Complet", cls: "bg-amber-500/15 text-amber-400 border border-amber-500/25" },
  closed: { label: "Fermé", cls: "bg-red-500/15 text-red-400 border border-red-500/25" },
};

const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600"];
const rankBg = ["bg-yellow-500/15 border-yellow-500/25", "bg-slate-500/15 border-slate-400/25", "bg-amber-700/15 border-amber-600/25"];

const Competitions = () => {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "full" | "closed">("all");
  const [registering, setRegistering] = useState<number | null>(null);
  const location = useLocation();
  const competitionBasePath = location.pathname.startsWith("/player") ? "/player/competitions" : "/competitions";

  const loadData = async () => {
    try {
      const result = await api<{ competitions: Competition[]; leaderboard: LeaderboardEntry[] }>("/api/competitions");
      setCompetitions(result.competitions);
      setLeaderboard(result.leaderboard);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger les compétitions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const handleRegister = async (competitionId: number) => {
    if (!getSessionUser()) {
      toast.error("Connectez-vous pour vous inscrire.");
      return;
    }
    setRegistering(competitionId);
    try {
      await api(`/api/competitions/${competitionId}/register`, { method: "POST", authenticated: true });
      toast.success("Inscription enregistrée !");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inscription impossible.");
    } finally {
      setRegistering(null);
    }
  };

  const visible = filter === "all" ? competitions : competitions.filter((c) => c.status === filter);

  return (
    <Layout>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="container py-14">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <Trophy size={22} className="text-primary" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Tournois & Compétitions</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">
            Compétitions
          </h1>
          <p className="text-muted-foreground text-base max-w-lg">
            Inscrivez-vous aux tournois de votre arena et suivez le classement des meilleurs joueurs.
          </p>
        </div>
      </div>

      <div className="container py-10">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* Left: competitions list */}
          <div className="lg:col-span-2 space-y-6">

            {/* Filter bar */}
            <div className="flex items-center gap-2 flex-wrap">
              {(["all", "open", "full", "closed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all ${
                    filter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {f === "all" ? "Tous" : f === "open" ? "Ouverts" : f === "full" ? "Complets" : "Fermés"}
                </button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">{visible.length} tournoi{visible.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Skeleton */}
            {loading && (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="gradient-card rounded-2xl border border-border p-6 space-y-4">
                    <div className="flex justify-between">
                      <Skeleton className="h-5 w-52" />
                      <Skeleton className="h-5 w-28 rounded-full" />
                    </div>
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-3 w-36 rounded-full" />
                      <Skeleton className="h-9 w-28 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div className="gradient-card rounded-2xl border border-border p-12 text-center">
                <Trophy size={40} className="text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="font-semibold mb-1">Aucun tournoi</p>
                <p className="text-sm text-muted-foreground">Il n'y a pas de tournoi dans cette catégorie pour le moment.</p>
              </div>
            )}

            {/* Competition cards */}
            {visible.map((c) => {
              const fillPct = Math.min(100, Math.round((c.participants / c.max_participants) * 100));
              const cfg = statusConfig[c.status] ?? statusConfig.closed;
              const sportEmoji = SPORT_EMOJI[c.sport] ?? "🏆";
              return (
                <div key={c.id} className="gradient-card rounded-2xl border border-border p-6 hover:border-primary/30 transition-all group">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl shrink-0">{sportEmoji}</span>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base leading-tight truncate">{c.name}</h3>
                        {c.arena_name && <p className="text-xs text-muted-foreground mt-0.5">{c.arena_name}</p>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0 ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  </div>

                  {c.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{c.description}</p>
                  )}

                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground mb-4">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-primary/60" />
                      {formatDate(c.start_date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-primary/60" />
                      {c.location}
                    </span>
                    {c.registration_deadline && (
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-amber-400/70" />
                        Clôture: {formatDate(c.registration_deadline)}
                      </span>
                    )}
                  </div>

                  {/* Participants fill bar */}
                  <div className="mb-4 space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users size={11} /> {c.participants} / {c.max_participants} joueurs</span>
                      <span className="font-medium">{fillPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${fillPct >= 100 ? "bg-amber-500" : fillPct >= 75 ? "bg-orange-500" : "bg-primary"}`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Link
                      to={`${competitionBasePath}/${c.id}`}
                      className="text-xs font-bold uppercase tracking-widest text-primary hover:underline flex items-center gap-1 group-hover:gap-2 transition-all"
                    >
                      Voir les détails <ChevronRight size={13} />
                    </Link>
                    <Button
                      size="sm"
                      className="h-9 px-5 font-bold text-xs"
                      disabled={c.status !== "open" || registering === c.id}
                      onClick={() => void handleRegister(c.id)}
                    >
                      {registering === c.id
                        ? "Inscription..."
                        : c.status === "open"
                          ? "S'inscrire"
                          : c.status === "full"
                            ? "Complet"
                            : "Fermé"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: leaderboard */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Crown size={18} className="text-yellow-400" />
                <h2 className="font-display font-bold text-lg">Classement</h2>
              </div>
              <div className="gradient-card rounded-2xl border border-border overflow-hidden">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-4 w-14" />
                      </div>
                    ))}
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Aucun classement disponible.</div>
                ) : (
                  leaderboard.map((player) => {
                    const top = player.rank <= 3;
                    return (
                      <div
                        key={player.rank}
                        className={`flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors ${top ? "relative" : ""}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border shrink-0 ${
                          top ? `${rankBg[player.rank - 1]} ${rankColors[player.rank - 1]}` : "bg-muted text-muted-foreground border-border"
                        }`}>
                          {player.rank === 1 ? <Crown size={14} /> : player.rank === 2 ? <Medal size={14} /> : player.rank === 3 ? <Medal size={14} /> : player.rank}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-semibold text-sm truncate ${top ? rankColors[player.rank - 1] : ""}`}>{player.name}</div>
                          <div className="text-xs text-muted-foreground">{player.wins}V — {player.losses}D</div>
                        </div>
                        <span className="text-sm font-bold text-primary shrink-0">{player.points} pts</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick info card */}
            <div className="gradient-card rounded-2xl border border-border p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Comment participer</h3>
              {[
                { icon: Users, text: "Être membre actif de l'arena" },
                { icon: Swords, text: "Choisir un tournoi ouvert" },
                { icon: Trophy, text: "Cliquer sur S'inscrire" },
                { icon: ArrowRight, text: "Suivre les matchs en direct" },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon size={11} className="text-primary" />
                  </div>
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Competitions;
