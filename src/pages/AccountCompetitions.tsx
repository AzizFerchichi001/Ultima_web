import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, ChevronRight, MapPin, Trophy } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useLocale } from "@/i18n/locale";

type CompetitionRecord = {
  competition_id?: number;
  id?: number;
  name: string;
  arena_name?: string;
  start_date: string;
  competition_status?: string;
  registration_status?: string;
};

export default function AccountCompetitions() {
  const { t } = useLocale();
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ competitions: CompetitionRecord[] }>("/api/player/history/competitions", { authenticated: true })
      .then((d) => setCompetitions(d.competitions ?? []))
      .catch(() => setCompetitions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="container py-8 space-y-6">
        <Link
          to="/account"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> {t("account.back")}
        </Link>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("account.title")}</p>
            <h1 className="mt-1.5 font-display text-2xl font-bold">{t("account.competitions.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("account.competitions.subtitle")}</p>
          </div>
          <Button asChild variant="outline" className="gap-2 shrink-0">
            <Link to="/competitions">
              <Trophy size={14} /> {t("account.competitions.browse")}
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : competitions.length ? (
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
                    {comp.registration_status && (
                      <Badge variant="secondary">{comp.registration_status}</Badge>
                    )}
                    <ChevronRight size={14} className="text-muted-foreground/50" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Trophy size={36} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-semibold text-sm text-muted-foreground">{t("account.competitions.empty")}</p>
            <Button asChild size="sm" className="mt-4 gap-2">
              <Link to="/competitions">{t("account.competitions.browse")}</Link>
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
