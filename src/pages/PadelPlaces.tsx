import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useLocale } from "@/i18n/locale";
import {
  MapPin,
  Search,
  LayoutGrid,
  Building2,
  Sun,
  X,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

type PadelPlace = {
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
  hasPadel: boolean;
};

const REGIONS = ["Tunis", "Ariana", "Ben Arous", "Sousse", "Monastir", "Nabeul", "Sfax", "Médenine"];

function PlaceCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden bg-card border border-border shadow-sm">
      <Skeleton className="h-48 w-full" />
      <div className="p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

function PlaceCard({ place, onClick }: { place: PadelPlace; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const { t } = useLocale();

  return (
    <article
      className="group rounded-2xl overflow-hidden bg-card border border-border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col"
      onClick={onClick}
    >
      <div className="relative h-48 overflow-hidden bg-muted">
        {!imgError && place.heroImageUrl ? (
          <img
            src={place.heroImageUrl}
            alt={place.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
            <Building2 className="w-14 h-14 text-primary/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          {place.hasIndoor && (
            <span className="text-xs font-semibold bg-blue-600/90 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
              Indoor
            </span>
          )}
          {place.hasOutdoor && (
            <span className="text-xs font-semibold bg-emerald-600/90 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
              Outdoor
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3">
          <span className="text-xs font-bold bg-black/60 text-white px-2 py-1 rounded-full backdrop-blur-sm">
            {place.terrainCount} {place.terrainCount !== 1 ? t("padel.places.courtsPlural") : t("padel.places.courtSingular")}
          </span>
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1 gap-3">
        <div>
          <h3 className="font-semibold text-base text-foreground leading-tight line-clamp-1 group-hover:text-primary transition-colors">
            {place.name}
          </h3>
          {(place.city || place.region) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <MapPin className="w-3 h-3 shrink-0" />
              {[place.city, place.region].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {place.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {place.description}
          </p>
        )}

        {place.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.amenities.slice(0, 4).map((a) => (
              <Badge key={a} variant="secondary" className="text-[10px] px-2 py-0 h-5">
                {a}
              </Badge>
            ))}
            {place.amenities.length > 4 && (
              <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5">
                +{place.amenities.length - 4}
              </Badge>
            )}
          </div>
        )}

        <Button
          className="mt-auto w-full rounded-xl gap-2 text-sm"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          {t("padel.places.viewCourts")}
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </article>
  );
}

export default function PadelPlaces() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [places, setPlaces] = useState<PadelPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [filterIndoor, setFilterIndoor] = useState(false);
  const [filterOutdoor, setFilterOutdoor] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<{ places: PadelPlace[] }>("/api/padel/places")
      .then((data) => setPlaces(data.places))
      .catch(() => toast.error(t("padel.places.loadError")))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = places;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.city ?? "").toLowerCase().includes(q) ||
          (p.region ?? "").toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q)
      );
    }
    if (selectedRegion) {
      result = result.filter((p) =>
        (p.region ?? "").toLowerCase().includes(selectedRegion.toLowerCase()) ||
        (p.city ?? "").toLowerCase().includes(selectedRegion.toLowerCase())
      );
    }
    if (filterIndoor) result = result.filter((p) => p.hasIndoor);
    if (filterOutdoor) result = result.filter((p) => p.hasOutdoor);
    return result;
  }, [places, search, selectedRegion, filterIndoor, filterOutdoor]);

  const hasActiveFilter = search || selectedRegion || filterIndoor || filterOutdoor;

  return (
    <Layout>
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-primary/10 via-background to-background border-b border-border py-14 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none opacity-5">
          <Building2 className="absolute left-1/4 top-4 w-64 h-64 text-primary rotate-12" />
          <Building2 className="absolute right-1/4 bottom-4 w-64 h-64 text-primary -rotate-12" />
        </div>
        <div className="relative max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full mb-2">
            <LayoutGrid className="w-3.5 h-3.5" />
            {t("padel.places.badge")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t("padel.places.title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">
            {places.length} {t("padel.places.subtitleSuffix")}
          </p>

          {/* Search */}
          <div className="relative max-w-md mx-auto mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("padel.places.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 h-11 rounded-xl bg-background/80 backdrop-blur-sm border-border"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("padel.places.filter")}
          </span>

          {/* Region chips */}
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRegion(selectedRegion === r ? "" : r)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                selectedRegion === r
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}

          <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

          <button
            onClick={() => setFilterIndoor(!filterIndoor)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              filterIndoor
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-background border-border text-muted-foreground hover:border-blue-500/50"
            }`}
          >
            <Building2 className="w-3 h-3" />
            Indoor
          </button>
          <button
            onClick={() => setFilterOutdoor(!filterOutdoor)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              filterOutdoor
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-background border-border text-muted-foreground hover:border-emerald-500/50"
            }`}
          >
            <Sun className="w-3 h-3" />
            Outdoor
          </button>

          {hasActiveFilter && (
            <button
              onClick={() => { setSearch(""); setSelectedRegion(""); setFilterIndoor(false); setFilterOutdoor(false); }}
              className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 font-medium ml-1"
            >
              <X className="w-3 h-3" />
              {t("padel.places.reset")}
            </button>
          )}
        </div>

        {/* Result count */}
        {!loading && (
          <p className="text-sm text-muted-foreground">
            {filtered.length === places.length
              ? `${places.length} ${t("padel.places.allAvailable")}`
              : `${filtered.length} ${filtered.length !== 1 ? t("padel.places.results") : t("padel.places.result")} ${t("padel.places.of")} ${places.length}`}
          </p>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => <PlaceCardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Building2 className="w-12 h-12 opacity-30" />
            <p className="text-base font-medium">{t("padel.places.empty")}</p>
            <p className="text-sm">{t("padel.places.emptySub")}</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                onClick={() => navigate(`/padel/${place.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
