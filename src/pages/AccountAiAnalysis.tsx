import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Brain, CheckCircle2, Clock, ExternalLink, Film, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, resolveApiUrl } from "@/lib/api";
import { getToken } from "@/lib/session";
import { useLocale } from "@/i18n/locale";

type SmartPlayClip = {
  id: number;
  originalFilename: string;
  courtName: string | null;
  jobStatus: string | null;
  renderedVideoPath: string | null;
  sharedAt: string | null;
};

function statusVariant(s: string | null): "secondary" | "outline" | "destructive" {
  if (s === "done" || s === "completed") return "secondary";
  if (s === "error" || s === "failed") return "destructive";
  return "outline";
}

export default function AccountAiAnalysis() {
  const { t } = useLocale();
  const [clips, setClips] = useState<SmartPlayClip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ clips: SmartPlayClip[] }>("/api/smartplay/my-clips", { authenticated: true })
      .then((d) => setClips(d.clips ?? []))
      .catch(() => setClips([]))
      .finally(() => setLoading(false));
  }, []);

  const videoUrl = (clip: SmartPlayClip) => {
    const token = getToken();
    if (!clip.renderedVideoPath || !token) return null;
    return resolveApiUrl(`/api/smartplay/clips/${clip.id}/rendered?token=${encodeURIComponent(token)}`);
  };

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
          <h1 className="mt-1.5 font-display text-2xl font-bold">{t("account.ai.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("account.ai.subtitle")}</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : clips.length ? (
          <div className="space-y-3">
            {clips.map((clip) => {
              const url = videoUrl(clip);
              const isDone = clip.jobStatus === "done" || clip.jobStatus === "completed";
              const isProcessing = clip.jobStatus === "processing" || clip.jobStatus === "pending";
              return (
                <div
                  key={clip.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center"
                >
                  <div className="rounded-xl bg-primary/10 p-2.5 shrink-0">
                    {isProcessing
                      ? <Loader2 size={16} className="text-primary animate-spin" />
                      : isDone
                      ? <CheckCircle2 size={16} className="text-green-400" />
                      : <Film size={16} className="text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{clip.courtName ?? clip.originalFilename}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                      {clip.sharedAt && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {new Date(clip.sharedAt).toLocaleDateString()}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground/70 truncate">{clip.originalFilename}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant(clip.jobStatus)}>{clip.jobStatus ?? "—"}</Badge>
                    {url && isDone && (
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={12} /> {t("account.ai.watchBtn")}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Brain size={36} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-semibold text-sm text-muted-foreground">{t("account.ai.empty")}</p>
            <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm mx-auto">{t("account.ai.emptyHint")}</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
