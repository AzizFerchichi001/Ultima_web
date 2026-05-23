import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/i18n/locale";
import { toast } from "sonner";
import {
  MapPin, ChevronLeft, ChevronRight, CheckCircle, Clock, Star,
  ShieldCheck, Users, Calendar, AlignLeft, Building2, Sun, Search, Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type CoachCard = {
  userId: number;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  headline: string | null;
  expertise: string[];
  yearsExperience: number | null;
  hourlyRate: number | null;
  currency: string;
  isVerified: boolean;
};

type Slot = { start: string; end: string };

type CourtOption = {
  id: number;
  name: string;
  sport: string;
  pricePerHour: number | null;
  currency: string;
  courtType: string;
  hasLighting: boolean;
  surfaceType: string | null;
  available: boolean;
};

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["resChoice.courtOnly.cta", "coachBooking.step.arena", "coachBooking.step.coach",
  "coachBooking.step.time", "coachBooking.step.court", "coachBooking.step.confirm"] as const;

const StepDots = ({ current, total }: { current: number; total: number }) => (
  <div className="flex items-center gap-1.5 justify-center mb-8">
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        className={`rounded-full transition-all ${
          i === current
            ? "w-6 h-2 bg-primary"
            : i < current
            ? "w-2 h-2 bg-primary/40"
            : "w-2 h-2 bg-border"
        }`}
      />
    ))}
  </div>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const panelClass = "rounded-xl border border-primary/20 bg-background/45 shadow-[0_18px_45px_hsl(var(--background)/0.32)] backdrop-blur-md";
const interactivePanelClass = `${panelClass} transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/55 hover:bg-background/65 hover:shadow-[0_22px_50px_hsl(var(--primary)/0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`;

const todayStr = () => new Date().toISOString().split("T")[0];

const initials = (first: string, last: string) =>
  `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();

// ── Main component ────────────────────────────────────────────────────────────

const CoachBooking = () => {
  const { t } = useLocale();
  const navigate = useNavigate();

  // Step 0-indexed: 0=arena, 1=coach, 2=time, 3=court, 4=confirm
  const [step, setStep] = useState(0);

  // Step 1 — Arena
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [arenasLoading, setArenasLoading] = useState(true);
  const [arenaSearch, setArenaSearch] = useState("");
  const [arenaCityFilter, setArenaCityFilter] = useState("");
  const [selectedArena, setSelectedArena] = useState<Arena | null>(null);

  // Step 2 — Coach
  const [coaches, setCoaches] = useState<CoachCard[]>([]);
  const [coachesLoading, setCoachesLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachCard | null>(null);

  // Step 3 — Time
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Step 4 — Court
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState<CourtOption | null>(null);

  // Step 5 — Confirm
  const [playersCount, setPlayersCount] = useState(1);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Fetch arenas — same endpoint as Reservation.tsx ─────────────────────────
  useEffect(() => {
    api<{ places: Arena[] }>("/api/padel/places")
      .then((r) => setArenas(r.places ?? []))
      .catch(() => setArenas([]))
      .finally(() => setArenasLoading(false));
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

  // ── Fetch coaches when arena selected ───────────────────────────────────────
  useEffect(() => {
    if (!selectedArena || step !== 1) return;
    setCoachesLoading(true);
    setCoaches([]);
    api<{ coaches: CoachCard[] }>(`/api/player/coaches?arenaId=${selectedArena.id}`, { authenticated: true })
      .then((r) => setCoaches(r.coaches ?? []))
      .catch(() => setCoaches([]))
      .finally(() => setCoachesLoading(false));
  }, [selectedArena, step]);

  // ── Fetch slots when coach/date change ──────────────────────────────────────
  useEffect(() => {
    if (!selectedCoach || step !== 2) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);
    api<{ slots: Slot[] }>(`/api/player/coaches/${selectedCoach.userId}/slots?date=${date}`, { authenticated: true })
      .then((r) => setSlots(r.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedCoach, date, step]);

  // ── Fetch courts when slot selected ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedArena || !selectedSlot || step !== 3) return;
    setCourtsLoading(true);
    setCourts([]);
    // Compute duration from slot start/end (e.g. "13:00"–"14:00" → 60 min)
    const [sh, sm] = selectedSlot.start.split(":").map(Number);
    const [eh, em] = selectedSlot.end.split(":").map(Number);
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
    const params = new URLSearchParams({
      date,
      startTime: selectedSlot.start,
      durationMinutes: String(durationMinutes),
    });
    api<{ terrains: CourtOption[] }>(
      `/api/padel/places/${selectedArena.id}/availability?${params}`
    )
      .then((r) => setCourts((r.terrains ?? []).filter((c) => c.available)))
      .catch(() => setCourts([]))
      .finally(() => setCourtsLoading(false));
  }, [selectedArena, selectedSlot, date, step]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedCoach || !selectedSlot || !selectedArena) return;
    setSubmitting(true);
    try {
      await api("/api/player/coaching-requests", {
        method: "POST",
        authenticated: true,
        body: JSON.stringify({
          coachUserId: selectedCoach.userId,
          arenaId: selectedArena.id,
          requestedDate: date,
          requestedStartTime: selectedSlot.start,
          requestedEndTime: selectedSlot.end,
          playersCount,
          message: message || undefined,
          preferredCourtId: selectedCourt?.id,
        }),
      });
      toast.success(t("coachBooking.confirm.success"));
      navigate("/coaching-requests");
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step navigation ─────────────────────────────────────────────────────────
  const goBack = () => {
    if (step === 0) navigate("/reservation");
    else setStep((s) => s - 1);
  };

  const stepLabels = [
    t("coachBooking.step.arena"),
    t("coachBooking.step.coach"),
    t("coachBooking.step.time"),
    t("coachBooking.step.court"),
    t("coachBooking.step.confirm"),
  ];

  // ── Render steps ─────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 0: Arena ───────────────────────────────────────────────────────
      case 0:
        return (
          <div className="animate-fade-in space-y-6">
            {/* Search + city filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("res.arena.search")}
                  value={arenaSearch}
                  onChange={(e) => setArenaSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setArenaCityFilter("")}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!arenaCityFilter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  {t("res.arena.all")}
                </button>
                {uniqueCities.map((city) => (
                  <button
                    key={city}
                    onClick={() => setArenaCityFilter(city === arenaCityFilter ? "" : city)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${arenaCityFilter === city ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>

            {/* Arena cards grid — identical to Reservation.tsx */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {arenasLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden bg-card border border-border">
                    <Skeleton className="h-40 w-full" />
                    <div className="p-4 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <div className="flex gap-2 pt-1">
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-11 w-full rounded-xl mt-2" />
                    </div>
                  </div>
                ))
                : filteredArenas.map((arena) => (
                  <div
                    key={arena.id}
                    className="rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-colors group"
                  >
                    <div className="h-40 bg-gradient-to-br from-primary/20 to-primary/5 relative overflow-hidden">
                      {arena.heroImageUrl ? (
                        <img
                          src={arena.heroImageUrl}
                          alt={arena.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Building2 size={40} className="text-primary/30" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-base mb-1">{arena.name}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                        <MapPin size={11} />
                        {[arena.city, arena.region].filter(Boolean).join(", ") || "—"}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {arena.hasIndoor && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Building2 size={9} /> Indoor
                          </Badge>
                        )}
                        {arena.hasOutdoor && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Sun size={9} /> Outdoor
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {arena.terrainCount} {arena.terrainCount !== 1 ? t("padel.places.courtsPlural") : t("padel.places.courtSingular")}
                        </Badge>
                        {arena.amenities?.slice(0, 2).map((a) => (
                          <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                        ))}
                      </div>
                      {arena.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{arena.description}</p>
                      )}
                      <Button
                        className="w-full glow-yellow"
                        size="sm"
                        onClick={() => { setSelectedArena(arena); setStep(1); }}
                      >
                        {t("res.arena.select")}
                      </Button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        );

      // ── Step 1: Coach ───────────────────────────────────────────────────────
      case 1:
        return (
          <div>
            <h2 className="text-lg font-bold text-foreground mb-1">{t("coachBooking.step.coach")}</h2>
            <p className="text-sm text-muted-foreground mb-5">{selectedArena?.name}</p>
            {coachesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`${panelClass} p-5 animate-pulse space-y-3`}>
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : coaches.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
                <Users className="w-10 h-10 opacity-20" />
                <p className="text-sm">{t("coachBooking.coach.noCoaches")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {coaches.map((coach) => (
                  <button
                    key={coach.userId}
                    onClick={() => { setSelectedCoach(coach); setStep(2); }}
                    className={`text-left p-5 ${interactivePanelClass}`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-muted border border-border/40 overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {coach.profileImageUrl ? (
                          <img src={coach.profileImageUrl} alt="" className="w-full h-full object-cover" />
                        ) : initials(coach.firstName, coach.lastName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">
                            {coach.firstName} {coach.lastName}
                          </span>
                          {coach.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </div>
                        {coach.headline && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{coach.headline}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      {coach.yearsExperience != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {coach.yearsExperience} {t("coaches.card.experience")}
                        </span>
                      )}
                      {coach.hourlyRate != null && (
                        <span className="flex items-center gap-1 font-semibold text-foreground">
                          <Star className="w-3 h-3 text-primary" />
                          {coach.hourlyRate} {coach.currency}{t("coaches.card.rate")}
                        </span>
                      )}
                    </div>
                    {coach.expertise.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {coach.expertise.slice(0, 3).map((e) => (
                          <Badge key={e} variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full">
                            {e}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      // ── Step 2: Time ────────────────────────────────────────────────────────
      case 2:
        return (
          <div>
            <h2 className="text-lg font-bold text-foreground mb-1">{t("coachBooking.step.time")}</h2>
            <p className="text-sm text-muted-foreground mb-5">
              {selectedCoach?.firstName} {selectedCoach?.lastName}
            </p>

            <label className="text-xs text-muted-foreground mb-1 block">{t("coachBooking.time.selectDate")}</label>
            <input
              type="date"
              value={date}
              min={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-primary/25 bg-background/50 text-foreground px-3 py-2 text-sm mb-5 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            />

            {slotsLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">{t("coachBooking.time.noSlots")}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => {
                      setSelectedSlot(selectedSlot?.start === s.start ? null : s);
                    }}
                    className={`text-xs py-2.5 rounded-xl border transition-all font-medium ${
                      selectedSlot?.start === s.start
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border/50 text-foreground hover:border-primary/50 hover:bg-primary/5"
                    }`}
                  >
                    {s.start}–{s.end}
                  </button>
                ))}
              </div>
            )}

            {selectedSlot && (
              <div className="mt-6">
                <Button
                  className="w-full sm:w-auto rounded-xl"
                  onClick={() => setStep(3)}
                >
                  {t("coachBooking.next")} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        );

      // ── Step 3: Court ───────────────────────────────────────────────────────
      case 3:
        return (
          <div>
            <h2 className="text-lg font-bold text-foreground mb-1">{t("coachBooking.step.court")}</h2>
            <p className="text-sm text-muted-foreground mb-5">
              {date} · {selectedSlot?.start}–{selectedSlot?.end}
            </p>
            {courtsLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`${panelClass} min-h-36 p-6 animate-pulse space-y-3`}>
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : courts.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
                <Calendar className="w-10 h-10 opacity-20" />
                <p className="text-sm">{t("coachBooking.court.noAvailable")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {courts.map((court) => (
                  <button
                    key={court.id}
                    onClick={() => { setSelectedCourt(court); setStep(4); }}
                    className={`text-left min-h-36 p-6 ${interactivePanelClass}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <p className="font-bold text-foreground text-lg leading-tight">{court.name}</p>
                      <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1">{court.sport}</span>
                      {court.courtType && <span>· {court.courtType}</span>}
                      {court.surfaceType && <span>· {court.surfaceType}</span>}
                    </div>
                    {court.pricePerHour != null && (
                      <p className="text-sm font-semibold text-foreground mt-5">
                        {court.pricePerHour} {court.currency}{t("coaches.card.rate")}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      // ── Step 4: Confirm ─────────────────────────────────────────────────────
      case 4: {
        const courtPrice = selectedCourt?.pricePerHour ? Number(selectedCourt.pricePerHour) : 0;
        const coachPrice = selectedCoach?.hourlyRate ?? 0;
        const total = courtPrice + coachPrice;
        const currency = selectedCoach?.currency ?? selectedCourt?.currency ?? "TND";

        return (
          <div>
            <h2 className="text-lg font-bold text-foreground mb-5">{t("coachBooking.step.confirm")}</h2>

            {/* Summary card */}
            <div className={`${panelClass} p-5 space-y-3 mb-6`}>
              <SummaryRow label={t("coachBooking.summary.arena")} value={selectedArena?.name ?? ""} />
              <SummaryRow label={t("coachBooking.summary.coach")} value={`${selectedCoach?.firstName} ${selectedCoach?.lastName}`} />
              <SummaryRow label={t("coachBooking.summary.date")} value={`${date} · ${selectedSlot?.start}–${selectedSlot?.end}`} />
              {selectedCourt && <SummaryRow label={t("coachBooking.summary.court")} value={selectedCourt.name} />}
              <div className="border-t border-border/30 pt-3 space-y-1.5">
                {coachPrice > 0 && (
                  <SummaryRow label={t("coachBooking.summary.coachPrice")} value={`${coachPrice} ${currency}/hr`} />
                )}
                {courtPrice > 0 && (
                  <SummaryRow label={t("coachBooking.summary.courtPrice")} value={`${courtPrice} ${currency}/hr`} />
                )}
                {total > 0 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-bold text-foreground">{t("coachBooking.summary.total")}</span>
                    <span className="text-sm font-bold text-primary">{total} {currency}/hr</span>
                  </div>
                )}
              </div>
            </div>

            {/* Players count */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-2 block">
                {t("coachBooking.players.label")}
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPlayersCount(Math.max(1, playersCount - 1))}
                  className="w-8 h-8 rounded-full border border-primary/25 bg-background/40 flex items-center justify-center hover:bg-primary/10 text-foreground font-semibold"
                >
                  −
                </button>
                <span className="font-semibold text-foreground w-4 text-center">{playersCount}</span>
                <button
                  onClick={() => setPlayersCount(Math.min(2, playersCount + 1))}
                  className="w-8 h-8 rounded-full border border-primary/25 bg-background/40 flex items-center justify-center hover:bg-primary/10 text-foreground font-semibold"
                >
                  +
                </button>
                <span className="text-xs text-muted-foreground">{t("coachBooking.players.max")}</span>
              </div>
            </div>

            {/* Message */}
            <div className="mb-5">
              <label className="text-xs text-muted-foreground mb-1.5 block">
                {t("coachBooking.message.label")}
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="rounded-xl border-primary/25 bg-background/50 text-sm resize-none backdrop-blur-md"
                placeholder={t("coachProfile.requestForm.messagePlaceholder")}
              />
            </div>

            {/* Notice */}
            <p className="text-xs text-muted-foreground mb-5 flex items-start gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {t("coachBooking.summary.notice")}
            </p>

            <Button
              className="w-full rounded-xl h-11"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "…" : t("coachBooking.confirm.btn")}
            </Button>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="container py-12">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> {t("coachBooking.back")}
          </button>
          <h1 className="text-2xl font-bold text-foreground">{t("coachBooking.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{stepLabels[step]}</p>
        </div>

        {/* Step dots */}
        <StepDots current={step} total={5} />

        {/* Step content */}
        <div className={step === 0 ? "" : "rounded-[1.5rem] border border-primary/15 bg-background/20 p-4 shadow-[0_28px_70px_hsl(var(--background)/0.35)] backdrop-blur-sm sm:p-6"}>
          {renderStep()}
        </div>
      </div>
    </Layout>
  );
};

// ── Summary row helper ────────────────────────────────────────────────────────
const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <span className="text-xs text-foreground text-right font-medium">{value}</span>
  </div>
);

export default CoachBooking;
