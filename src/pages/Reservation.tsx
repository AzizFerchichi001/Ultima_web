import { useEffect, useMemo, useState, useCallback } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar, MapPin, CheckCircle, ArrowRight, Users, Search,
  Building2, Sun, Zap, ChevronLeft, CreditCard, Clock,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Layers, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr as frLocale, enUS } from "date-fns/locale";
import { api } from "@/lib/api";
import { getSessionUser, SessionUser, getToken } from "@/lib/session";
import { Link, useLocation } from "react-router-dom";
import UserReservations from "@/components/UserReservations";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/i18n/locale";

/* ── Types ──────────────────────────────────────────────────────────────── */

type Arena = {
  id: number;
  name: string;
  slug: string;
  city: string | null;
  region: string | null;
  description: string | null;
  heroImageUrl: string | null;
  amenities: string[];
  terrainCount: number;
  hasIndoor: boolean;
  hasOutdoor: boolean;
};

type Terrain = {
  id: number;
  arenaId: number;
  name: string;
  sport: string;
  status: "available" | "occupied" | "maintenance";
  courtType: "indoor" | "outdoor" | "semi_covered";
  surfaceType: string | null;
  hasLighting: boolean;
  isPanoramic: boolean;
  pricePerHour: number | null;
  currency: string;
  imageUrl: string | null;
  hasSumma: boolean;
  minPlayers: number;
  maxPlayers: number;
  openingTime: string;
  closingTime: string;
  description: string | null;
  available?: boolean;
  availabilityReason?: string;
};

type ParticipantStatus = "creator" | "confirmed" | "invited" | "pending_account" | "cancelled";
type Participant = {
  id?: number;
  userId?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email: string;
  status?: ParticipantStatus;
  role?: "creator" | "participant";
};

type ReservationResult = {
  id: number;
  court_name: string;
  sport: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  qr_token: string;
  participants: Participant[];
};

/* ── Constants ───────────────────────────────────────────────────────────── */

const DURATIONS = [
  { label: "1h", value: 60 },
  { label: "1h30", value: 90 },
  { label: "2h", value: 120 },
  { label: "2h30", value: 150 },
  { label: "3h", value: 180 },
];

const TIME_SLOTS = Array.from({ length: 32 }, (_, i) => {
  const h = Math.floor(i / 2) + 7;
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const today = new Date(); today.setHours(0, 0, 0, 0);
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/* ── Confetti ────────────────────────────────────────────────────────────── */

function useConfetti(trigger: boolean) {
  useEffect(() => {
    if (!trigger) return;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none;width:100%;height:100%";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    const colors = ["#00E5FF", "#2C63BD", "#7ADFFF", "#FFFFFF", "#1D9FE8", "#A7ECFF", "#67D8FF"];
    type Particle = { x: number; y: number; vx: number; vy: number; color: string; w: number; h: number; alpha: number; rotation: number; rotV: number };
    const particles: Particle[] = [];
    for (let i = 0; i < 130; i++) {
      particles.push({ x: canvas.width / 2 + (Math.random() - 0.5) * 300, y: canvas.height * 0.45, vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 5, color: colors[Math.floor(Math.random() * colors.length)], w: Math.random() * 10 + 4, h: Math.random() * 5 + 3, alpha: 1, rotation: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.25 });
    }
    let raf: number;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) { p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rotation += p.rotV; p.alpha -= 0.011; if (p.alpha > 0) { alive = true; ctx.save(); ctx.globalAlpha = p.alpha; ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); } }
      if (alive) raf = requestAnimationFrame(tick); else canvas.remove();
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); canvas.remove(); };
  }, [trigger]);
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

function ArenaCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden bg-card border border-border">
      <Skeleton className="h-40 w-full" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2 pt-1"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></div>
        <Skeleton className="h-9 w-full rounded-xl mt-2" />
      </div>
    </div>
  );
}

/* ── TerrainCard ─────────────────────────────────────────────────────────── */

function TerrainCard({ terrain, onBook, booking, t }: {
  terrain: Terrain;
  onBook: (t: Terrain) => void;
  booking: boolean;
  t: (key: string) => string;
}) {
  const [imgError, setImgError] = useState(false);
  const showAvailability = terrain.available !== undefined;

  const availBadge = () => {
    if (!showAvailability) return null;
    if (terrain.availabilityReason === "maintenance" || terrain.status === "maintenance") {
      return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-full"><AlertTriangle className="w-3 h-3" />{t("padel.terrain.maintenance")}</span>;
    }
    if (terrain.available) {
      return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full"><CheckCircle2 className="w-3 h-3" />{t("padel.terrain.available")}</span>;
    }
    const reasonMap: Record<string, string> = {
      reserved: t("padel.terrain.reserved"),
      before_opening: t("padel.terrain.beforeOpening"),
      after_closing: t("padel.terrain.afterClosing"),
    };
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-2.5 py-1 rounded-full"><XCircle className="w-3 h-3" />{reasonMap[terrain.availabilityReason ?? ""] ?? t("padel.terrain.unavailable")}</span>;
  };

  return (
    <div className={`rounded-2xl border overflow-hidden bg-card transition-all duration-200 ${showAvailability && terrain.available ? "ring-2 ring-emerald-500/30 shadow-md" : "border-border"}`}>
      <div className="relative h-40 bg-muted overflow-hidden">
        {!imgError && terrain.imageUrl ? (
          <img src={terrain.imageUrl} alt={terrain.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/60">
            <Layers className="w-10 h-10 text-muted-foreground/30" />
          </div>
        )}
        {terrain.isPanoramic && (
          <div className="absolute top-2 left-2">
            <span className="text-[10px] font-bold text-white bg-violet-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Eye className="w-2.5 h-2.5" />Panoramic</span>
          </div>
        )}
        {terrain.hasSumma && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">SUMMA</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm">{terrain.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${terrain.courtType === "indoor" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                {terrain.courtType === "indoor" ? "Indoor" : terrain.courtType === "outdoor" ? "Outdoor" : t("padel.terrain.semiCovered")}
              </span>
              {terrain.hasLighting && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 font-medium"><Zap className="w-2.5 h-2.5" />{t("padel.terrain.lit")}</span>
              )}
            </div>
          </div>
          {terrain.pricePerHour && (
            <div className="text-right shrink-0">
              <span className="text-sm font-bold text-primary">{terrain.pricePerHour}</span>
              <span className="text-xs text-muted-foreground"> {terrain.currency}/h</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {terrain.surfaceType && <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{terrain.surfaceType}</span>}
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{terrain.openingTime}–{terrain.closingTime}</span>
        </div>

        {availBadge()}

        {showAvailability && terrain.available && (
          <Button size="sm" className="w-full rounded-xl gap-1.5 text-xs glow-yellow" onClick={() => onBook(terrain)} disabled={booking}>
            {booking ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t("res.terrain.booking")}</> : t("res.terrain.book")}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

const Reservation = () => {
  const { locale, t } = useLocale();
  const dateLocale = locale === "fr" ? frLocale : enUS;
  const [user, setUser] = useState<SessionUser | null>(null);
  const location = useLocation();
  useEffect(() => { setUser(getSessionUser()); }, [location.pathname]);

  const steps = useMemo(() => [
    t("res.step.arena"), t("res.step.availability"), t("res.step.players"),
    t("res.step.review"), t("res.step.confirmed"),
  ], [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState(0);

  // Arena
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [loadingArenas, setLoadingArenas] = useState(true);
  const [arenaSearch, setArenaSearch] = useState("");
  const [arenaCityFilter, setArenaCityFilter] = useState("");
  const [selectedArena, setSelectedArena] = useState<Arena | null>(null);

  // Availability
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [calOpen, setCalOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(90);
  const [availableTerrains, setAvailableTerrains] = useState<Terrain[] | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [selectedTerrain, setSelectedTerrain] = useState<Terrain | null>(null);

  // Players
  const [participantCount, setParticipantCount] = useState(2);
  const [participantEmails, setParticipantEmails] = useState(["", "", ""]);
  const [participantPreview, setParticipantPreview] = useState<Participant[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Confirmation
  const [confirmedReservation, setConfirmedReservation] = useState<ReservationResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  useConfetti(showConfetti);

  // Billing
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "paying">("idle");

  useEffect(() => {
    api<{ places: Arena[] }>("/api/padel/places")
      .then((r) => setArenas(r.places))
      .catch(() => toast.error("Failed to load arenas."))
      .finally(() => setLoadingArenas(false));
  }, []);

  const filteredArenas = useMemo(() => arenas.filter((a) => {
    const matchSearch = !arenaSearch || a.name.toLowerCase().includes(arenaSearch.toLowerCase()) || (a.city ?? "").toLowerCase().includes(arenaSearch.toLowerCase());
    const matchCity = !arenaCityFilter || a.city === arenaCityFilter || a.region === arenaCityFilter;
    return matchSearch && matchCity;
  }), [arenas, arenaSearch, arenaCityFilter]);

  const uniqueCities = useMemo(() => {
    const cities = new Set(arenas.map((a) => a.city ?? a.region).filter(Boolean) as string[]);
    return Array.from(cities).slice(0, 8);
  }, [arenas]);

  const endTime = useMemo(() => {
    if (!selectedTime) return "";
    const [h, m] = selectedTime.split(":").map(Number);
    const totalMins = h * 60 + m + selectedDuration;
    return `${String(Math.floor(totalMins / 60)).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
  }, [selectedTime, selectedDuration]);

  const totalPrice = useMemo(() => {
    const price = Number(selectedTerrain?.pricePerHour ?? 50);
    return parseFloat((price * (selectedDuration / 60)).toFixed(3));
  }, [selectedTerrain, selectedDuration]);

  const selectedParticipants = participantEmails.slice(0, Math.max(0, participantCount - 1));
  const participantStatusLabel = (status?: ParticipantStatus) => {
    if (status === "creator") return t("res.participantStatus.creator");
    if (status === "pending_account") return t("res.participantStatus.pendingAccount");
    if (status === "invited") return t("res.participantStatus.invited");
    if (status === "cancelled") return t("status.cancelled");
    return t("status.confirmed");
  };

  /* ── Handlers ──────────────────────────────────────────────────────────── */

  const checkAvailability = useCallback(async () => {
    if (!selectedArena || !selectedDate) { toast.error("Please choose a date."); return; }
    setAvailLoading(true);
    setAvailableTerrains(null);
    try {
      const params = new URLSearchParams({ date: toDateKey(selectedDate), durationMinutes: String(selectedDuration) });
      if (selectedTime) params.set("startTime", selectedTime);
      const data = await api<{ terrains: Terrain[] }>(`/api/padel/places/${selectedArena.id}/availability?${params}`);
      setAvailableTerrains(data.terrains);
    } catch {
      toast.error("Failed to check availability.");
    } finally {
      setAvailLoading(false);
    }
  }, [selectedArena, selectedDate, selectedTime, selectedDuration]);

  const handleSelectTerrain = (terrain: Terrain) => {
    setSelectedTerrain(terrain);
    setParticipantCount(terrain.minPlayers);
    setParticipantEmails(["", "", ""]);
    setStep(2);
  };

  const handleReview = async () => {
    if (!user) { toast.error("Please sign in to continue."); return; }
    if (!selectedTerrain || !selectedDate || !selectedTime) { toast.error("Please select a court, date and time."); return; }
    const normalizedEmails = selectedParticipants.map(normalizeEmail);
    if (normalizedEmails.some((e) => !e)) { toast.error(t("res.error.fillParticipants")); return; }
    if (normalizedEmails.some((e) => !isValidEmail(e))) { toast.error(t("res.error.invalidEmail")); return; }
    if (normalizedEmails.some((e) => e === normalizeEmail(user.email))) { toast.error(t("res.error.creatorIncluded")); return; }
    if (new Set(normalizedEmails).size !== normalizedEmails.length) { toast.error(t("res.error.duplicateEmail")); return; }
    setParticipantPreview([
      { id: user.id, userId: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, status: "confirmed", role: "creator" },
      ...normalizedEmails.map((email, index) => ({ email, displayName: `${t("res.players.participant")} ${index + 2}`, status: "pending_account" as ParticipantStatus, role: "participant" as const })),
    ]);
    setStep(3);
  };

  const handleConfirm = async () => {
    if (!selectedTerrain || !selectedDate || !selectedTime) { toast.error("Reservation incomplete."); return; }
    setSubmitting(true);
    try {
      const result = await api<{ reservation: ReservationResult }>("/api/reservations", {
        method: "POST", authenticated: true,
        body: JSON.stringify({ courtId: selectedTerrain.id, reservationDate: toDateKey(selectedDate), startTime: selectedTime, endTime, participantEmails: selectedParticipants.map(normalizeEmail) }),
      });
      setConfirmedReservation(result.reservation);
      setPaymentStatus("idle");
      setStep(4);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 100);
      toast.success(t("res.success.title"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create reservation.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePay = async () => {
    if (!confirmedReservation) return;
    setPaymentStatus("paying");
    try {
      const data = await api<{ url: string }>(`/api/payments/reservation/${confirmedReservation.id}/checkout`, {
        method: "POST", authenticated: true,
      });
      window.location.href = data.url;
    } catch (err) {
      setPaymentStatus("idle");
      toast.error(err instanceof Error ? err.message : "Unable to start payment.");
    }
  };

  const downloadReservationTicket = async (reservationId: number) => {
    try {
      const token = getToken();
      if (!token) { toast.error("Please sign in to download the ticket."); return; }
      const response = await fetch(`/api/reservations/${reservationId}/ticket.pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const p = await response.json().catch(() => ({})); throw new Error(p.message ?? "Failed to download ticket."); }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ultima-reservation-${reservationId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download ticket.");
    }
  };

  const resetFlow = () => {
    setStep(0); setSelectedArena(null); setSelectedTerrain(null); setSelectedDate(undefined);
    setSelectedTime(""); setSelectedDuration(90); setParticipantCount(2); setParticipantEmails(["", "", ""]);
    setParticipantPreview([]); setConfirmedReservation(null); setAvailableTerrains(null);
    setPaymentStatus("idle"); setArenaSearch(""); setArenaCityFilter("");
  };

  /* ── Render ──────────────────────────────────────────────────────────────*/

  return (
    <Layout>
      <div className="container py-12">
        <h1 className="text-3xl font-display font-bold mb-2">{t("res.title")}</h1>
        <p className="text-muted-foreground mb-8">{t("res.subtitle")}</p>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-2">
          {steps.map((label, index) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${index <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {index < step ? <CheckCircle size={16} /> : index + 1}
              </div>
              <span className={`text-sm whitespace-nowrap ${index <= step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {index < steps.length - 1 && <ArrowRight size={16} className="text-muted-foreground mx-1 shrink-0" />}
            </div>
          ))}
        </div>

        {/* ── Step 0: Arena browser ── */}
        {step === 0 && (
          <div className="animate-fade-in space-y-6">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder={t("res.arena.search")} value={arenaSearch} onChange={(e) => setArenaSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setArenaCityFilter("")} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!arenaCityFilter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>{t("res.arena.all")}</button>
                {uniqueCities.map((city) => (
                  <button key={city} onClick={() => setArenaCityFilter(city === arenaCityFilter ? "" : city)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${arenaCityFilter === city ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>{city}</button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loadingArenas
                ? Array.from({ length: 6 }).map((_, i) => <ArenaCardSkeleton key={i} />)
                : filteredArenas.map((arena) => (
                  <div key={arena.id} className="rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-colors group">
                    <div className="h-40 bg-gradient-to-br from-primary/20 to-primary/5 relative overflow-hidden">
                      {arena.heroImageUrl
                        ? <img src={arena.heroImageUrl} alt={arena.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        : <div className="w-full h-full flex items-center justify-center"><Building2 size={40} className="text-primary/30" /></div>
                      }
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-base mb-1">{arena.name}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                        <MapPin size={11} />{[arena.city, arena.region].filter(Boolean).join(", ") || "—"}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {arena.hasIndoor && <Badge variant="secondary" className="text-[10px] gap-1"><Building2 size={9} /> Indoor</Badge>}
                        {arena.hasOutdoor && <Badge variant="secondary" className="text-[10px] gap-1"><Sun size={9} /> Outdoor</Badge>}
                        <Badge variant="outline" className="text-[10px]">{arena.terrainCount} {arena.terrainCount !== 1 ? t("padel.places.courtsPlural") : t("padel.places.courtSingular")}</Badge>
                        {arena.amenities?.slice(0, 2).map((a) => <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>)}
                      </div>
                      {arena.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{arena.description}</p>}
                      <Button className="w-full glow-yellow" size="sm" onClick={() => { setSelectedArena(arena); setAvailableTerrains(null); setStep(1); }}>
                        {t("res.arena.select")}
                      </Button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── Step 1: Availability checker ── */}
        {step === 1 && selectedArena && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold">{selectedArena.name}</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin size={12} />{[selectedArena.city, selectedArena.region].filter(Boolean).join(", ") || "—"}</p>
              </div>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setStep(0)}><ChevronLeft size={15} /> {t("res.arena.changeArena")}</Button>
            </div>

            {/* Date / Time / Duration */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/30">
                <h3 className="text-base font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />{t("res.slot.title")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t("res.slot.subtitle")}</p>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid sm:grid-cols-3 gap-4">
                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("res.slot.date")}</label>
                    <Popover open={calOpen} onOpenChange={setCalOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start gap-2 text-sm h-10">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {selectedDate ? format(selectedDate, locale === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy", { locale: dateLocale }) : <span className="text-muted-foreground">{t("res.slot.pickDate")}</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <DateCalendar mode="single" selected={selectedDate} onSelect={(d) => { setSelectedDate(d); setCalOpen(false); setAvailableTerrains(null); }} disabled={(d) => d < today} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("res.slot.time")}</label>
                    <Select value={selectedTime} onValueChange={(v) => { setSelectedTime(v); setAvailableTerrains(null); }}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder={t("res.slot.pickTime")} />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((ts) => (
                          <SelectItem key={ts} value={ts}>{ts}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Duration */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t("res.slot.duration")}</label>
                    <Select value={String(selectedDuration)} onValueChange={(v) => { setSelectedDuration(Number(v)); setAvailableTerrains(null); }}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATIONS.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button className="w-full sm:w-auto rounded-xl gap-2 glow-yellow" disabled={!selectedDate || availLoading} onClick={checkAvailability}>
                  {availLoading ? <><Loader2 className="w-4 h-4 animate-spin" />{t("res.slot.checking")}</> : <><CheckCircle2 className="w-4 h-4" />{t("res.slot.check")}</>}
                </Button>

                {!user && selectedDate && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
                    <span><Link to="/login" className="font-semibold underline">{t("padel.detail.loginLink")}</Link> {t("res.slot.loginPrompt")}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Terrain results */}
            {availableTerrains !== null && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold">
                    {t("res.avail.title")} — {selectedDate ? format(selectedDate, locale === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy", { locale: dateLocale }) : ""}
                    {selectedTime ? ` ${t("res.avail.at")} ${selectedTime}` : ""}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />{availableTerrains.filter((t) => t.available).length} {t("res.avail.available")}</span>
                    <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-rose-500" />{availableTerrains.filter((t) => !t.available).length} {t("res.avail.unavailable")}</span>
                  </div>
                </div>

                {availableTerrains.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <Layers className="w-10 h-10 opacity-30" />
                    <p className="text-sm">{t("res.avail.noCourts")}</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {availableTerrains.map((terrain) => (
                      <TerrainCard key={terrain.id} terrain={terrain} onBook={handleSelectTerrain} booking={false} t={t} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Players ── */}
        {step === 2 && selectedTerrain && (
          <div className="max-w-3xl mx-auto animate-fade-in">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="font-display text-xl font-bold">{selectedTerrain.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedTerrain.sport} · {selectedDate ? format(selectedDate, locale === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy", { locale: dateLocale }) : ""} · {selectedTime} ({selectedDuration} {t("res.min")})</p>
              </div>
              <Button variant="ghost" size="sm" className="gap-1 shrink-0" onClick={() => setStep(1)}><ChevronLeft size={15} /> {t("res.players.back")}</Button>
            </div>

            <div className="gradient-card rounded-xl border border-border p-6 space-y-6">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2"><Users size={16} className="text-primary" />{t("res.players.numPlayers")}</label>
                <select value={participantCount} onChange={(e) => setParticipantCount(Number(e.target.value))} className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-foreground">
                  {Array.from({ length: selectedTerrain.maxPlayers - selectedTerrain.minPlayers + 1 }, (_, i) => selectedTerrain.minPlayers + i).map((n) => (
                    <option key={n} value={n}>{n} {n !== 1 ? t("res.players.players") : t("res.players.player")}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{t("res.players.helper")}</p>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <p className="text-sm font-medium">{t("res.players.creator")}</p>
                  <p className="text-xs text-muted-foreground">{user?.email ?? "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("res.players.invitedTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("res.players.invitedSubtitle")}</p>
                </div>
                {selectedParticipants.map((email, idx) => (
                  <div key={idx}>
                    <label className="text-sm font-medium">{t("res.players.participant")} {idx + 2}</label>
                    <Input type="email" value={email} onChange={(e) => { const next = [...participantEmails]; next[idx] = e.target.value; setParticipantEmails(next); }} placeholder={t("res.players.emailPlaceholder")} className="mt-1.5" />
                    <p className="text-[11px] text-muted-foreground mt-1.5">{t("res.players.guestNote")}</p>
                  </div>
                ))}
              </div>

              <Button onClick={handleReview} disabled={submitting} className="w-full glow-yellow">
                {submitting ? t("res.players.verifying") : t("res.players.continue")}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Review ── */}
        {step === 3 && selectedTerrain && (
          <div className="max-w-2xl gradient-card rounded-xl border border-border p-8 animate-fade-in">
            <h2 className="font-display text-xl font-bold mb-6">{t("res.review.title")}</h2>
            <div className="grid md:grid-cols-2 gap-6 text-sm">
              <div className="space-y-3">
                {[
                  [t("res.review.arena"),  selectedArena?.name ?? "—"],
                  [t("res.review.court"),  selectedTerrain.name],
                  [t("res.review.sport"),  selectedTerrain.sport],
                  [t("res.review.date"),   selectedDate ? format(selectedDate, locale === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy", { locale: dateLocale }) : "—"],
                  [t("res.review.time"),   `${selectedTime} – ${endTime}`],
                  [t("res.review.duration"), `${selectedDuration} ${t("res.min")}`],
                  [t("res.review.estimatedPrice"), `${totalPrice.toFixed(3)} TND`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-sm font-medium mb-3">{t("res.review.participants")}</p>
                <div className="space-y-2">
                  {participantPreview.map((p) => (
                    <div key={p.email} className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{p.displayName || [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email}</div>
                          <div className="text-xs text-muted-foreground">{p.email}</div>
                        </div>
                        <Badge variant={p.role === "creator" ? "secondary" : "outline"}>{p.role === "creator" ? t("res.players.creator") : participantStatusLabel(p.status)}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">{t("res.players.helper")}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <Button variant="outline" onClick={() => setStep(2)}>{t("res.review.edit")}</Button>
              <Button onClick={handleConfirm} className="glow-yellow" disabled={submitting}>
                {submitting ? t("res.review.confirming") : t("res.review.confirm")}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Success + QR + Billing ── */}
        {step === 4 && confirmedReservation && (
          <div className="grid md:grid-cols-[1fr,360px] gap-6 animate-fade-in">
            {/* Left: success + QR */}
            <div className="gradient-card rounded-2xl border border-green-500/25 p-8 text-center"
              style={{ boxShadow: "0 0 0 0 hsl(142 76% 55% / 0.4), 0 28px 55px hsl(245 40% 5% / 0.5)" }}>
              <div className="relative w-20 h-20 mx-auto mb-6">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="36" fill="none" stroke="hsl(142 72% 30% / 0.3)" strokeWidth="3" />
                  <circle cx="40" cy="40" r="36" fill="none" stroke="hsl(142 72% 50%)" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray="226" strokeDashoffset="226" style={{ animation: "draw-circle 0.7s ease forwards 0.1s" }} />
                </svg>
                <CheckCircle className="text-green-400 absolute inset-0 m-auto" size={34} style={{ animation: "fade-in 0.3s ease forwards 0.7s", opacity: 0 }} />
              </div>

              <h2 className="font-display text-2xl font-bold mb-1">{t("res.success.title")}</h2>
              <p className="text-sm text-muted-foreground mb-6">
                <span className="text-foreground font-medium">{confirmedReservation.court_name}</span>
                {" · "}{confirmedReservation.reservation_date}{" · "}{confirmedReservation.start_time}
              </p>

              <div className="w-48 h-48 mx-auto rounded-2xl flex flex-col items-center justify-center border border-amber-400/25 mb-5 gap-3 bg-amber-400/5 backdrop-blur-sm p-3"
                style={{ boxShadow: "0 0 30px hsl(45 90% 55% / 0.10)" }}>
                <CreditCard className="text-amber-400/60" size={70} />
                <span className="text-[11px] uppercase tracking-widest text-amber-400/70">{t("res.success.payToUnlock")}</span>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                {t("res.success.paymentHint")}
              </p>

              <Button variant="ghost" className="text-muted-foreground text-sm" onClick={resetFlow}>
                {t("res.success.new")}
              </Button>
            </div>

            {/* Right: billing */}
            <div className="gradient-card rounded-2xl border border-border p-6 space-y-5">
              <div>
                <h3 className="font-display text-lg font-bold mb-1 flex items-center gap-2"><CreditCard size={18} className="text-primary" />{t("res.billing.title")}</h3>
                <p className="text-xs text-muted-foreground">#{confirmedReservation.id}</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{t("res.billing.hourlyRate")}</span>
                  <span>{Number(selectedTerrain?.pricePerHour ?? 50).toFixed(3)} TND</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{t("res.billing.duration")}</span>
                  <span>{selectedDuration} {t("res.min")}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border font-bold text-base">
                  <span>{t("res.billing.total")}</span>
                  <span className="text-primary">{totalPrice.toFixed(3)} TND</span>
                </div>
              </div>

              <Button
                className="w-full glow-yellow h-12 text-base font-semibold"
                onClick={handlePay}
                disabled={paymentStatus === "paying"}
              >
                {paymentStatus === "paying" ? (
                  <><Loader2 className="animate-spin mr-2" size={16} /> {t("res.billing.redirecting")}</>
                ) : (
                  <><CreditCard className="mr-2" size={16} /> {t("res.billing.payStripe").replace("{amount}", totalPrice.toFixed(3))}</>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                {t("res.billing.stripeHint").replace("{amount}", (totalPrice * 0.30).toFixed(2))}
              </p>
            </div>
          </div>
        )}

        {/* ── Existing reservations ── */}
        {user && (
          <div className="mt-20 border-t border-border pt-12">
            <UserReservations />
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Reservation;
