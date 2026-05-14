import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import {
  BarChart3, Trophy, Zap,
  Calendar, MapPin, Clock, Users,
  ChevronDown, Download, Smartphone, Loader2, GraduationCap,
  Video, Play,
} from "lucide-react";
import { toast } from "sonner";
import { api, resolveApiUrl } from "@/lib/api";
import { getSessionUser, getToken } from "@/lib/session";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import QRCode from "qrcode";
import PlayerLiveSessionCard from "@/components/smartplay/PlayerLiveSessionCard";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReservationRecord = {
  id: number; reservation_date: string; start_time: string; end_time: string;
  status: string; payment_status: string; court_name: string; arena_name: string;
  arena_city?: string; court_type?: string; surface_type?: string; has_lighting?: boolean;
  booking_type?: string; total_price?: number; amount?: number; currency?: string;
  num_players?: number; notes?: string; created_at?: string;
  coach_name?: string; coach_specialization?: string;
};

type CompetitionRecord = {
  competition_id: number; name: string; sport: string; start_date: string;
  competition_status: string; registration_status: string; arena_name: string;
};

type SmartPlayClip = {
  id: number;
  originalFilename: string;
  sportType: string;
  courtName: string | null;
  playedDate: string | null;
  playedTime: string | null;
  durationSec: number | null;
  sharedAt: string | null;
  jobStatus: string | null;
  renderedVideoPath: string | null;
};

// ── Section Tabs ──────────────────────────────────────────────────────────────

const toCurrencyAmount = (value: unknown) => {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const sections = [
  { id: "reservations", label: "Reservations", icon: Calendar },
  { id: "competitions", label: "Competitions", icon: Trophy },
  { id: "smartplay", label: "SmartPlay Videos", icon: Video },
];

// ── Expandable Reservation Card ───────────────────────────────────────────────

const ReservationCard = ({ res, expanded, onToggle }: {
  res: ReservationRecord;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mobileUrl, setMobileUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const isPaid = res.payment_status === "paid";
  const isCoaching = res.booking_type === "coaching_session";
  const price = toCurrencyAmount(res.total_price ?? res.amount);

  useEffect(() => {
    if (!expanded || !isPaid) return;
    api<{ url: string }>(`/api/reservations/${res.id}/ticket-link`, { authenticated: true })
      .then((d) => setMobileUrl(d.url))
      .catch(() => {});
  }, [expanded, isPaid, res.id]);

  useEffect(() => {
    if (!mobileUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, mobileUrl, {
      width: 160, margin: 2,
      color: { dark: "#f5c842", light: "#0a0a0f" },
    }).catch(() => {});
  }, [mobileUrl]);

  const download = async () => {
    setDownloading(true);
    try {
      const token = getToken();
      const resp = await fetch(`/api/reservations/${res.id}/ticket.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) { const p = await resp.json().catch(() => ({})); throw new Error(p.message ?? "Failed"); }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ultima-ticket-${res.id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={`gradient-card rounded-xl border transition-colors ${expanded ? "border-primary/40" : "border-border/40 hover:border-primary/20"}`}>
      {/* Summary row — always visible, click to expand */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left"
        onClick={onToggle}
      >
        <div className={`p-2 rounded-xl flex-shrink-0 ${isCoaching ? "bg-violet-500/10" : "bg-primary/10"}`}>
          {isCoaching ? <GraduationCap size={16} className="text-violet-400" /> : <MapPin size={16} className="text-primary" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm truncate">{res.court_name ?? "—"}</p>
            {isCoaching && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 uppercase tracking-wider">Coach session</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{res.arena_name}{res.arena_city ? ` · ${res.arena_city}` : ""}</p>
        </div>

        <div className="text-right flex-shrink-0 hidden sm:block">
          <p className="text-sm font-medium">{res.reservation_date}</p>
          <p className="text-xs text-muted-foreground">{String(res.start_time).slice(0,5)} – {String(res.end_time).slice(0,5)}</p>
        </div>

        <div className="flex flex-col gap-1 items-end flex-shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
            isPaid ? "bg-green-500/15 text-green-300" : "bg-amber-500/15 text-amber-300"
          }`}>{isPaid ? "Paid" : res.payment_status ?? "pending"}</span>
          {price !== null && (
            <span className="text-xs font-bold text-primary">
              {price.toFixed(3)} {res.currency ?? "TND"}
            </span>
          )}
        </div>

        <ChevronDown size={16} className={`text-muted-foreground flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-5 border-t border-border/40 space-y-4 pt-4">
          {/* Coaching session banner */}
          {isCoaching && res.coach_name && (
            <div className="flex items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/8 p-3">
              <div className="p-1.5 rounded-lg bg-violet-500/15 flex-shrink-0">
                <GraduationCap size={16} className="text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Coaching Session</p>
                <p className="text-sm font-medium text-foreground">{res.coach_name}</p>
                {res.coach_specialization && (
                  <p className="text-xs text-muted-foreground capitalize">{res.coach_specialization}</p>
                )}
              </div>
            </div>
          )}

          {/* Detail grid */}
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar size={13} /> <span>{res.reservation_date}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={13} /> <span>{String(res.start_time).slice(0,5)} – {String(res.end_time).slice(0,5)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin size={13} /> <span>{res.arena_name}{res.arena_city ? `, ${res.arena_city}` : ""}</span>
              </div>
              {res.num_players && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users size={13} /> <span>{res.num_players} player{res.num_players > 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {res.court_name && (
                <p className="text-muted-foreground"><span className="text-foreground/70">Court:</span> {res.court_name}</p>
              )}
              {res.court_type && (
                <p className="text-muted-foreground capitalize"><span className="text-foreground/70">Type:</span> {res.court_type.replace("_", " ")}</p>
              )}
              {res.surface_type && (
                <p className="text-muted-foreground capitalize"><span className="text-foreground/70">Surface:</span> {res.surface_type}</p>
              )}
              {res.has_lighting && (
                <p className="text-amber-400 text-xs flex items-center gap-1"><Zap size={11} /> Lit court</p>
              )}
              {res.notes && <p className="text-muted-foreground text-xs italic">"{res.notes}"</p>}
            </div>
          </div>

          {/* Ticket section */}
          {isPaid ? (
            <div className="rounded-xl border border-border/40 bg-background/30 p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Your Ticket</p>
              <Button className="glow-yellow gap-2 h-9 text-sm w-full sm:w-auto" onClick={download} disabled={downloading}>
                {downloading ? <><Loader2 className="animate-spin" size={14} /> Generating…</> : <><Download size={14} /> Download PDF + QR Code</>}
              </Button>
              {mobileUrl ? (
                <div className="flex items-start gap-4 mt-2">
                  <div className="rounded-xl overflow-hidden border border-primary/30 p-1.5 bg-[#0a0a0f] shrink-0"
                    style={{ boxShadow: "0 0 16px hsl(var(--primary)/0.15)" }}>
                    <canvas ref={canvasRef} />
                  </div>
                  <div className="flex flex-col gap-1 justify-center">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <Smartphone size={13} /> Scan to download on phone
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Point your camera — PDF downloads directly.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> Loading QR code…
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300">
              Payment pending — complete payment to unlock your ticket and QR code.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const Performance = () => {
  const user = getSessionUser();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeTab = location.pathname.endsWith("/ai") ? "smartplay" : location.pathname.endsWith("/competitions") ? "competitions" : "reservations";
  const initialTab = sections.some((s) => s.id === searchParams.get("tab")) ? searchParams.get("tab")! : routeTab;
  const [tab, setTab] = useState(initialTab);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([]);
  const [myClips, setMyClips] = useState<SmartPlayClip[]>([]);
  const [resLoading, setResLoading] = useState(false);
  const [compLoading, setCompLoading] = useState(false);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [clipVideoUrls, setClipVideoUrls] = useState<Record<number, string>>({});
  const [expandedResId, setExpandedResId] = useState<number | null>(null);

  // Load section-specific data
  useEffect(() => {
    if (!user) return;
    if (tab === "reservations" && !reservations.length) {
      setResLoading(true);
      api<{ reservations: ReservationRecord[] }>("/api/player/history/reservations", { authenticated: true })
        .then((r) => setReservations(r.reservations))
        .catch(() => {
          api<{ reservations: ReservationRecord[] }>("/api/reservations/my", { authenticated: true })
            .then((r) => setReservations(r.reservations))
            .catch(() => {});
        })
        .finally(() => setResLoading(false));
    }
    if (tab === "competitions" && !competitions.length) {
      setCompLoading(true);
      api<{ competitions: CompetitionRecord[] }>("/api/player/history/competitions", { authenticated: true })
        .then((r) => setCompetitions(r.competitions))
        .catch(() => {})
        .finally(() => setCompLoading(false));
    }
    if (tab === "smartplay" && !myClips.length) {
      setClipsLoading(true);
      api<{ clips: SmartPlayClip[] }>("/api/smartplay/my-clips", { authenticated: true })
        .then((r) => setMyClips(r.clips))
        .catch(() => {})
        .finally(() => setClipsLoading(false));
    }
  }, [tab, user?.id]);

  if (!user) {
    return (
      <Layout>
        <div className="container py-24 text-center">
          <BarChart3 size={48} className="text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold">Sign in to see your analytics</h2>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-8 lg:py-12 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <BarChart3 size={22} className="text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-gradient uppercase tracking-tighter">
                My Analytics
              </h1>
              <p className="text-muted-foreground text-sm">{user.firstName} {user.lastName} · Performance Dashboard</p>
            </div>
          </div>
        </div>

        {/* Coming Soon Banner */}
        <div className="gradient-card rounded-2xl border border-primary/20 p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-primary/10 flex-shrink-0">
            <Zap size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold flex items-center gap-2">
              VAR Review System
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">Coming Soon</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Advanced AI match analytics, ranking scores, and VAR-powered match review will appear here once the system is live.
            </p>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                tab === s.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <s.icon size={14} />
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Reservations Tab ── */}
        {tab === "reservations" && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Calendar size={18} className="text-primary" /> Reservation History
            </h3>
            {resLoading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : !reservations.length ? (
              <div className="text-center py-16">
                <Calendar size={48} className="text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No reservations yet. Book your first court!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reservations.map((res) => (
                  <ReservationCard
                    key={res.id}
                    res={res}
                    expanded={expandedResId === res.id}
                    onToggle={() => setExpandedResId(expandedResId === res.id ? null : res.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SmartPlay Videos Tab ── */}
        {tab === "smartplay" && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Video size={18} className="text-primary" /> My SmartPlay Videos
            </h3>
            <PlayerLiveSessionCard />
            {clipsLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
            ) : !myClips.length ? (
              <div className="text-center py-16">
                <Video size={48} className="text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No SmartPlay videos shared with you yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Your coach or admin will share your match analysis videos here.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {myClips.map((clip) => (
                  <div key={clip.id} className="gradient-card rounded-2xl border border-border/40 p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{clip.originalFilename}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {clip.playedDate && (
                            <span className="flex items-center gap-1">
                              <Calendar size={11} />
                              {new Date(clip.playedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                              {clip.playedTime && ` at ${clip.playedTime}`}
                            </span>
                          )}
                          {clip.courtName && (
                            <span className="flex items-center gap-1"><MapPin size={11} />{clip.courtName}</span>
                          )}
                          {clip.durationSec && (
                            <span className="flex items-center gap-1"><Clock size={11} />{Math.round(clip.durationSec)}s</span>
                          )}
                          <span className="uppercase tracking-widest font-bold text-primary/70">{clip.sportType}</span>
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 border border-green-500/20">
                        Ready
                      </span>
                    </div>
                    {clipVideoUrls[clip.id] ? (
                      <video
                        src={clipVideoUrls[clip.id]}
                        controls
                        className="w-full rounded-xl border border-border/50 bg-black aspect-video object-contain"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const token = getToken();
                          try {
                            const resp = await fetch(resolveApiUrl(`/api/smartplay/my-clips/${clip.id}/rendered-video`), {
                              headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (!resp.ok) throw new Error("Video not available.");
                            const url = URL.createObjectURL(await resp.blob());
                            setClipVideoUrls((prev) => ({ ...prev, [clip.id]: url }));
                          } catch {
                            toast.error("Could not load video.");
                          }
                        }}
                        className="flex aspect-video w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/10 text-sm text-muted-foreground hover:bg-muted/20 transition-colors"
                      >
                        <Play size={20} /> Watch match analysis
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Competitions Tab ── */}
        {tab === "competitions" && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Trophy size={18} className="text-primary" /> Competition History
            </h3>
            {compLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : !competitions.length ? (
              <div className="text-center py-16">
                <Trophy size={48} className="text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">You haven't joined any competitions yet.</p>
                <Button variant="outline" className="mt-4" onClick={() => window.location.href = "/player/competitions"}>
                  Browse Competitions
                </Button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {competitions.map((comp) => (
                  <div key={comp.competition_id} className="gradient-card rounded-xl border border-border/40 p-5 hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{comp.name}</p>
                        <p className="text-xs text-muted-foreground">{comp.arena_name}</p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                        comp.registration_status === "registered"
                          ? "bg-green-500/15 text-green-300"
                          : "bg-muted text-muted-foreground"
                      }`}>{comp.registration_status}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Trophy size={10} />{comp.sport}</span>
                      <span className="flex items-center gap-1"><Calendar size={10} />{comp.start_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Performance;
