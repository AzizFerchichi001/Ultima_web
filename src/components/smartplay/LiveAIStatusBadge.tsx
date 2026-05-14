import { Activity, AlertTriangle, CheckCircle2, Clock, Radio } from "lucide-react";

const statusConfig = {
  running: {
    cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_hsl(142_76%_36%/0.15)]",
    icon: Radio,
    pulse: true,
  },
  starting: {
    cls: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    icon: Clock,
    pulse: true,
  },
  created: {
    cls: "border-blue-500/25 bg-blue-500/10 text-blue-300",
    icon: Activity,
    pulse: false,
  },
  stopped: {
    cls: "border-border/50 bg-muted/30 text-muted-foreground",
    icon: CheckCircle2,
    pulse: false,
  },
  error: {
    cls: "border-red-500/25 bg-red-500/10 text-red-300",
    icon: AlertTriangle,
    pulse: false,
  },
} as const;

export default function LiveAIStatusBadge({
  status,
  fps,
  message,
}: {
  status: string;
  fps?: number | null;
  message?: string | null;
}) {
  const cfg = statusConfig[status as keyof typeof statusConfig] ?? {
    cls: "border-border/50 bg-muted/30 text-muted-foreground",
    icon: Activity,
    pulse: false,
  };
  const Icon = cfg.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-widest backdrop-blur-sm transition-shadow ${cfg.cls}`}
    >
      <Icon size={13} className={cfg.pulse ? "animate-pulse" : ""} />
      <span>{status}</span>
      {typeof fps === "number" && fps > 0 && (
        <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal">
          {fps.toFixed(0)} fps
        </span>
      )}
      {message && (
        <span className="hidden max-w-56 truncate normal-case tracking-normal text-current/60 md:inline">
          {message}
        </span>
      )}
    </div>
  );
}
