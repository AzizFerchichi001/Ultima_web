import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  Trophy, Users, Calendar, ArrowLeft, CheckCircle2,
  MapPin, Medal, Crown, Clock, Shield, Info, Scroll,
  Gift, UserCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { getSessionUser } from "@/lib/session";
import { Skeleton } from "@/components/ui/skeleton";
import CompetitionLiveMatchPanel from "@/components/smartplay/CompetitionLiveMatchPanel";

type Participant = {
  id: number;
  name: string;
  ranking: number;
  registeredAt?: string;
};

type CompetitionDetails = {
  id: number;
  name: string;
  sport: string;
  description?: string;
  start_date: string;
  end_date?: string;
  registration_deadline?: string;
  arena_name?: string;
  location: string;
  max_participants: number;
  status: "open" | "full" | "closed";
  participants: Participant[];
  rules?: string | null;
  prizes?: string | null;
};

const SPORT_EMOJI: Record<string, string> = {
  Padel: "🎾", Tennis: "🎾", Football: "⚽", Basketball: "🏀",
  Volleyball: "🏐", Badminton: "🏸", Squash: "🟡",
};

const statusConfig = {
  open: { label: "Inscriptions ouvertes", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  full: { label: "Complet", cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  closed: { label: "Fermé", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

type Tab = "overview" | "participants";

const CompetitionDetails = () => {
  const { id } = useParams<{ id: string }>();
  const [comp, setComp] = useState<CompetitionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const user = getSessionUser();
  const location = useLocation();
  const competitionListPath = location.pathname.startsWith("/player") ? "/player/competitions" : "/competitions";

  const loadDetails = async () => {
    try {
      const data = await api<CompetitionDetails>(`/api/competitions/${id}`, { optionalAuth: true });
      setComp(data);
    } catch {
      toast.error("Impossible de charger les détails du tournoi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadDetails(); }, [id]);

  const handleRegister = async () => {
    if (!user) { toast.error("Connectez-vous pour vous inscrire !"); return; }
    setRegistering(true);
    try {
      await api(`/api/competitions/${id}/register`, { method: "POST", authenticated: true });
      toast.success("Inscription réussie !");
      void loadDetails();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'inscription.");
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container py-10 space-y-8">
          <Skeleton className="h-4 w-44" />
          <div className="grid lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-56 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!comp) {
    return (
      <Layout>
        <div className="container py-24 text-center">
          <Trophy size={48} className="text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="font-semibold text-lg mb-2">Tournoi introuvable</p>
          <Link to={competitionListPath} className="text-primary hover:underline text-sm">← Retour aux compétitions</Link>
        </div>
      </Layout>
    );
  }

  const isRegistered = comp.participants.some((p) => p.id === user?.id);
  const isFull = comp.participants.length >= comp.max_participants;
  const fillPct = Math.min(100, Math.round((comp.participants.length / comp.max_participants) * 100));
  const cfg = statusConfig[comp.status] ?? statusConfig.closed;
  const sportEmoji = SPORT_EMOJI[comp.sport] ?? "🏆";

  return (
    <Layout>
      <div className="container py-10">
        <Link
          to={competitionListPath}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8 text-xs font-bold uppercase tracking-widest"
        >
          <ArrowLeft size={13} /> Retour aux compétitions
        </Link>

        <div className="grid lg:grid-cols-3 gap-10">

          {/* ── Main content ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* Header */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-2xl">{sportEmoji}</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${cfg.cls}`}>
                  {cfg.label}
                </span>
                {comp.sport && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {comp.sport}
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-3">{comp.name}</h1>
              {comp.description && <p className="text-muted-foreground leading-relaxed max-w-2xl">{comp.description}</p>}

              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Calendar size={14} className="text-primary/60" /> {formatDate(comp.start_date)}</span>
                {comp.end_date && <span className="flex items-center gap-1.5"><Clock size={14} className="text-primary/60" /> Fin: {formatDate(comp.end_date)}</span>}
                <span className="flex items-center gap-1.5"><MapPin size={14} className="text-primary/60" /> {comp.location}</span>
                {comp.arena_name && <span className="flex items-center gap-1.5"><Shield size={14} className="text-primary/60" /> {comp.arena_name}</span>}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
              {([["overview", "Aperçu", Info], ["participants", "Joueurs inscrits", Users]] as [Tab, string, typeof Info][]).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                    tab === t
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                  {t === "participants" && (
                    <span className="ml-1 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-mono">
                      {comp.participants.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab: Overview */}
            {tab === "overview" && (
              <div className="space-y-6">
                <CompetitionLiveMatchPanel competitionId={comp.id} />

                {comp.rules ? (
                  <section>
                    <h3 className="flex items-center gap-2 font-bold mb-3 text-sm uppercase tracking-widest text-muted-foreground">
                      <Scroll size={14} /> Règlement & Format
                    </h3>
                    <div className="gradient-card rounded-xl border border-border p-5 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {comp.rules}
                    </div>
                  </section>
                ) : (
                  <div className="gradient-card rounded-xl border border-border/50 p-8 text-center text-muted-foreground text-sm">
                    <Scroll size={24} className="mx-auto mb-3 opacity-30" />
                    <p>Le règlement n'a pas encore été publié.</p>
                  </div>
                )}

                {comp.prizes ? (
                  <section>
                    <h3 className="flex items-center gap-2 font-bold mb-3 text-sm uppercase tracking-widest text-muted-foreground">
                      <Gift size={14} /> Récompenses
                    </h3>
                    <div className="space-y-3">
                      {comp.prizes.split("|").map((p, i) => (
                        <div key={i} className="flex items-center gap-4 gradient-card rounded-xl border border-border p-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shrink-0 ${
                            i === 0 ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" :
                            i === 1 ? "bg-slate-500/15 text-slate-300 border-slate-400/25" :
                            i === 2 ? "bg-amber-700/15 text-amber-500 border-amber-600/25" :
                            "bg-muted text-muted-foreground border-border"
                          }`}>
                            {i === 0 ? <Crown size={14} /> : i <= 2 ? <Medal size={14} /> : i + 1}
                          </div>
                          <span className="text-sm text-foreground font-medium">{p.trim()}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}

            {/* Tab: Participants */}
            {tab === "participants" && (
              <div className="space-y-3">
                {comp.participants.length === 0 ? (
                  <div className="gradient-card rounded-xl border border-border p-10 text-center">
                    <UserCheck size={32} className="text-muted-foreground mx-auto mb-3 opacity-30" />
                    <p className="font-semibold mb-1">Aucun joueur inscrit</p>
                    <p className="text-sm text-muted-foreground">Soyez le premier à vous inscrire !</p>
                  </div>
                ) : (
                  comp.participants.map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-4 rounded-xl border px-4 py-3 hover:bg-muted/20 transition-colors ${
                        p.id === user?.id ? "border-primary/30 bg-primary/5" : "border-border gradient-card"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${
                        i === 0 ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" :
                        i === 1 ? "bg-slate-500/15 text-slate-300 border-slate-400/25" :
                        i === 2 ? "bg-amber-700/15 text-amber-500 border-amber-600/25" :
                        "bg-muted text-muted-foreground border-border"
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          {p.name}
                          {p.id === user?.id && (
                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Vous</span>
                          )}
                        </div>
                        {p.registeredAt && (
                          <div className="text-xs text-muted-foreground">
                            Inscrit le {new Date(p.registeredAt).toLocaleDateString("fr-FR")}
                          </div>
                        )}
                      </div>
                      <div className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md shrink-0">
                        {p.ranking} pts
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-5">

            {/* Registration card */}
            <div className="gradient-card rounded-2xl border border-primary/20 p-6 sticky top-24 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Inscription</h3>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                  {cfg.label}
                </span>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center border-b border-border/60 pb-3">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Calendar size={13} /> Date de début</span>
                  <span className="font-semibold">{formatDate(comp.start_date)}</span>
                </div>
                {comp.registration_deadline && (
                  <div className="flex justify-between items-center border-b border-border/60 pb-3">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Clock size={13} /> Clôture inscriptions</span>
                    <span className="font-semibold text-amber-400">{formatDate(comp.registration_deadline)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-b border-border/60 pb-3">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Users size={13} /> Participants</span>
                  <span className="font-semibold">{comp.participants.length} / {comp.max_participants}</span>
                </div>
              </div>

              {/* Fill bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Places occupées</span>
                  <span className="font-bold">{fillPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${fillPct >= 100 ? "bg-amber-500" : fillPct >= 75 ? "bg-orange-500" : "bg-primary"}`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>

              {isRegistered ? (
                <div className="flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl p-4 font-bold text-sm">
                  <CheckCircle2 size={18} /> Vous êtes inscrit(e)
                </div>
              ) : (
                <Button
                  size="lg"
                  className="w-full h-12 font-bold glow-yellow"
                  onClick={handleRegister}
                  disabled={registering || isFull || comp.status !== "open"}
                >
                  {registering
                    ? "Inscription..."
                    : isFull
                      ? "Complet"
                      : comp.status !== "open"
                        ? "Inscriptions fermées"
                        : "M'inscrire maintenant"}
                </Button>
              )}

              {!user && (
                <p className="text-xs text-muted-foreground text-center">
                  <Link to="/login" className="text-primary hover:underline">Connectez-vous</Link> pour vous inscrire.
                </p>
              )}
            </div>

            {/* Sport badge */}
            <div className="gradient-card rounded-2xl border border-border p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Informations</h4>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sport</span>
                  <span className="font-semibold">{sportEmoji} {comp.sport}</span>
                </div>
                {comp.arena_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Arena</span>
                    <span className="font-semibold">{comp.arena_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lieu</span>
                  <span className="font-semibold text-right max-w-[140px]">{comp.location}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CompetitionDetails;
