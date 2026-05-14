import { Camera, CircleDot } from "lucide-react";
import type { LiveVisualUpdate } from "./liveTypes";

export default function LiveVideoPanel({
  update,
  cameraName,
  videoUrl,
  renderedUrl,
}: {
  update: LiveVisualUpdate | null;
  cameraName?: string | null;
  videoUrl?: string | null;
  renderedUrl?: string | null;
}) {
  const playerCount = update?.players?.length ?? update?.pose?.trackedPlayers ?? null;
  const ballTracked = update?.ball != null && (
    (update.ball.x != null && update.ball.y != null) ||
    update.ball.confidence != null ||
    update.ball.image != null
  );

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-zinc-950">
      {renderedUrl ? (
        /* FastAPI rendered stream — visualization script output with all annotations */
        <img
          key={renderedUrl}
          src={renderedUrl}
          className="absolute inset-0 h-full w-full bg-black object-contain"
          alt="Rendered SmartPlay live analysis"
        />
      ) : videoUrl ? (
        /* Source video — raw feed, no overlays (AI output shown in minimap + telemetry) */
        <video
          key={videoUrl}
          src={videoUrl}
          className="absolute inset-0 h-full w-full bg-black object-contain"
          controls
          autoPlay
          muted
          playsInline
        />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(245,200,66,0.12),transparent_45%),radial-gradient(circle_at_center,rgba(16,185,129,0.18),transparent_42%)]" />
      )}

      {/* Camera label */}
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-white/80">
        <Camera size={14} />
        {renderedUrl ? "Rendered AI live" : (cameraName ?? "Live camera")}
      </div>

      {/* Status bar */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg bg-black/45 px-3 py-2 text-xs text-white/70">
        <CircleDot size={12} className={update ? "text-red-400 animate-pulse" : "text-muted-foreground"} />
        Frame {update?.frame ?? "-"}
        {update?.fps != null && (
          <span className="ml-1 font-mono text-emerald-300">{Math.round(update.fps as number)} fps</span>
        )}
        {" · "}players {playerCount ?? 0}
        {" · "}ball {ballTracked ? "tracked" : "waiting"}
      </div>

      {/* No rendered stream banner — only shown when source video plays without annotations */}
      {!renderedUrl && videoUrl && !update && (
        <div className="absolute inset-x-4 bottom-16 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/80">
          AI pipeline starting — annotated stream available once SmartPlay AI service is connected.
        </div>
      )}
    </div>
  );
}
