import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import {
  Brain, Zap, Target, Activity, Clock3, CheckCircle2, AlertCircle,
  BarChart3, TrendingUp, MapPin, Eye, Cpu, Radio, Wifi, WifiOff,
  RefreshCw, Flame, Loader2, ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type SmartPlayStatus = {
  connected: boolean;
  version?: string | null;
  message: string;
  features?: {
    court_detection: boolean;
    player_tracking: boolean;
    ball_tracking: boolean;
    smart_scoring: boolean;
    heatmap: boolean;
    performance_analysis: boolean;
  };
};

type AnalysisJob = {
  id: number;
  job_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  player1_name?: string;
  player2_name?: string;
  match_date?: string;
};

type AiAnalysis = {
  id: number;
  title: string;
  videoName: string;
  status: string;
  summary: string;
  createdAt: string;
};

// ── Status config ─────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; cls: string; icon: typeof Clock3 }> = {
  queued:      { label: "Queued",      cls: "bg-amber-500/15 text-amber-300 border-amber-500/20",   icon: Clock3 },
  processing:  { label: "Processing",  cls: "bg-blue-500/15 text-blue-300 border-blue-500/20 animate-pulse", icon: RefreshCw },
  pending_ai:  { label: "Pending AI",  cls: "bg-purple-500/15 text-purple-300 border-purple-500/20", icon: Brain },
  completed:   { label: "Completed",   cls: "bg-green-500/15 text-green-300 border-green-500/20",   icon: CheckCircle2 },
  ready:       { label: "Ready",       cls: "bg-green-500/15 text-green-300 border-green-500/20",   icon: CheckCircle2 },
  failed:      { label: "Failed",      cls: "bg-red-500/15 text-red-300 border-red-500/20",         icon: AlertCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.queued;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

// ── AI Feature roadmap tiles ──────────────────────────────────────────────────

const AI_FEATURES = [
  { icon: Eye,        label: "Court Detection",   desc: "Automatic court boundary mapping and homography",    ready: false },
  { icon: Activity,   label: "Player Tracking",   desc: "Real-time player position tracking per frame",       ready: false },
  { icon: Zap,        label: "Ball Tracking",     desc: "Ball trajectory analysis at 120fps",                 ready: false },
  { icon: Target,     label: "Smart Scoring",     desc: "Automatic point detection and scoring",              ready: false },
  { icon: Flame,      label: "Event Detection",   desc: "Bounce, net, out, winner detection",                 ready: false },
  { icon: BarChart3,  label: "Match Analysis",    desc: "Full match statistics and breakdowns",               ready: false },
  { icon: MapPin,     label: "Player Heatmap",    desc: "Spatial movement and coverage analysis",             ready: false },
  { icon: TrendingUp, label: "Performance AI",    desc: "AI-powered player progression analysis",             ready: false },
];

// ── Access Denied ─────────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <Layout>
      <div className="container py-24 flex flex-col items-center text-center gap-4">
        <AlertCircle size={40} className="text-destructive" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground text-sm">This page is for arena administrators only.</p>
      </div>
    </Layout>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SmartPlayAI = () => {
  const user = getSessionUser();

  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return <AccessDenied />;
  }

  const [aiStatus, setAiStatus] = useState<SmartPlayStatus | null>(null);
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [legacyAnalyses, setLegacyAnalyses] = useState<AiAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [statusRes, jobsRes, legacyRes] = await Promise.allSettled([
        api<SmartPlayStatus>("/api/smartplay/status"),
        api<{ jobs: AnalysisJob[] }>("/api/smartplay/analysis-jobs", { authenticated: true }),
        api<{ analyses: AiAnalysis[] }>("/api/ai/analyses", { authenticated: true }),
      ]);
      if (statusRes.status === "fulfilled") setAiStatus(statusRes.value);
      if (jobsRes.status === "fulfilled") setJobs(jobsRes.value.jobs ?? []);
      if (legacyRes.status === "fulfilled") setLegacyAnalyses(legacyRes.value.analyses ?? []);
    } catch { /* handled individually */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const queued     = jobs.filter((j) => j.status === "queued").length;
  const processing = jobs.filter((j) => ["processing", "pending_ai"].includes(j.status)).length;
  const completed  = jobs.filter((j) => ["completed", "ready"].includes(j.status)).length;
  const failed     = jobs.filter((j) => j.status === "failed").length;

  return (
    <Layout>
      <div className="container py-8 lg:py-12 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Brain size={24} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tighter">
                SmartPlay <span className="text-gradient">AI</span>
              </h1>
              <p className="text-muted-foreground text-sm">AI analysis management — {user.arenaName ?? "your arena"}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="shrink-0"
          >
            {refreshing
              ? <Loader2 size={14} className="animate-spin mr-2" />
              : <RefreshCw size={14} className="mr-2" />}
            Refresh
          </Button>
        </div>

        {/* AI Service Status */}
        {loading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : (
          <div className={`gradient-card rounded-2xl border p-5 flex items-center gap-4 ${
            aiStatus?.connected ? "border-green-500/30" : "border-orange-500/30"
          }`}>
            <div className={`p-3 rounded-xl flex-shrink-0 ${aiStatus?.connected ? "bg-green-500/10" : "bg-orange-500/10"}`}>
              {aiStatus?.connected
                ? <Wifi size={22} className="text-green-400" />
                : <WifiOff size={22} className="text-orange-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-bold text-sm">SmartPlay AI Microservice</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                  aiStatus?.connected
                    ? "bg-green-500/15 text-green-300 border-green-500/20"
                    : "bg-orange-500/15 text-orange-300 border-orange-500/20"
                }`}>
                  {aiStatus?.connected ? "Connected" : "Not Connected"}
                </span>
                {aiStatus?.version && (
                  <span className="text-[10px] text-muted-foreground">v{aiStatus.version}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{aiStatus?.message}</p>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Queued",     value: queued,     cls: "text-amber-300",  bg: "bg-amber-500/10",  border: "border-amber-500/20" },
              { label: "Processing", value: processing, cls: "text-blue-300",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
              { label: "Completed",  value: completed,  cls: "text-green-300",  bg: "bg-green-500/10",  border: "border-green-500/20" },
              { label: "Failed",     value: failed,     cls: "text-red-300",    bg: "bg-red-500/10",    border: "border-red-500/20" },
            ].map(({ label, value, cls, bg, border }) => (
              <div key={label} className={`gradient-card rounded-xl border ${border} p-4`}>
                <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest font-medium">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Analysis Queue */}
        <section className="space-y-4">
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Activity size={18} className="text-primary" /> Analysis Queue
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : jobs.length === 0 && legacyAnalyses.length === 0 ? (
            <div className="gradient-card rounded-2xl border border-border/40 p-12 text-center">
              <Brain size={36} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No analysis jobs yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Upload a match clip from the admin panel to start processing.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={`job-${job.id}`} className="gradient-card rounded-xl border border-border/40 p-4 flex items-center gap-4">
                  <div className="p-2 rounded-xl bg-purple-500/10 flex-shrink-0">
                    <Brain size={16} className="text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium capitalize">{job.job_type.replace(/_/g, " ")} Analysis</p>
                    {job.player1_name && (
                      <p className="text-xs text-muted-foreground">{job.player1_name}{job.player2_name ? ` vs ${job.player2_name}` : ""}</p>
                    )}
                  </div>
                  <StatusBadge status={job.status} />
                  <p className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                    {new Date(job.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {legacyAnalyses.map((analysis) => (
                <div key={`legacy-${analysis.id}`} className="gradient-card rounded-xl border border-border/40 p-4 flex items-center gap-4">
                  <div className="p-2 rounded-xl bg-primary/10 flex-shrink-0">
                    <Activity size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{analysis.title}</p>
                    {analysis.summary && (
                      <p className="text-xs text-muted-foreground truncate">{analysis.summary}</p>
                    )}
                  </div>
                  <StatusBadge status={analysis.status} />
                  <p className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                    {new Date(analysis.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* AI Feature Roadmap */}
        <section className="space-y-4">
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Cpu size={18} className="text-primary" /> Feature Roadmap
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {AI_FEATURES.map((feature) => (
              <div
                key={feature.label}
                className="gradient-card rounded-xl border border-border/40 p-4 hover:border-purple-500/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <feature.icon size={16} className="text-purple-400" />
                  <span className="text-sm font-bold">{feature.label}</span>
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    Soon
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Integration Note */}
        <div className="gradient-card rounded-2xl border border-purple-500/20 p-6 bg-purple-500/3">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-purple-500/10 flex-shrink-0">
              <Radio size={18} className="text-purple-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm mb-2">SmartPlay AI Pipeline</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Upload match clips from the <strong>Admin → Analysis</strong> tab to trigger the full AI pipeline.
                Once processed, results are automatically shared with the players in the match.
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {[
                  "Court calibration loaded from your court configuration",
                  "Homography applied automatically per court",
                  "Player and ball tracking processed at 120fps",
                  "Minimap, heatmap, and pose estimation rendered",
                  "Results available to players in their Performance page",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <ChevronRight size={10} className="text-purple-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SmartPlayAI;
