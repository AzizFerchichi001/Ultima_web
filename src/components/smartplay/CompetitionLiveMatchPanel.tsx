import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import LiveAIStatusBadge from "./LiveAIStatusBadge";
import type { LiveSession } from "./liveTypes";

export default function CompetitionLiveMatchPanel({ competitionId }: { competitionId: number }) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);

  useEffect(() => {
    api<{ sessions: LiveSession[] }>("/api/live-sessions", { authenticated: true })
      .then((result) => setSessions(result.sessions.filter((session) => session.competitionId === competitionId && ["starting", "running"].includes(session.status))))
      .catch(() => setSessions([]));
  }, [competitionId]);

  if (!sessions.length) return null;

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
        <Radio size={15} className="text-primary animate-pulse" /> Live visual AI
      </h3>
      <div className="space-y-2">
        {sessions.map((session) => (
          <div key={session.id} className="flex flex-col gap-3 rounded-lg bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">{session.courtName ?? `Court ${session.courtId}`}</p>
              <p className="text-xs text-muted-foreground">Session #{session.id} · no scoring automation</p>
            </div>
            <div className="flex items-center gap-2">
              <LiveAIStatusBadge status={session.status} fps={session.fps} />
              <Button asChild size="sm"><Link to={`/live-sessions/${session.id}`}>Open</Link></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
