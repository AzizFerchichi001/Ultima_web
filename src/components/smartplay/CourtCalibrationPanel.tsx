import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, MapPin, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

type CourtRow = {
  id: number;
  name: string;
  sport: string;
  court_type: string;
  arena_name: string;
  arena_location?: string | null;
  calib_id: number | null;
  calib_status: string | null;
  computed_at?: string | null;
  calib_updated_at?: string | null;
};

export default function CourtCalibrationPanel() {
  const [courts, setCourts] = useState<CourtRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCourts(); }, []);

  async function loadCourts() {
    setLoading(true);
    try {
      const res = await api<{ courts: CourtRow[] }>("/api/admin/courts-with-calibrations", { authenticated: true });
      setCourts(res.courts ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load courts.");
    } finally {
      setLoading(false);
    }
  }

  const courtsByArena = useMemo(() => {
    const map = new Map<string, CourtRow[]>();
    for (const court of courts) {
      const arena = court.arena_name ?? "No Arena";
      if (!map.has(arena)) map.set(arena, []);
      map.get(arena)!.push(court);
    }
    return map;
  }, [courts]);

  const calibratedCount = courts.filter((c) => c.calib_id).length;

  return (
    <section id="court-calibration-panel" className="gradient-card rounded-2xl border border-border/50 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-display font-bold flex items-center gap-2">
            <MapPin size={18} className="text-primary" /> Court Calibrations
          </h3>
          <p className="text-xs text-muted-foreground">
            Calibration status for your courts — {calibratedCount} of {courts.length} calibrated.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={loadCourts} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-40 rounded-lg" />
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ))}
        </div>
      ) : courts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border/50 rounded-xl">
          No courts found for your arena.
        </p>
      ) : (
        <div className="space-y-3">
          {Array.from(courtsByArena.entries()).map(([arenaName, arenaCourts]) => {
            const calibCount = arenaCourts.filter((c) => c.calib_id).length;
            return (
              <details key={arenaName} className="group">
                <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3 hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <MapPin size={13} className="shrink-0 text-primary" />
                    <span className="text-sm font-bold">{arenaName}</span>
                    <span className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {arenaCourts.length} court{arenaCourts.length !== 1 ? "s" : ""}
                    </span>
                    {calibCount > 0 && (
                      <span className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
                        {calibCount} calibrated
                      </span>
                    )}
                  </div>
                  <ChevronDown size={14} className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>

                <div className="mt-2 space-y-1.5 pl-2">
                  {arenaCourts.map((court) => {
                    const lastDate = court.computed_at ?? court.calib_updated_at;
                    return (
                      <div
                        key={court.id}
                        className="flex items-center justify-between rounded-xl border border-border/40 bg-background/30 px-4 py-3 gap-3"
                      >
                        <div>
                          <p className="text-sm font-semibold">{court.name}</p>
                          <p className="text-xs capitalize text-muted-foreground">
                            {court.court_type ?? court.sport ?? "padel"}
                            {lastDate && (
                              <span className="ml-2 text-muted-foreground/60">
                                · last calibrated {new Date(lastDate).toLocaleDateString()}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {court.calib_id ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-green-400">
                              <CheckCircle2 size={10} /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                              <AlertCircle size={10} /> Not calibrated
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
