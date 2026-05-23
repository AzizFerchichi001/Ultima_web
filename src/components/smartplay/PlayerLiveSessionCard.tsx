import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import LiveAIStatusBadge from "./LiveAIStatusBadge";
import type { LiveSession } from "./liveTypes";

export default function PlayerLiveSessionCard() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);

  useEffect(() => {
    api<{ sessions: LiveSession[] }>("/api/live-sessions", { authenticated: true })
      .then((result) => setSessions(result.sessions))
      .catch(() => setSessions([]));
  }, []);

  const liveNow = sessions.filter((session) => ["created", "starting", "running"].includes(session.status));
  const history = sessions.filter((session) => ["stopped", "error"].includes(session.status)).slice(0, 5);

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
            <Radio size={15} className="text-primary" /> Live sessions
          </h3>
          <p className="text-sm text-muted-foreground">Visual AI sessions assigned to you.</p>
        </div>
      </div>
      <div className="space-y-2">
        {liveNow.map((session) => (
          <div key={session.id} className="flex flex-col gap-3 rounded-lg bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">{session.courtName ?? `Court ${session.courtId}`}</p>
              <p className="text-xs text-muted-foreground">{session.arenaName} · session #{session.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <LiveAIStatusBadge status={session.status} fps={session.fps} />
              <Button asChild size="sm" variant="outline"><Link to={`/live-sessions/${session.id}`}>Watch</Link></Button>
            </div>
          </div>
        ))}
        {!liveNow.length && <p className="text-sm text-muted-foreground">No live visual analysis is active for your account.</p>}
        {history.length > 0 && (
          <div className="mt-4 border-t border-border/50 pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Live history</p>
            <div className="space-y-2">
              {history.map((session) => (
                <div key={session.id} className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2 text-sm">
                  <span>{session.courtName ?? `Court ${session.courtId}`} · #{session.id}</span>
                  <Button asChild size="sm" variant="ghost"><Link to={`/live-sessions/${session.id}`}>Open</Link></Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
