import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useLocale } from "@/i18n/locale";
import {
  MapPin,
  Phone,
  Globe,
  Instagram,
  Clock,
  ChevronLeft,
  Calendar,
  Building2,
  Sun,
  Zap,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Eye,
  Lock,
} from "lucide-react";

type Terrain = {
  id: number;
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
  openingTime: string;
  closingTime: string;
  description: string | null;
  // availability
  available?: boolean;
  availabilityReason?: string;
};

type Place = {
  id: number;
  name: string;
  slug: string;
  city: string | null;
  region: string | null;
  address: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  openingHours: Record<string, string>;
  amenities: string[];
  heroImageUrl: string | null;
  galleryImages: string[];
  hasIndoor: boolean;
  hasOutdoor: boolean;
  terrainCount: number;
  terrains?: Terrain[];
};

const DURATIONS = [
  { label: "1h", value: 60 },
  { label: "1h30", value: 90 },
  { label: "2h", value: 120 },
  { label: "2h30", value: 150 },
  { label: "3h", value: 180 },
];

const TIME_SLOTS = Array.from({ length: 31 }, (_, i) => {
  const h = Math.floor(i / 2) + 7;
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

function TerrainCard({
  terrain,
  showAvailability,
  onBook,
  bookingTerrainId,
}: {
  terrain: Terrain;
  showAvailability: boolean;
  onBook: (t: Terrain) => void;
  bookingTerrainId: number | null;
}) {
  const [imgError, setImgError] = useState(false);
  const { t } = useLocale();
  const isBooking = bookingTerrainId === terrain.id;

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
    <div className={`rounded-2xl border overflow-hidden bg-card transition-all duration-200 ${showAvailability && terrain.available ? "ring-2 ring-emerald-500/30 shadow-emerald-100/50 dark:shadow-emerald-900/20 shadow-md" : "border-border"}`}>
      <div className="relative h-40 bg-muted overflow-hidden">
        {!imgError && terrain.imageUrl ? (
          <img
            src={terrain.imageUrl}
            alt={terrain.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
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
            <h3 className="font-semibold text-sm text-foreground">{terrain.name}</h3>
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
          {terrain.surfaceType && (
            <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{terrain.surfaceType}</span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {terrain.openingTime}–{terrain.closingTime}
          </span>
        </div>

        {showAvailability && availBadge()}

        {showAvailability && terrain.available && (
          <Button
            size="sm"
            className="w-full rounded-xl gap-1.5 text-xs"
            onClick={() => onBook(terrain)}
            disabled={isBooking}
          >
            {isBooking ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t("padel.terrain.booking")}</> : <>{t("padel.terrain.bookBtn")}</>}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PadelPlaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = getSessionUser();
  const { locale, t } = useLocale();
  const dateLocale = locale === "fr" ? fr : enUS;

  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroError, setHeroError] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<number>(90);

  const [availability, setAvailability] = useState<Terrain[] | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [bookingTerrainId, setBookingTerrainId] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<{ place: Place }>(`/api/padel/places/${id}`)
      .then((data) => setPlace(data.place))
      .catch(() => toast.error(t("padel.detail.loadError")))
      .finally(() => setLoading(false));
  }, [id]);

  const checkAvailability = useCallback(async () => {
    if (!place || !selectedDate) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    setAvailLoading(true);
    try {
      const params = new URLSearchParams({ date: dateStr, durationMinutes: String(selectedDuration) });
      if (selectedTime) params.set("startTime", selectedTime);
      const data = await api<{ terrains: Terrain[] }>(`/api/padel/places/${place.id}/availability?${params}`);
      setAvailability(data.terrains);
    } catch {
      toast.error(t("padel.detail.availError"));
    } finally {
      setAvailLoading(false);
    }
  }, [place, selectedDate, selectedTime, selectedDuration]);

  const handleBook = async (terrain: Terrain) => {
    if (!user) {
      toast.error(t("padel.detail.loginRequired"));
      navigate("/login");
      return;
    }
    if (!selectedDate || !selectedTime) {
      toast.error(t("padel.detail.selectDateTime"));
      return;
    }
    setBookingTerrainId(terrain.id);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      await api<{ reservation: unknown }>("/api/padel/reservations", {
        method: "POST",
        authenticated: true,
        body: JSON.stringify({
          courtId: terrain.id,
          reservationDate: dateStr,
          startTime: selectedTime,
          durationMinutes: selectedDuration,
        }),
      });
      toast.success(`"${terrain.name}" ${t("padel.terrain.bookedSuccess")}`);
      checkAvailability();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("padel.detail.bookError"));
    } finally {
      setBookingTerrainId(null);
    }
  };

  const terrains = availability ?? place?.terrains ?? [];
  const showAvailability = availability !== null;

  if (loading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-20 w-full" />
            </div>
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!place) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Building2 className="w-16 h-16 text-muted-foreground/30" />
          <p className="text-lg font-medium">{t("padel.detail.notFound")}</p>
          <Button variant="outline" onClick={() => navigate("/padel")}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {t("padel.detail.goBack")}
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-64 sm:h-80 bg-muted overflow-hidden">
        {!heroError && place.heroImageUrl ? (
          <img
            src={place.heroImageUrl}
            alt={place.name}
            className="w-full h-full object-cover"
            onError={() => setHeroError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/5 to-background flex items-center justify-center">
            <Building2 className="w-24 h-24 text-primary/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <button
            onClick={() => navigate("/padel")}
            className="flex items-center gap-1 text-white/80 hover:text-white text-xs mb-3 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> {t("padel.detail.back")}
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{place.name}</h1>
          {(place.city || place.region) && (
            <p className="flex items-center gap-1.5 text-white/80 text-sm mt-1">
              <MapPin className="w-3.5 h-3.5" />
              {[place.city, place.region].filter(Boolean).join(", ")}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            {place.hasIndoor && <Badge className="bg-blue-600/90 text-white border-0 text-xs">Indoor</Badge>}
            {place.hasOutdoor && <Badge className="bg-emerald-600/90 text-white border-0 text-xs">Outdoor</Badge>}
            <Badge className="bg-black/60 text-white border-0 text-xs">{place.terrainCount} court{place.terrainCount !== 1 ? "s" : ""}</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Left: info */}
          <div className="md:col-span-2 space-y-6">
            {place.description && (
              <div>
                <h2 className="text-base font-semibold text-foreground mb-2">{t("padel.detail.about")}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{place.description}</p>
              </div>
            )}

            {place.amenities.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">{t("padel.detail.amenities")}</h2>
                <div className="flex flex-wrap gap-2">
                  {place.amenities.map((a) => (
                    <Badge key={a} variant="secondary" className="text-xs px-3 py-1">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: contact */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{t("padel.detail.info")}</h2>
              {place.address && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                  <span>{place.address}</span>
                </div>
              )}
              {place.phone && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Phone className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                  <a href={`tel:${place.phone}`} className="hover:text-foreground transition-colors">{place.phone}</a>
                </div>
              )}
              {place.website && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Globe className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                  <a href={place.website} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors truncate">{place.website.replace(/^https?:\/\//, "")}</a>
                </div>
              )}
              {place.instagram && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Instagram className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                  <a href={`https://instagram.com/${place.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">{place.instagram}</a>
                </div>
              )}
              {Object.keys(place.openingHours).length > 0 && (
                <div className="pt-2 border-t border-border space-y-1.5">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-primary" />{t("padel.detail.hours")}</p>
                  {Object.entries(place.openingHours).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-medium text-foreground">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {place.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(place.address + ", Tunisie")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium mt-1"
                >
                  <MapPin className="w-3 h-3" />
                  {t("padel.detail.maps")}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Availability checker */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {t("padel.detail.availTitle")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("padel.detail.availSubtitle")}</p>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-3 gap-4">
              {/* Date picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("padel.detail.labelDate")}</label>
                <Popover open={calOpen} onOpenChange={setCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2 text-sm h-10">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {selectedDate ? format(selectedDate, locale === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy", { locale: dateLocale }) : <span className="text-muted-foreground">{t("padel.detail.pickDate")}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DateCalendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => { setSelectedDate(d); setCalOpen(false); setAvailability(null); }}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Time */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("padel.detail.labelTime")}</label>
                <Select value={selectedTime} onValueChange={(v) => { setSelectedTime(v); setAvailability(null); }}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={t("padel.detail.pickTime")} />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Duration */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("padel.detail.labelDuration")}</label>
                <Select value={String(selectedDuration)} onValueChange={(v) => { setSelectedDuration(Number(v)); setAvailability(null); }}>
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

            <Button
              className="w-full sm:w-auto rounded-xl gap-2"
              disabled={!selectedDate || availLoading}
              onClick={checkAvailability}
            >
              {availLoading ? <><Loader2 className="w-4 h-4 animate-spin" />{t("padel.detail.checking")}</> : <><CheckCircle2 className="w-4 h-4" />{t("padel.detail.checkBtn")}</>}
            </Button>

            {!user && selectedDate && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span><Link to="/login" className="font-semibold underline">{t("padel.detail.loginLink")}</Link> {t("padel.detail.loginPrompt")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Terrains grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">
              {showAvailability
                ? `${t("padel.detail.availabilityTitle")} — ${selectedDate ? format(selectedDate, locale === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy", { locale: dateLocale }) : ""}${selectedTime ? ` ${t("padel.detail.at")} ${selectedTime}` : ""}`
                : `${t("padel.detail.courtsTitle")} (${place.terrainCount})`}
            </h2>
            {showAvailability && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />{terrains.filter((terrain) => terrain.available).length} {t("padel.detail.availCount")}</span>
                <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-rose-500" />{terrains.filter((terrain) => !terrain.available).length} {t("padel.detail.unavailCount")}</span>
              </div>
            )}
          </div>

          {terrains.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Layers className="w-10 h-10 opacity-30" />
              <p className="text-sm">{t("padel.detail.noCourts")}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {terrains.map((terrain) => (
                <TerrainCard
                  key={terrain.id}
                  terrain={terrain}
                  showAvailability={showAvailability}
                  onBook={handleBook}
                  bookingTerrainId={bookingTerrainId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
