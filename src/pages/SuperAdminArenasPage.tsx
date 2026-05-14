import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, Building2, CheckCircle2, ChevronDown,
  Crosshair, Edit2, MapPin, Plus, RefreshCw, Search, Trash2,
  Upload, X, Zap, Phone, Globe, Camera,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, resolveApiUrl } from "@/lib/api";
import { getToken, getSessionUser } from "@/lib/session";
import Layout from "@/components/Layout";

// ── Tunisian city extraction ─────────────────────────────────────────────────
const TN_CITIES = [
  "tunis","ariana","ben arous","manouba","nabeul","zaghouan","bizerte",
  "béja","beja","jendouba","kef","siliana","sousse","monastir","mahdia",
  "sfax","kairouan","kasserine","sidi bouzid","gabès","gabes","medenine",
  "tataouine","gafsa","tozeur","kebili","hammamet","djerba","zarzis",
  "tabarka","douz","nefta","el jem","dougga","matmata",
];

function extractCity(location: string | null | undefined): string {
  if (!location) return "Other";
  const lower = location.toLowerCase();
  for (const city of TN_CITIES) {
    if (lower.includes(city)) {
      return city.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  return location.split(",")[0].trim() || "Other";
}

// ── Padel keypoints ──────────────────────────────────────────────────────────
const PADEL_KP = [
  { id: 0,  label: "0 – BL outer corner",     world: [0,  0]  as [number, number] },
  { id: 1,  label: "1 – BR outer corner",     world: [10, 0]  as [number, number] },
  { id: 2,  label: "2 – TR outer corner",     world: [10, 20] as [number, number] },
  { id: 3,  label: "3 – TL outer corner",     world: [0,  20] as [number, number] },
  { id: 4,  label: "4 – Near service left",   world: [0,  3]  as [number, number] },
  { id: 5,  label: "5 – Near service center", world: [5,  3]  as [number, number] },
  { id: 6,  label: "6 – Near service right",  world: [10, 3]  as [number, number] },
  { id: 7,  label: "7 – Far service left",    world: [0,  17] as [number, number] },
  { id: 8,  label: "8 – Far service center",  world: [5,  17] as [number, number] },
  { id: 9,  label: "9 – Far service right",   world: [10, 17] as [number, number] },
  { id: 10, label: "10 – Net left",           world: [0,  10] as [number, number] },
  { id: 11, label: "11 – Net right",          world: [10, 10] as [number, number] },
];

// ── Types ────────────────────────────────────────────────────────────────────
type CourtInArena = {
  id: number;
  name: string;
  sport: string;
  court_type: string | null;
  status: string;
  has_summa: boolean;
  price_per_hour: number | null;
  opening_time: string | null;
  closing_time: string | null;
  is_active: boolean;
  calib_id: number | null;
  calib_status: string | null;
};

type Arena = {
  id: number;
  name: string;
  slug: string;
  location: string;
  image_url: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  courts: CourtInArena[];
};

type CalibSummary = {
  id: number;
  version: number;
  point_count: number;
  has_homography: boolean;
  status: string;
  is_active: boolean;
  computed_at: string | null;
};

type PlacedPoint = { kpId: number; imageX: number; imageY: number };

// ── Court Diagram (SVG) ──────────────────────────────────────────────────────
function CourtDiagram({ placedIds, activeKpId, onSelect }: {
  placedIds: Set<number>; activeKpId: number; onSelect: (id: number) => void;
}) {
  const PAD = 10, W = 100, H = 200;
  const sx = (x: number) => PAD + (x / 10) * W;
  const sy = (y: number) => PAD + H - (y / 20) * H;
  return (
    <svg width={W + 2 * PAD} height={H + 2 * PAD} className="border border-border/40 rounded bg-muted/10 select-none">
      <rect x={PAD} y={PAD} width={W} height={H} fill="none" stroke="#64748b" strokeWidth="2" />
      <line x1={PAD} y1={sy(10)} x2={PAD + W} y2={sy(10)} stroke="#94a3b8" strokeWidth="2.5" />
      <line x1={PAD} y1={sy(3)}  x2={PAD + W} y2={sy(3)}  stroke="#64748b" strokeWidth="1" strokeDasharray="4,3" />
      <line x1={PAD} y1={sy(17)} x2={PAD + W} y2={sy(17)} stroke="#64748b" strokeWidth="1" strokeDasharray="4,3" />
      <line x1={sx(5)} y1={sy(3)} x2={sx(5)} y2={sy(17)} stroke="#64748b" strokeWidth="1" strokeDasharray="4,3" />
      {PADEL_KP.map((kp) => {
        const placed = placedIds.has(kp.id), active = kp.id === activeKpId;
        return (
          <g key={kp.id} onClick={() => onSelect(kp.id)} style={{ cursor: "pointer" }}>
            <circle cx={sx(kp.world[0])} cy={sy(kp.world[1])} r={6}
              fill={active ? "#3b82f6" : placed ? "#10b981" : "#475569"} stroke="#fff" strokeWidth="1.5" />
            <text x={sx(kp.world[0])} y={sy(kp.world[1])} textAnchor="middle" dominantBaseline="middle"
              fontSize="6" fill="#fff" fontWeight="bold" style={{ pointerEvents: "none" }}>{kp.id + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const SPORTS = ["Padel", "Tennis", "Football", "Basketball", "Volleyball"];
const EMPTY_ARENA_FORM = { name: "", location: "", description: "", phone: "", website: "" };
const EMPTY_COURT_FORM = { name: "", sport: "Padel", courtType: "", openingTime: "08:00", closingTime: "22:00", pricePerHour: "" };

// ── Main page ────────────────────────────────────────────────────────────────
export default function SuperAdminArenasPage() {
  const navigate = useNavigate();
  const currentUser = getSessionUser();
  const isSuperAdmin = currentUser?.role === "super_admin";

  const [tab, setTab] = useState<"arenas" | "calibration">("arenas");

  // ── Arena data ──
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("All");

  // ── Arena form ──
  const [arenaDialogOpen, setArenaDialogOpen] = useState(false);
  const [editingArena, setEditingArena] = useState<Arena | null>(null);
  const [arenaForm, setArenaForm] = useState(EMPTY_ARENA_FORM);
  const [arenaImage, setArenaImage] = useState<File | null>(null);
  const [arenaImagePreview, setArenaImagePreview] = useState<string | null>(null);
  const [savingArena, setSavingArena] = useState(false);

  // ── Court form (inline per arena) ──
  const [addingCourtFor, setAddingCourtFor] = useState<number | null>(null);
  const [editingCourt, setEditingCourt] = useState<{ arenaId: number; court: CourtInArena } | null>(null);
  const [courtForm, setCourtForm] = useState(EMPTY_COURT_FORM);
  const [savingCourt, setSavingCourt] = useState(false);
  const [deletingId, setDeletingId] = useState<{ type: "arena" | "court"; id: number } | null>(null);

  // ── Calibration ──
  const [calibSearch, setCalibSearch] = useState("");
  const [calibCity, setCalibCity] = useState("All");
  const [calibDialogOpen, setCalibDialogOpen] = useState(false);
  const [selectedCourtForCalib, setSelectedCourtForCalib] = useState<{ id: number; name: string; court_type: string | null; arenaName: string } | null>(null);
  const [calibrations, setCalibrations] = useState<CalibSummary[]>([]);
  const [calibsLoading, setCalibsLoading] = useState(false);
  const [frameFile, setFrameFile] = useState<File | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [placedPoints, setPlacedPoints] = useState<PlacedPoint[]>([]);
  const [activeKpId, setActiveKpId] = useState(0);
  const [newCalibId, setNewCalibId] = useState<number | null>(null);
  const [savingCalib, setSavingCalib] = useState(false);
  const [activatingCalib, setActivatingCalib] = useState<number | null>(null);
  const [deletingCalib, setDeletingCalib] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameUrlRef = useRef<string | null>(null);
  const arenaImageUrlRef = useRef<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => { loadArenas(); }, []);

  async function loadArenas() {
    setLoading(true);
    try {
      const res = await api<{ arenas: Arena[] }>("/api/super-admin/arenas", { authenticated: true });
      setArenas(res.arenas ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load arenas.");
    } finally {
      setLoading(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const allCities = useMemo(() => {
    const set = new Set<string>();
    for (const a of arenas) set.add(extractCity(a.location));
    return ["All", ...Array.from(set).sort()];
  }, [arenas]);

  const filteredArenas = useMemo(() => {
    return arenas.filter((a) => {
      const matchesCity = cityFilter === "All" || extractCity(a.location) === cityFilter;
      const matchesSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.location.toLowerCase().includes(search.toLowerCase());
      return matchesCity && matchesSearch;
    });
  }, [arenas, cityFilter, search]);

  // Courts for calibration tab (flat list with arena info attached)
  const calibCourts = useMemo(() => {
    return arenas.flatMap((a) =>
      a.courts.map((c) => ({ ...c, arena_name: a.name, arena_location: a.location }))
    );
  }, [arenas]);

  const calibCourtsFiltered = useMemo(() => {
    return calibCourts.filter((c) => {
      const cityOk = calibCity === "All" || extractCity(c.arena_location) === calibCity;
      const searchOk = !calibSearch ||
        c.name.toLowerCase().includes(calibSearch.toLowerCase()) ||
        c.arena_name.toLowerCase().includes(calibSearch.toLowerCase());
      return cityOk && searchOk;
    });
  }, [calibCourts, calibCity, calibSearch]);

  const calibCourtsByCity = useMemo(() => {
    const map = new Map<string, Map<string, typeof calibCourtsFiltered>>();
    for (const c of calibCourtsFiltered) {
      const city = extractCity(c.arena_location);
      if (!map.has(city)) map.set(city, new Map());
      const am = map.get(city)!;
      if (!am.has(c.arena_name)) am.set(c.arena_name, []);
      am.get(c.arena_name)!.push(c);
    }
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [calibCourtsFiltered]);

  // ── Arena CRUD ────────────────────────────────────────────────────────────
  function openAddArena() {
    setEditingArena(null);
    setArenaForm(EMPTY_ARENA_FORM);
    setArenaImage(null);
    setArenaImagePreview(null);
    setArenaDialogOpen(true);
  }

  function openEditArena(a: Arena) {
    setEditingArena(a);
    setArenaForm({ name: a.name, location: a.location, description: a.description ?? "", phone: a.phone ?? "", website: a.website ?? "" });
    setArenaImage(null);
    setArenaImagePreview(a.image_url ? resolveApiUrl(a.image_url) : null);
    setArenaDialogOpen(true);
  }

  function onArenaImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (arenaImageUrlRef.current) URL.revokeObjectURL(arenaImageUrlRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    arenaImageUrlRef.current = url;
    setArenaImage(file);
    setArenaImagePreview(url);
  }

  async function saveArena() {
    if (!arenaForm.name || !arenaForm.location) {
      toast.error("Name and location are required.");
      return;
    }
    setSavingArena(true);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.set("name", arenaForm.name);
      formData.set("location", arenaForm.location);
      formData.set("description", arenaForm.description);
      formData.set("phone", arenaForm.phone);
      formData.set("website", arenaForm.website);
      if (arenaImage) formData.append("image", arenaImage);

      const url = editingArena
        ? resolveApiUrl(`/api/super-admin/arenas/${editingArena.id}`)
        : resolveApiUrl("/api/super-admin/arenas");
      const method = editingArena ? "PATCH" : "POST";

      const resp = await fetch(url, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.message ?? "Failed to save arena.");
      toast.success(editingArena ? "Arena updated." : "Arena created.");
      setArenaDialogOpen(false);
      await loadArenas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save arena.");
    } finally {
      setSavingArena(false);
    }
  }

  async function deleteArena(arenaId: number) {
    setDeletingId({ type: "arena", id: arenaId });
    try {
      await api(`/api/super-admin/arenas/${arenaId}`, { method: "DELETE", authenticated: true });
      toast.success("Arena deleted.");
      await loadArenas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete arena.");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Court CRUD ────────────────────────────────────────────────────────────
  function openAddCourt(arenaId: number) {
    setAddingCourtFor(arenaId);
    setEditingCourt(null);
    setCourtForm(EMPTY_COURT_FORM);
  }

  function openEditCourt(arenaId: number, court: CourtInArena) {
    setEditingCourt({ arenaId, court });
    setAddingCourtFor(null);
    setCourtForm({
      name: court.name,
      sport: court.sport,
      courtType: court.court_type ?? "",
      openingTime: court.opening_time ?? "08:00",
      closingTime: court.closing_time ?? "22:00",
      pricePerHour: court.price_per_hour != null ? String(court.price_per_hour) : "",
    });
  }

  function cancelCourtForm() {
    setAddingCourtFor(null);
    setEditingCourt(null);
    setCourtForm(EMPTY_COURT_FORM);
  }

  async function saveCourt() {
    if (!courtForm.name || !courtForm.sport) { toast.error("Name and sport are required."); return; }
    setSavingCourt(true);
    try {
      if (editingCourt) {
        await api(`/api/super-admin/courts/${editingCourt.court.id}`, {
          method: "PATCH", authenticated: true,
          body: {
            name: courtForm.name, sport: courtForm.sport, courtType: courtForm.courtType || null,
            openingTime: courtForm.openingTime, closingTime: courtForm.closingTime,
            pricePerHour: courtForm.pricePerHour ? Number(courtForm.pricePerHour) : null,
          },
        });
        toast.success("Court updated.");
      } else if (addingCourtFor) {
        await api("/api/super-admin/courts", {
          method: "POST", authenticated: true,
          body: {
            arenaId: addingCourtFor, name: courtForm.name, sport: courtForm.sport,
            location: "", courtType: courtForm.courtType || null,
            openingTime: courtForm.openingTime, closingTime: courtForm.closingTime,
            pricePerHour: courtForm.pricePerHour ? Number(courtForm.pricePerHour) : null,
          },
        });
        toast.success("Court created.");
      }
      cancelCourtForm();
      await loadArenas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save court.");
    } finally {
      setSavingCourt(false);
    }
  }

  async function deleteCourt(courtId: number) {
    setDeletingId({ type: "court", id: courtId });
    try {
      await api(`/api/super-admin/courts/${courtId}`, { method: "DELETE", authenticated: true });
      toast.success("Court deleted.");
      await loadArenas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete court.");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Calibration annotation ────────────────────────────────────────────────
  async function loadCalibrations(courtId: number) {
    setCalibsLoading(true);
    try {
      const res = await api<{ calibrations: CalibSummary[] }>(`/api/admin/court-calibrations/${courtId}`, { authenticated: true });
      setCalibrations(res.calibrations ?? []);
    } catch { /* ignore */ }
    finally { setCalibsLoading(false); }
  }

  function openCalibAnnotator(court: typeof calibCourts[0]) {
    setSelectedCourtForCalib({ id: court.id, name: court.name, court_type: court.court_type, arenaName: court.arena_name });
    setCalibrations([]);
    setFrameFile(null);
    setFrameUrl(null);
    setPlacedPoints([]);
    setActiveKpId(0);
    setNewCalibId(null);
    setCalibDialogOpen(true);
    loadCalibrations(court.id);
  }

  function closeCalibDialog() {
    setCalibDialogOpen(false);
    setSelectedCourtForCalib(null);
    if (frameUrlRef.current) { URL.revokeObjectURL(frameUrlRef.current); frameUrlRef.current = null; }
    setFrameUrl(null);
    setFrameFile(null);
    setPlacedPoints([]);
    loadArenas();
  }

  function onFrameFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    frameUrlRef.current = url;
    setFrameFile(file);
    setFrameUrl(url);
    setPlacedPoints([]);
    setNewCalibId(null);
    imgRef.current = null;
  }

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    for (const pt of placedPoints) {
      const active = pt.kpId === activeKpId;
      ctx.beginPath(); ctx.arc(pt.imageX, pt.imageY, 13, 0, Math.PI * 2);
      ctx.fillStyle = active ? "rgba(59,130,246,0.88)" : "rgba(16,185,129,0.88)";
      ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(pt.kpId + 1), pt.imageX, pt.imageY);
    }
  }, [placedPoints, activeKpId]);

  useEffect(() => {
    if (!frameUrl) { imgRef.current = null; drawCanvas(); return; }
    const img = new Image();
    img.onload = () => { imgRef.current = img; drawCanvas(); };
    img.src = frameUrl;
  }, [frameUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (canvas.height / rect.height));
    const updated: PlacedPoint[] = [
      ...placedPoints.filter((p) => p.kpId !== activeKpId),
      { kpId: activeKpId, imageX: x, imageY: y },
    ];
    setPlacedPoints(updated);
    const ids = new Set(updated.map((p) => p.kpId));
    const next = PADEL_KP.find((kp) => !ids.has(kp.id));
    if (next) setActiveKpId(next.id);
  }

  async function computeAndSave() {
    if (!selectedCourtForCalib) return;
    if (placedPoints.length < 4) { toast.error("Place at least 4 keypoints."); return; }
    setSavingCalib(true);
    try {
      const sorted = [...placedPoints].sort((a, b) => a.kpId - b.kpId);
      let calibId = newCalibId;
      if (!calibId) {
        const form = new FormData();
        form.set("sport_type", "padel");
        if (frameFile) form.append("frame", frameFile);
        const token = getToken();
        const resp = await fetch(resolveApiUrl(`/api/admin/court-calibrations/${selectedCourtForCalib.id}`), {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: form,
        });
        const d = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(d.message ?? "Failed to create calibration.");
        calibId = d.calibration.id;
        setNewCalibId(calibId);
      }
      const result = await api<{ homography_computed: boolean }>(`/api/admin/court-calibrations/${calibId}/keypoints`, {
        method: "PATCH", authenticated: true,
        body: {
          image_points: sorted.map((p) => [p.imageX, p.imageY]),
          world_points: sorted.map((p) => PADEL_KP[p.kpId].world),
          keypoint_labels: sorted.map((p) => PADEL_KP[p.kpId].label),
        },
      });
      if (result.homography_computed) {
        toast.success("Homography computed and saved.");
      } else {
        toast.warning("Keypoints saved — homography computation failed.");
      }
      await loadCalibrations(selectedCourtForCalib.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to compute homography.");
    } finally {
      setSavingCalib(false);
    }
  }

  async function activateCalib(calibId: number) {
    if (!selectedCourtForCalib) return;
    setActivatingCalib(calibId);
    try {
      await api(`/api/admin/court-calibrations/${calibId}/activate`, { method: "POST", authenticated: true });
      toast.success("Calibration activated.");
      await Promise.all([loadCalibrations(selectedCourtForCalib.id), loadArenas()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate.");
    } finally {
      setActivatingCalib(null);
    }
  }

  async function deleteCalib(calibId: number) {
    if (!selectedCourtForCalib) return;
    setDeletingCalib(calibId);
    try {
      await api(`/api/admin/court-calibrations/${calibId}`, { method: "DELETE", authenticated: true });
      toast.success("Calibration deleted.");
      if (newCalibId === calibId) setNewCalibId(null);
      await loadCalibrations(selectedCourtForCalib.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeletingCalib(null);
    }
  }

  const placedIds = new Set(placedPoints.map((p) => p.kpId));

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
            <AlertCircle size={32} className="text-red-400" />
          </div>
          <p className="text-lg font-bold">Access Denied</p>
          <p className="text-sm text-muted-foreground">Super admin privileges required.</p>
          <Button variant="outline" onClick={() => navigate("/admin")}><ArrowLeft size={14} /> Back to Admin</Button>
        </div>
      </Layout>
    );
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalCourts = arenas.reduce((s, a) => s + a.courts.length, 0);
  const totalCalibrated = arenas.reduce((s, a) => s + a.courts.filter((c) => c.calib_id).length, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft size={15} />
            </Button>
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <Building2 size={22} className="text-primary" />
                Arenas & Courts
                <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20 ml-1">
                  Super Admin
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage arenas, courts, and court calibrations across all of Tunisia.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadArenas} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Arenas", value: arenas.length, color: "text-primary" },
            { label: "Courts", value: totalCourts, color: "text-foreground" },
            { label: "Calibrated", value: totalCalibrated, color: "text-green-400" },
            { label: "Pending", value: totalCourts - totalCalibrated, color: "text-amber-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="gradient-card rounded-xl border border-border/50 px-4 py-3 text-center">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-border/50 bg-muted/20 p-1 w-fit">
          {(["arenas", "calibration"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all capitalize ${
                tab === t ? "bg-primary text-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "arenas" ? "Arenas & Courts" : "Court Calibration"}
            </button>
          ))}
        </div>

        {/* ── ARENAS & COURTS TAB ─────────────────────────────────────────── */}
        {tab === "arenas" && (
          <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search arenas by name or location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button onClick={openAddArena} className="glow-yellow whitespace-nowrap">
                <Plus size={14} /> Add Arena
              </Button>
            </div>

            {/* City filter */}
            <div className="flex flex-wrap gap-2">
              {allCities.map((city) => (
                <button
                  key={city}
                  onClick={() => setCityFilter(city)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    cityFilter === city
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>

            {/* Arena list */}
            {loading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
              </div>
            ) : filteredArenas.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border/50 rounded-2xl text-muted-foreground text-sm">
                {arenas.length === 0 ? "No arenas yet. Add your first arena." : "No arenas match your filter."}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredArenas.map((arena) => (
                  <ArenaCard
                    key={arena.id}
                    arena={arena}
                    addingCourtFor={addingCourtFor}
                    editingCourt={editingCourt}
                    courtForm={courtForm}
                    setCourtForm={setCourtForm}
                    savingCourt={savingCourt}
                    deletingId={deletingId}
                    onEditArena={() => openEditArena(arena)}
                    onDeleteArena={() => deleteArena(arena.id)}
                    onAddCourt={() => openAddCourt(arena.id)}
                    onEditCourt={(c) => openEditCourt(arena.id, c)}
                    onDeleteCourt={(id) => deleteCourt(id)}
                    onSaveCourt={saveCourt}
                    onCancelCourt={cancelCourtForm}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CALIBRATION TAB ─────────────────────────────────────────────── */}
        {tab === "calibration" && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search courts or arenas…"
                  value={calibSearch}
                  onChange={(e) => setCalibSearch(e.target.value)}
                />
              </div>
            </div>

            {/* City filter */}
            <div className="flex flex-wrap gap-2">
              {allCities.map((city) => (
                <button
                  key={city}
                  onClick={() => setCalibCity(city)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    calibCity === city
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
              </div>
            ) : calibCourtsByCity.size === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border/50 rounded-2xl">
                No courts match your filter.
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from(calibCourtsByCity.entries()).map(([city, arenaMap]) => {
                  const cityCount = Array.from(arenaMap.values()).flat().length;
                  const cityCalib = Array.from(arenaMap.values()).flat().filter((c) => c.calib_id).length;
                  return (
                    <details key={city} className="group">
                      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3.5 hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <MapPin size={14} className="text-primary shrink-0" />
                          <span className="font-bold text-sm">{city}</span>
                          <span className="rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {cityCount} court{cityCount !== 1 ? "s" : ""}
                          </span>
                          {cityCalib > 0 && (
                            <span className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
                              {cityCalib} calibrated
                            </span>
                          )}
                        </div>
                        <ChevronDown size={14} className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                      </summary>

                      <div className="mt-2 ml-3 space-y-2">
                        {Array.from(arenaMap.entries()).map(([arenaName, courts]) => {
                          const arenaCalib = courts.filter((c) => c.calib_id).length;
                          return (
                            <details key={arenaName} className="group/arena">
                              <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3 hover:border-border/60 transition-colors">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">{arenaName}</span>
                                  <span className="rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{courts.length}</span>
                                  {arenaCalib > 0 && (
                                    <span className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
                                      {arenaCalib} calibrated
                                    </span>
                                  )}
                                </div>
                                <ChevronDown size={13} className="shrink-0 text-muted-foreground transition-transform duration-200 group-open/arena:rotate-180" />
                              </summary>
                              <div className="mt-1.5 ml-3 space-y-1">
                                {courts.map((court) => (
                                  <div key={court.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/30 px-4 py-3 gap-3 hover:border-border/60 transition-colors">
                                    <div>
                                      <p className="text-sm font-semibold">{court.name}</p>
                                      <p className="text-xs capitalize text-muted-foreground">{court.court_type ?? court.sport ?? "padel"}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {court.calib_id ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-green-400">
                                          <CheckCircle2 size={10} /> Calibrated
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                          <AlertCircle size={10} /> Not calibrated
                                        </span>
                                      )}
                                      <Button type="button" size="sm" variant="outline" onClick={() => openCalibAnnotator(court)}>
                                        <Crosshair size={13} /> Annotate
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Arena Create/Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={arenaDialogOpen} onOpenChange={(v) => !v && setArenaDialogOpen(false)}>
        <DialogContent className="max-w-lg p-0" aria-describedby={undefined}>
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              {editingArena ? "Edit Arena" : "New Arena"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-4 space-y-4">
            {/* Image upload */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl border border-border/50 bg-muted/20 overflow-hidden flex items-center justify-center flex-shrink-0">
                {arenaImagePreview ? (
                  <img src={arenaImagePreview} alt="arena" className="w-full h-full object-cover" />
                ) : (
                  <Camera size={24} className="text-muted-foreground/40" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Arena photo / logo</p>
                <input type="file" accept="image/*" onChange={onArenaImageChange}
                  className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 cursor-pointer" />
              </div>
            </div>

            <div className="grid gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Arena name *</label>
                <Input placeholder="e.g. Padel Club Tunis" value={arenaForm.name} onChange={(e) => setArenaForm({ ...arenaForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Location (city, address) *</label>
                <Input placeholder="e.g. Tunis, Rue du Sport 12" value={arenaForm.location} onChange={(e) => setArenaForm({ ...arenaForm, location: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none min-h-[70px]"
                  placeholder="Brief description of the arena…"
                  value={arenaForm.description}
                  onChange={(e) => setArenaForm({ ...arenaForm, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1"><Phone size={10} /> Phone</label>
                  <Input placeholder="+216 XX XXX XXX" value={arenaForm.phone} onChange={(e) => setArenaForm({ ...arenaForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1"><Globe size={10} /> Website</label>
                  <Input placeholder="https://…" value={arenaForm.website} onChange={(e) => setArenaForm({ ...arenaForm, website: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setArenaDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveArena} disabled={savingArena} className="glow-yellow">
                {savingArena ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
                {savingArena ? "Saving…" : (editingArena ? "Update Arena" : "Create Arena")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Calibration Annotation Dialog ─────────────────────────────────── */}
      <Dialog open={calibDialogOpen} onOpenChange={(v) => !v && closeCalibDialog()}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0" aria-describedby={undefined}>
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Crosshair size={16} className="text-primary" />
              Calibrate: {selectedCourtForCalib?.name ?? ""}
              <span className="text-xs font-normal text-muted-foreground ml-1 capitalize">
                {selectedCourtForCalib?.court_type ?? ""} · {selectedCourtForCalib?.arenaName}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-4 space-y-5">
            {/* Saved calibrations */}
            {calibsLoading ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : calibrations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Saved calibrations</p>
                {calibrations.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/10 px-3 py-2 gap-2">
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      <span className="font-medium">v{c.version}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {c.point_count ?? 0} pts · {c.status}
                        {c.computed_at && ` · ${new Date(c.computed_at).toLocaleDateString()}`}
                      </span>
                      {c.is_active && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-400 flex-shrink-0">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {c.has_homography && !c.is_active && (
                        <Button type="button" size="sm" onClick={() => activateCalib(c.id)} disabled={activatingCalib === c.id}>
                          <Zap size={12} /> {activatingCalib === c.id ? "…" : "Activate"}
                        </Button>
                      )}
                      {!c.has_homography && newCalibId !== c.id && (
                        <span className="text-xs text-amber-300 self-center">No H yet</span>
                      )}
                      <Button type="button" size="sm" variant="destructive" onClick={() => deleteCalib(c.id)} disabled={deletingCalib === c.id}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* New annotation */}
            <div className="border-t border-border/30 pt-5 space-y-4">
              <p className="text-sm font-bold">New annotation</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Calibration frame <span className="text-muted-foreground/60">(screenshot from camera)</span>
                </label>
                <input type="file" accept="image/*" onChange={onFrameFileChange}
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 cursor-pointer" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Click to place keypoint {activeKpId + 1}: {PADEL_KP[activeKpId]?.label}
                  </p>
                  {frameUrl ? (
                    <canvas ref={canvasRef} onClick={onCanvasClick}
                      className="w-full rounded-lg border border-border/50 cursor-crosshair bg-black"
                      style={{ maxHeight: "400px", objectFit: "contain" }} />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/40 bg-muted/5 text-center text-sm text-muted-foreground" style={{ minHeight: 220 }}>
                      <Crosshair size={28} className="opacity-25" />
                      <span>Upload a frame image to start annotating</span>
                      <canvas ref={canvasRef} style={{ display: "none" }} />
                    </div>
                  )}
                </div>

                <div className="space-y-3 lg:w-56">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reference (click to select)</p>
                  <CourtDiagram placedIds={placedIds} activeKpId={activeKpId} onSelect={setActiveKpId} />
                  <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                    {PADEL_KP.map((kp) => {
                      const placed = placedIds.has(kp.id), active = kp.id === activeKpId;
                      return (
                        <div key={kp.id}
                          className={`flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer text-xs transition-colors ${active ? "bg-primary/15 text-primary font-bold" : "hover:bg-muted/20 text-muted-foreground"}`}
                          onClick={() => setActiveKpId(kp.id)}>
                          <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${placed ? "bg-green-500/25 text-green-400" : active ? "bg-primary/25 text-primary" : "bg-muted/40"}`}>
                            {kp.id + 1}
                          </span>
                          <span className="truncate">{kp.label}</span>
                          {placed && (
                            <button type="button" className="ml-auto text-muted-foreground hover:text-red-400 flex-shrink-0"
                              onClick={(e) => { e.stopPropagation(); setPlacedPoints((pp) => pp.filter((p) => p.kpId !== kp.id)); }}>
                              <X size={9} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Button type="button" onClick={computeAndSave} disabled={savingCalib || placedPoints.length < 4} className="glow-yellow">
                  {savingCalib ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                  {savingCalib ? "Computing…" : `Compute & Save (${placedPoints.length} pts)`}
                </Button>
                {newCalibId && !savingCalib && (
                  <Button type="button" variant="outline" onClick={() => activateCalib(newCalibId!)} disabled={activatingCalib === newCalibId}>
                    <CheckCircle2 size={13} /> Activate
                  </Button>
                )}
                {placedPoints.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPlacedPoints([])}>
                    Clear all
                  </Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto">Min 4 keypoints · More = better accuracy</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// ── Arena Card component ─────────────────────────────────────────────────────
function ArenaCard({
  arena, addingCourtFor, editingCourt, courtForm, setCourtForm,
  savingCourt, deletingId,
  onEditArena, onDeleteArena, onAddCourt, onEditCourt, onDeleteCourt, onSaveCourt, onCancelCourt,
}: {
  arena: Arena;
  addingCourtFor: number | null;
  editingCourt: { arenaId: number; court: CourtInArena } | null;
  courtForm: typeof EMPTY_COURT_FORM;
  setCourtForm: React.Dispatch<React.SetStateAction<typeof EMPTY_COURT_FORM>>;
  savingCourt: boolean;
  deletingId: { type: "arena" | "court"; id: number } | null;
  onEditArena: () => void;
  onDeleteArena: () => void;
  onAddCourt: () => void;
  onEditCourt: (c: CourtInArena) => void;
  onDeleteCourt: (id: number) => void;
  onSaveCourt: () => void;
  onCancelCourt: () => void;
}) {
  const calibCount = arena.courts.filter((c) => c.calib_id).length;
  const isAddingHere = addingCourtFor === arena.id;
  const deletingThisArena = deletingId?.type === "arena" && deletingId.id === arena.id;

  return (
    <div className="gradient-card rounded-2xl border border-border/50 overflow-hidden">
      {/* Arena header */}
      <div className="flex items-start gap-4 p-5">
        {/* Image */}
        <div className="w-16 h-16 rounded-xl border border-border/40 bg-muted/20 overflow-hidden flex items-center justify-center flex-shrink-0">
          {arena.image_url ? (
            <img src={resolveApiUrl(arena.image_url)} alt={arena.name} className="w-full h-full object-cover" />
          ) : (
            <Building2 size={22} className="text-muted-foreground/30" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-base">{arena.name}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin size={10} /> {arena.location}
              </p>
              {arena.description && (
                <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{arena.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {arena.courts.length} court{arena.courts.length !== 1 ? "s" : ""}
                </span>
                {calibCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-400">
                    <CheckCircle2 size={9} /> {calibCount} calibrated
                  </span>
                )}
                {arena.phone && (
                  <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                    <Phone size={9} /> {arena.phone}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={onEditArena} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0">
                <Edit2 size={13} />
              </Button>
              <Button variant="ghost" size="sm" onClick={onDeleteArena} disabled={deletingThisArena}
                className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0">
                <Trash2 size={13} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Courts list */}
      {(arena.courts.length > 0 || isAddingHere) && (
        <div className="border-t border-border/30 px-5 pb-4 pt-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Courts</p>
            <Button variant="ghost" size="sm" onClick={onAddCourt} className="text-xs h-7 gap-1 text-primary hover:bg-primary/10">
              <Plus size={12} /> Add Court
            </Button>
          </div>

          {arena.courts.map((court) => {
            const isEditingThis = editingCourt?.court.id === court.id;
            const isDeletingThis = deletingId?.type === "court" && deletingId.id === court.id;
            return (
              <div key={court.id}>
                {isEditingThis ? (
                  <CourtForm courtForm={courtForm} setCourtForm={setCourtForm} onSave={onSaveCourt} onCancel={onCancelCourt} saving={savingCourt} isEdit />
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-border/30 bg-background/20 px-3 py-2.5 gap-2 hover:border-border/50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold">{court.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{court.sport} · {court.court_type ?? "standard"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {court.calib_id ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-400">
                          <CheckCircle2 size={8} /> calibrated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-400">
                          <AlertCircle size={8} /> pending
                        </span>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => onEditCourt(court)}
                        className="text-muted-foreground hover:text-foreground h-7 w-7 p-0">
                        <Edit2 size={12} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDeleteCourt(court.id)} disabled={isDeletingThis}
                        className="text-muted-foreground hover:text-red-400 h-7 w-7 p-0">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isAddingHere && (
            <CourtForm courtForm={courtForm} setCourtForm={setCourtForm} onSave={onSaveCourt} onCancel={onCancelCourt} saving={savingCourt} isEdit={false} />
          )}
        </div>
      )}

      {arena.courts.length === 0 && !isAddingHere && (
        <div className="border-t border-border/30 px-5 py-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">No courts yet</p>
          <Button variant="ghost" size="sm" onClick={onAddCourt} className="text-xs h-7 gap-1 text-primary hover:bg-primary/10">
            <Plus size={12} /> Add Court
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Court inline form ────────────────────────────────────────────────────────
function CourtForm({
  courtForm, setCourtForm, onSave, onCancel, saving, isEdit,
}: {
  courtForm: typeof EMPTY_COURT_FORM;
  setCourtForm: React.Dispatch<React.SetStateAction<typeof EMPTY_COURT_FORM>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEdit: boolean;
}) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">{isEdit ? "Edit court" : "New court"}</p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Court name *"
          value={courtForm.name}
          onChange={(e) => setCourtForm((f) => ({ ...f, name: e.target.value }))}
          className="text-sm h-8"
        />
        <select
          className="bg-background border border-border rounded-lg px-2 py-1 text-sm h-8"
          value={courtForm.sport}
          onChange={(e) => setCourtForm((f) => ({ ...f, sport: e.target.value }))}
        >
          {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Input
          placeholder="Court type (indoor, outdoor…)"
          value={courtForm.courtType}
          onChange={(e) => setCourtForm((f) => ({ ...f, courtType: e.target.value }))}
          className="text-sm h-8"
        />
        <Input
          placeholder="Price / hour (TND)"
          type="number"
          value={courtForm.pricePerHour}
          onChange={(e) => setCourtForm((f) => ({ ...f, pricePerHour: e.target.value }))}
          className="text-sm h-8"
        />
        <Input
          placeholder="Opens"
          type="time"
          value={courtForm.openingTime}
          onChange={(e) => setCourtForm((f) => ({ ...f, openingTime: e.target.value }))}
          className="text-sm h-8"
        />
        <Input
          placeholder="Closes"
          type="time"
          value={courtForm.closingTime}
          onChange={(e) => setCourtForm((f) => ({ ...f, closingTime: e.target.value }))}
          className="text-sm h-8"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving} className="h-7 text-xs">
          {saving ? <RefreshCw size={11} className="animate-spin" /> : null}
          {saving ? "Saving…" : (isEdit ? "Update" : "Create")}
        </Button>
      </div>
    </div>
  );
}
