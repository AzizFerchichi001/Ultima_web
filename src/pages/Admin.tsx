import { useEffect, useState, useCallback } from "react";
import { useLocale } from "@/i18n/locale";
import { SuperAdminCalibrationContent } from "./SuperAdminCalibrationPage";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import SmartPlayClipAnalysisPanel from "@/components/smartplay/SmartPlayClipAnalysisPanel";
import CourtCalibrationPanel from "@/components/smartplay/CourtCalibrationPanel";
import AdminCourtLivePanel from "@/components/smartplay/AdminCourtLivePanel";
import ReservationsPanel from "@/components/admin/ReservationsPanel";
import CourtSchedulePanel from "@/components/admin/CourtSchedulePanel";
import CoachSchedulesPanel from "@/components/admin/CoachSchedulesPanel";
import LiveSessionsPanel from "@/components/admin/LiveSessionsPanel";
import {
  Users, MapPin, Trophy, Activity, BarChart3, Shield, Settings,
  CreditCard, CheckCircle2, Clock,
  RefreshCw, ChevronRight, AlertCircle, Zap, Brain, Wifi,
  Plus, Trash2, UserCheck, UserX, Search, Award,
  CalendarDays, Layers, Crosshair, Video, CalendarCheck,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminOverview = {
  stats: {
    users: number;
    activeCompetitions: number;
    totalRegistrations: number;
    matchesThisWeek: number;
  };
  users: Array<{
    id: number; first_name: string; last_name: string; email: string;
    role: string; platform_role?: string; status: string;
    arena_id?: number | null; arena_name: string | null; created_at: string;
  }>;
  courts: Array<{
    id: number; name: string; status: string; has_summa: number;
    arena_name: string; sport: string; price_per_hour?: number;
  }>;
  logs: Array<{
    id: number; action: string; actor_name: string; detail: string;
    created_at: string; arena_name?: string | null;
  }>;
  arenas: Array<{ id: number; name: string; location: string }>;
};

type AdminReservation = {
  id: number; reservation_date: string; start_time: string; end_time: string;
  status: "confirmed" | "cancelled" | "completed"; court_name: string;
  arena_name: string; owner_name: string; owner_email: string;
  special_code?: string; payment_status?: string;
};

type RevenueSummary = {
  summary: { total_revenue: number; paid_count: number; pending_count: number; refunded_count: number };
  monthly: Array<{ month: string; revenue: number; payments: number }>;
};

type SmartPlayStatus = {
  connected: boolean; version?: string | null; message: string;
};

type AdminCompetition = {
  id: number; name: string; sport: string; description?: string;
  start_date: string; end_date?: string; registration_deadline?: string;
  location: string; max_participants: number; participants: number;
  status: "open" | "full" | "closed"; rules?: string | null; prizes?: string | null;
  arena_name?: string;
};

type CompRegistration = {
  id: number; userId: number; firstName: string; lastName: string;
  email: string; status: string; rankingScore: number; registeredAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const roleBadge: Record<string, string> = {
  super_admin: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  admin: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  coach: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  player: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
};

const statusBadge: Record<string, string> = {
  active: "bg-green-500/20 text-green-300 border border-green-500/30",
  inactive: "bg-red-500/20 text-red-300 border border-red-500/30",
  confirmed: "bg-green-500/20 text-green-300 border border-green-500/30",
  cancelled: "bg-red-500/20 text-red-300 border border-red-500/30",
  completed: "bg-muted text-muted-foreground border border-border",
  live: "bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse",
  finished: "bg-muted text-muted-foreground border border-border",
  upcoming: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border border-green-500/30",
  pending: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  failed: "bg-red-500/20 text-red-300 border border-red-500/30",
  refunded: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
};

function RBadge({ label }: { label: string }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${roleBadge[label] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

function SBadge({ label }: { label: string }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${statusBadge[label] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof Users; label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-5 flex items-center gap-4 hover:border-primary/30 transition-colors">
      <div className={`p-3 rounded-xl ${accent ?? "bg-primary/10"}`}>
        <Icon size={22} className="text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-0.5">{label}</p>
        <p className="text-2xl font-display font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Sidebar nav items ─────────────────────────────────────────────────────────

const navItems = [
  { id: "overview",       label: "Overview",        icon: BarChart3     },
  { id: "users",          label: "Users",            icon: Users         },
  { id: "courts",         label: "Courts",           icon: MapPin        },
  { id: "schedule",       label: "Court Schedule",   icon: CalendarCheck },
  { id: "reservations",   label: "Reservations",     icon: CalendarDays  },
  { id: "coach-schedules",label: "Coach Schedules",  icon: Award         },
  { id: "lives",          label: "Live Sessions",    icon: Video         },
  { id: "scoring",        label: "Analysis",         icon: Layers        },
  { id: "competitions",   label: "Competitions",     icon: Trophy        },
  { id: "revenue",        label: "Revenue",          icon: CreditCard    },
  { id: "logs",           label: "Activity Logs",    icon: Activity      },
  { id: "system",         label: "System Status",    icon: Settings      },
];

// ── Main Component ─────────────────────────────────────────────────────────────

const Admin = () => {
  const user = getSessionUser();
  const isSuperAdmin = user?.role === "super_admin";
  const { t } = useLocale();

  const [activeSection, setActiveSection] = useState("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [aiStatus, setAiStatus] = useState<SmartPlayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingUserUpdates, setPendingUserUpdates] = useState<Record<number, { role: "player" | "coach" | "admin"; arenaId: number | null }>>({});

  const [form, setForm] = useState({ nom: "", prenom: "", email: "", password: "", role: "player", arenaId: "", arenaName: "", cinNumber: "" });
  const [courtForm, setCourtForm] = useState({ name: "", sport: "Padel", location: "", arenaId: "", hasSumma: false, minPlayers: 2, maxPlayers: 4, openingTime: "08:00", closingTime: "22:00" });
  const [showUserForm, setShowUserForm] = useState(false);
  const [showCourtForm, setShowCourtForm] = useState(false);

  // Competition management
  const blankCompForm = { name: "", sport: "Padel", description: "", startDate: "", endDate: "", registrationDeadline: "", location: "", maxParticipants: "16", status: "open" as "open" | "full" | "closed", rules: "", prizes: "" };
  const [competitions, setCompetitions] = useState<AdminCompetition[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compForm, setCompForm] = useState(blankCompForm);
  const [editingCompId, setEditingCompId] = useState<number | null>(null);
  const [showCompForm, setShowCompForm] = useState(false);
  const [compSaving, setCompSaving] = useState(false);
  const [viewingRegistrations, setViewingRegistrations] = useState<number | null>(null);
  const [registrations, setRegistrations] = useState<CompRegistration[]>([]);
  const [regsLoading, setRegsLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!user || !["admin", "super_admin"].includes(user.role)) { setLoading(false); return; }
    try {
      const result = await api<AdminOverview>("/api/admin/overview", { authenticated: true });
      setOverview(result);
      setForm((c) => ({ ...c, arenaId: c.arenaId || String(user.arenaId ?? result.arenas[0]?.id ?? "") }));
      setCourtForm((c) => ({ ...c, arenaId: c.arenaId || String(user.arenaId ?? result.arenas[0]?.id ?? "") }));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to load admin panel."); } finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (activeSection === "reservations" && !reservations.length) {
      api<{ reservations: AdminReservation[] }>("/api/admin/reservations", { authenticated: true })
        .then((r) => setReservations(r.reservations))
        .catch(() => toast.error("Failed to load reservations."));
    }
    if (activeSection === "revenue" && !revenue) {
      api<RevenueSummary>("/api/admin/revenue", { authenticated: true })
        .then(setRevenue)
        .catch(() => {});
    }
    if (activeSection === "system" && !aiStatus) {
      api<SmartPlayStatus>("/api/smartplay/status")
        .then(setAiStatus)
        .catch(() => setAiStatus({ connected: false, message: "Unable to reach AI service." }));
    }
    if (activeSection === "competitions") {
      void loadCompetitions();
    }
  }, [activeSection]);

  const loadCompetitions = async () => {
    setCompLoading(true);
    try {
      const r = await api<{ competitions: AdminCompetition[] }>("/api/admin/competitions", { authenticated: true });
      setCompetitions(r.competitions);
    } catch { toast.error("Failed to load competitions."); } finally { setCompLoading(false); }
  };

  const openCreateComp = () => {
    setEditingCompId(null);
    setCompForm(blankCompForm);
    setShowCompForm(true);
  };

  const openEditComp = (c: AdminCompetition) => {
    setEditingCompId(c.id);
    setCompForm({
      name: c.name, sport: c.sport, description: c.description ?? "",
      startDate: c.start_date?.slice(0, 10) ?? "", endDate: c.end_date?.slice(0, 10) ?? "",
      registrationDeadline: c.registration_deadline?.slice(0, 10) ?? "",
      location: c.location, maxParticipants: String(c.max_participants),
      status: c.status, rules: c.rules ?? "", prizes: c.prizes ?? "",
    });
    setShowCompForm(true);
  };

  const saveComp = async () => {
    if (!compForm.name || !compForm.startDate || !compForm.location || !compForm.maxParticipants) {
      toast.error(t("admin.comp.required"));
      return;
    }
    setCompSaving(true);
    try {
      const body = {
        name: compForm.name, sport: compForm.sport, description: compForm.description || undefined,
        startDate: compForm.startDate, endDate: compForm.endDate || undefined,
        registrationDeadline: compForm.registrationDeadline || undefined,
        location: compForm.location, maxParticipants: Number(compForm.maxParticipants),
        status: compForm.status, rules: compForm.rules || undefined, prizes: compForm.prizes || undefined,
      };
      if (editingCompId) {
        await api(`/api/admin/competitions/${editingCompId}`, { method: "PUT", body: JSON.stringify(body), authenticated: true });
        toast.success(t("admin.comp.updated"));
      } else {
        await api("/api/admin/competitions", { method: "POST", body: JSON.stringify(body), authenticated: true });
        toast.success(t("admin.comp.created"));
      }
      setShowCompForm(false);
      void loadCompetitions();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("admin.comp.error")); } finally { setCompSaving(false); }
  };

  const deleteComp = async (id: number) => {
    if (!confirm("Supprimer cette compétition et toutes ses inscriptions ?")) return;
    try {
      await api(`/api/admin/competitions/${id}`, { method: "DELETE", authenticated: true });
      toast.success("Compétition supprimée.");
      void loadCompetitions();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur."); }
  };

  const loadRegistrations = async (compId: number) => {
    setViewingRegistrations(compId);
    setRegsLoading(true);
    try {
      const r = await api<{ registrations: CompRegistration[] }>(`/api/admin/competitions/${compId}/registrations`, { authenticated: true });
      setRegistrations(r.registrations);
    } catch { toast.error("Impossible de charger les inscriptions."); } finally { setRegsLoading(false); }
  };

  const removeRegistration = async (compId: number, userId: number) => {
    if (!confirm("Retirer ce joueur de la compétition ?")) return;
    try {
      await api(`/api/admin/competitions/${compId}/registrations/${userId}`, { method: "DELETE", authenticated: true });
      toast.success("Joueur retiré.");
      void loadRegistrations(compId);
      void loadCompetitions();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur."); }
  };

  const updateUserStatus = async (userId: number, status: "active" | "inactive") => {
    setSaving(true);
    try {
      await api(`/api/admin/users/${userId}/status`, { method: "PATCH", body: JSON.stringify({ status }), authenticated: true });
      toast.success(`Account ${status === "inactive" ? "deactivated" : "reactivated"}.`);
      await loadOverview();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error updating status."); } finally { setSaving(false); }
  };

  const queueUserUpdate = (userId: number, patch: Partial<{ role: "player" | "coach" | "admin"; arenaId: number | null }>) => {
    const user = overview?.users.find((u) => u.id === userId);
    if (!user) return;
    setPendingUserUpdates((current) => ({
      ...current,
      [userId]: {
        role: patch.role ?? (current[userId]?.role ?? user.role as "player" | "coach" | "admin"),
        arenaId: patch.arenaId ?? (current[userId]?.arenaId ?? user.arena_id ?? Number(overview?.arenas[0]?.id ?? 0)),
      },
    }));
  };

  const clearQueuedUserUpdate = (userId: number) => {
    setPendingUserUpdates((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
  };

  const updateUserRole = async (userId: number) => {
    const pending = pendingUserUpdates[userId];
    if (!pending) return;
    setSaving(true);
    try {
      await api(`/api/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify(pending), authenticated: true });
      toast.success(`Role updated to ${pending.role}.`);
      clearQueuedUserUpdate(userId);
      await loadOverview();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error updating role."); } finally { setSaving(false); }
  };

  const removeUser = async (userId: number, label: string) => {
    if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api(`/api/admin/users/${userId}`, { method: "DELETE", authenticated: true });
      toast.success("User deleted.");
      await loadOverview();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error deleting user."); } finally { setSaving(false); }
  };

  const createUser = async () => {
    setSaving(true);
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(form), authenticated: true });
      toast.success("User created.");
      setShowUserForm(false);
      setForm({ nom: "", prenom: "", email: "", password: "", role: "player", arenaId: overview?.arenas[0]?.id?.toString() ?? "", arenaName: "", cinNumber: "" });
      await loadOverview();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error creating user."); } finally { setSaving(false); }
  };

  const createCourt = async () => {
    setSaving(true);
    try {
      await api("/api/admin/courts", { method: "POST", body: JSON.stringify(courtForm), authenticated: true });
      toast.success("Court created.");
      setShowCourtForm(false);
      await loadOverview();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error creating court."); } finally { setSaving(false); }
  };

  const updateReservationStatus = async (id: number, status: string) => {
    setSaving(true);
    try {
      await api(`/api/admin/reservations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }), authenticated: true });
      toast.success("Status updated.");
      const r = await api<{ reservations: AdminReservation[] }>("/api/admin/reservations", { authenticated: true });
      setReservations(r.reservations);
    } catch { toast.error("Error updating reservation."); } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container py-12 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      </Layout>
    );
  }

  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return (
      <Layout>
        <div className="container py-24 text-center">
          <Shield size={48} className="mx-auto text-destructive mb-4" />
          <h2 className="text-2xl font-display font-bold">Access Denied</h2>
          <p className="text-muted-foreground mt-2">You need admin privileges to access this page.</p>
        </div>
      </Layout>
    );
  }

  const filteredUsers = (overview?.users ?? []).filter((u) =>
    !search || `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const stats = overview?.stats;

  return (
    <Layout>
      <div className="min-h-screen flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 border-r border-border/50 bg-background/60 backdrop-blur-sm pt-6 pb-8 px-3 fixed top-16 bottom-0 left-0 z-20 overflow-y-auto">
          <div className="px-3 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={16} className="text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-primary">Admin Panel</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <RBadge label={user.role} />
          </div>
          <nav className="space-y-1 flex-1">
            {navItems.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    activeSection === item.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                  {activeSection === item.id && <ChevronRight size={14} className="ml-auto" />}
                </button>
                {item.id === "users" && isSuperAdmin && (
                  <button
                    onClick={() => setActiveSection("calibration")}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeSection === "calibration"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <Crosshair size={16} />
                    {t("superAdmin.nav")}
                    {activeSection === "calibration" && <ChevronRight size={14} className="ml-auto" />}
                  </button>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Mobile top nav */}
        <div className="lg:hidden w-full px-4 pt-4 pb-2 flex gap-2 overflow-x-auto border-b border-border/50 bg-background/80 sticky top-16 z-10">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                activeSection === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <item.icon size={12} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 lg:ml-64 p-6 lg:p-8">

          {/* ── Overview ── */}
          {activeSection === "overview" && (
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl font-display font-bold text-gradient mb-1">
                  {isSuperAdmin ? "Platform Overview" : `${user.arenaName ?? "Arena"} Dashboard`}
                </h1>
                <p className="text-muted-foreground text-sm">Welcome back, {user.firstName ?? user.email}</p>
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Total Users" value={stats?.users ?? 0} sub="Active members" />
                <StatCard icon={Trophy} label="Active Competitions" value={stats?.activeCompetitions ?? 0} />
                <StatCard icon={Activity} label="Matches This Week" value={stats?.matchesThisWeek ?? 0} />
                <StatCard icon={Award} label="Registrations" value={stats?.totalRegistrations ?? 0} />
              </div>

              {/* Courts status */}
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="gradient-card rounded-2xl border border-border/50 p-5">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                    <MapPin size={14} /> Courts Overview
                  </h3>
                  <div className="space-y-2">
                    {(overview?.courts ?? []).slice(0, 6).map((court) => (
                      <div key={court.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium truncate">{court.name}</span>
                          {court.has_summa ? <span title="SUMMA"><Zap size={12} className="text-primary flex-shrink-0" /></span> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{court.sport}</span>
                          <SBadge label={court.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="gradient-card rounded-2xl border border-border/50 p-5">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                    <Activity size={14} /> Recent Activity
                  </h3>
                  <div className="space-y-3">
                    {(overview?.logs ?? []).slice(0, 6).map((log) => (
                      <div key={log.id} className="flex gap-3 items-start">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{log.detail}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {log.actor_name} · {new Date(log.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {!(overview?.logs ?? []).length && (
                      <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Role distribution */}
              {isSuperAdmin && (overview?.arenas ?? []).length > 1 && (
                <div className="gradient-card rounded-2xl border border-border/50 p-5">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                    <Layers size={14} /> Arenas
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {overview!.arenas.map((arena) => (
                      <div key={arena.id} className="p-3 rounded-xl bg-muted/30 border border-border/30">
                        <p className="font-medium text-sm">{arena.name}</p>
                        <p className="text-xs text-muted-foreground">{arena.location}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Users ── */}
          {activeSection === "users" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-display font-bold">Users Management</h2>
                <Button onClick={() => setShowUserForm(true)} size="sm" className="flex items-center gap-2">
                  <Plus size={14} /> Add User
                </Button>
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {showUserForm && (
                <div className="gradient-card rounded-2xl border border-border p-6 space-y-4">
                  <h3 className="font-bold text-lg">Create User</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input placeholder="First name" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
                    <Input placeholder="Last name" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
                    <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    {form.role !== "admin" && (
                      <Input placeholder="CIN (8 digits)" value={form.cinNumber} onChange={(e) => setForm({ ...form, cinNumber: e.target.value })} />
                    )}
                    <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      <option value="player">Player</option>
                      <option value="coach">Coach</option>
                      {isSuperAdmin && <option value="admin">Admin</option>}
                    </select>
                    <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.arenaId} onChange={(e) => setForm({ ...form, arenaId: e.target.value })}>
                      {(overview?.arenas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setShowUserForm(false)}>Cancel</Button>
                    <Button onClick={createUser} disabled={saving}>Create</Button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border/50">
                      <th className="text-left py-3 pr-4">Name</th>
                      <th className="text-left py-3 pr-4">Email</th>
                      <th className="text-left py-3 pr-4">Role</th>
                      <th className="text-left py-3 pr-4">Status</th>
                      <th className="text-left py-3 pr-4">Arena</th>
                      <th className="text-left py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const pending = pendingUserUpdates[u.id];
                      const selectedRole = pending?.role ?? (u.role as "player" | "coach" | "admin");
                      const selectedArenaId = pending?.arenaId ?? u.arena_id ?? Number(overview?.arenas[0]?.id ?? 0);
                      const hasPending = Boolean(pending && (pending.role !== u.role || Number(pending.arenaId) !== Number(u.arena_id)));
                      return (
                      <tr key={u.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="py-3 pr-4 font-medium">{u.first_name} {u.last_name}</td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs">{u.email}</td>
                        <td className="py-3 pr-4"><RBadge label={u.platform_role === "super_admin" ? "super_admin" : u.role} /></td>
                        <td className="py-3 pr-4"><SBadge label={u.status} /></td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">{u.arena_name ?? "—"}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isSuperAdmin && u.platform_role !== "super_admin" && (
                              <>
                                <select
                                  className="rounded-lg border border-border bg-background px-2 py-1 text-[11px]"
                                  value={selectedRole}
                                  onChange={(e) => queueUserUpdate(u.id, { role: e.target.value as "player" | "coach" | "admin" })}
                                  disabled={saving}
                                >
                                  <option value="player">Player</option>
                                  <option value="coach">Coach</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <select
                                  className="max-w-[150px] rounded-lg border border-border bg-background px-2 py-1 text-[11px]"
                                  value={String(selectedArenaId)}
                                  onChange={(e) => queueUserUpdate(u.id, { arenaId: Number(e.target.value) })}
                                  disabled={saving}
                                >
                                  {(overview?.arenas ?? []).map((arena) => (
                                    <option key={arena.id} value={arena.id}>{arena.name}</option>
                                  ))}
                                </select>
                                {hasPending && (
                                  <>
                                    <button
                                      onClick={() => updateUserRole(u.id)}
                                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                      disabled={saving}
                                    >Confirm</button>
                                    <button
                                      onClick={() => clearQueuedUserUpdate(u.id)}
                                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                                      disabled={saving}
                                    >Cancel</button>
                                  </>
                                )}
                              </>
                            )}
                            {!isSuperAdmin && u.role === "player" && (
                              <button
                                onClick={() => queueUserUpdate(u.id, { role: "coach", arenaId: u.arena_id })}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                disabled={saving}
                              >→ Coach</button>
                            )}
                            {!isSuperAdmin && u.role === "coach" && (
                              <button
                                onClick={() => queueUserUpdate(u.id, { role: "player", arenaId: u.arena_id })}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                disabled={saving}
                              >→ Player</button>
                            )}
                            {!isSuperAdmin && hasPending && (
                              <>
                                <button
                                  onClick={() => updateUserRole(u.id)}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                  disabled={saving}
                                >Confirm</button>
                                <button
                                  onClick={() => clearQueuedUserUpdate(u.id)}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                                  disabled={saving}
                                >Cancel</button>
                              </>
                            )}
                            <button
                              onClick={() => updateUserStatus(u.id, u.status === "active" ? "inactive" : "active")}
                              className={`p-1.5 rounded-lg transition-colors ${u.status === "active" ? "hover:bg-red-500/10 text-red-400" : "hover:bg-green-500/10 text-green-400"}`}
                              disabled={saving}
                            >
                              {u.status === "active" ? <UserX size={13} /> : <UserCheck size={13} />}
                            </button>
                            <button
                              onClick={() => removeUser(u.id, `${u.first_name} ${u.last_name}`)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                              disabled={saving}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})}
                    {!filteredUsers.length && (
                      <tr><td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Courts ── */}
          {activeSection === "courts" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-display font-bold">Courts / Terrains</h2>
                <Button onClick={() => setShowCourtForm(true)} size="sm" className="flex items-center gap-2">
                  <Plus size={14} /> Add Court
                </Button>
              </div>

              {showCourtForm && (
                <div className="gradient-card rounded-2xl border border-border p-6 space-y-4">
                  <h3 className="font-bold text-lg">Create Court</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input placeholder="Court name" value={courtForm.name} onChange={(e) => setCourtForm({ ...courtForm, name: e.target.value })} />
                    <Input placeholder="Location" value={courtForm.location} onChange={(e) => setCourtForm({ ...courtForm, location: e.target.value })} />
                    <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={courtForm.sport} onChange={(e) => setCourtForm({ ...courtForm, sport: e.target.value })}>
                      <option value="Padel">Padel</option>
                      <option value="Tennis">Tennis</option>
                    </select>
                    <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={courtForm.arenaId} onChange={(e) => setCourtForm({ ...courtForm, arenaId: e.target.value })}>
                      {(overview?.arenas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="hasSumma" checked={courtForm.hasSumma} onChange={(e) => setCourtForm({ ...courtForm, hasSumma: e.target.checked })} />
                      <label htmlFor="hasSumma" className="text-sm">Has SUMMA Device</label>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setShowCourtForm(false)}>Cancel</Button>
                    <Button onClick={createCourt} disabled={saving}>Create Court</Button>
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {(overview?.courts ?? []).map((court) => (
                  <div key={court.id} className="gradient-card rounded-2xl border border-border/50 p-5 hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold">{court.name}</p>
                        <p className="text-xs text-muted-foreground">{court.arena_name}</p>
                      </div>
                      <div className="flex gap-1.5 items-center">
                        {court.has_summa ? <Zap size={13} className="text-primary" /> : null}
                        <SBadge label={court.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin size={10} />{court.sport}</span>
                      {court.price_per_hour && <span>{court.price_per_hour} TND/h</span>}
                    </div>
                  </div>
                ))}
                {!(overview?.courts ?? []).length && (
                  <p className="text-muted-foreground text-sm col-span-3 py-8 text-center">No courts found</p>
                )}
              </div>
            </div>
          )}

          {/* ── Court Schedule ── */}
          {activeSection === "schedule" && (
            <CourtSchedulePanel />
          )}

          {/* ── Reservations ── */}
          {activeSection === "reservations" && (
            <ReservationsPanel />
          )}

          {/* ── Coach Schedules ── */}
          {activeSection === "coach-schedules" && (
            <CoachSchedulesPanel />
          )}

          {/* ── Live Sessions ── */}
          {activeSection === "lives" && (
            <LiveSessionsPanel courts={overview?.courts ?? []} />
          )}

          {/* ── Analysis ── */}
          {activeSection === "scoring" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-2xl font-display font-bold flex items-center gap-3">
                  <Layers size={24} className="text-primary" /> Video Analysis
                </h2>
                {isSuperAdmin && (
                  <a
                    href="/super-admin/calibration"
                    className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-4 py-2 text-sm font-bold text-foreground hover:border-border hover:bg-muted/50 transition-colors"
                  >
                    <Crosshair size={14} /> Arenas & Calibration
                  </a>
                )}
              </div>
              <AdminCourtLivePanel courts={overview?.courts ?? []} />
              <CourtCalibrationPanel />
              <SmartPlayClipAnalysisPanel users={overview?.users ?? []} />
              {/* VAR Scoring Coming Soon */}
              <div className="gradient-card rounded-2xl border border-primary/20 p-6 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 flex-shrink-0">
                  <Zap size={22} className="text-primary" />
                </div>
                <div>
                  <p className="font-bold flex items-center gap-2 mb-1">
                    VAR Review System
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">Coming Soon</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    AI-powered scoring, automatic point detection, and VAR-reviewed match results will appear here. Existing match score data is preserved and will be migrated when the system launches.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Competitions ── */}
          {activeSection === "competitions" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-display font-bold">Compétitions</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">Créez et gérez les tournois de votre arena.</p>
                </div>
                <Button onClick={openCreateComp} className="flex items-center gap-2">
                  <Plus size={16} /> Nouvelle compétition
                </Button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard icon={Trophy} label="Actives" value={competitions.filter((c) => c.status === "open").length} sub="Inscriptions ouvertes" />
                <StatCard icon={Users} label="Inscrits total" value={competitions.reduce((s, c) => s + (c.participants ?? 0), 0)} />
                <StatCard icon={Activity} label="Total tournois" value={competitions.length} />
              </div>

              {/* Form modal */}
              {showCompForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <div className="gradient-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-lg">{editingCompId ? "Modifier la compétition" : "Nouvelle compétition"}</h3>
                      <button onClick={() => setShowCompForm(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Nom *</label>
                        <Input placeholder="Open de Padel Été 2025" value={compForm.name} onChange={(e) => setCompForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Sport *</label>
                        <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={compForm.sport} onChange={(e) => setCompForm((f) => ({ ...f, sport: e.target.value }))}>
                          {["Padel", "Tennis", "Football", "Basketball", "Volleyball", "Badminton", "Squash"].map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Lieu *</label>
                        <Input placeholder="Arena Tunis" value={compForm.location} onChange={(e) => setCompForm((f) => ({ ...f, location: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Date de début *</label>
                        <Input type="date" value={compForm.startDate} onChange={(e) => setCompForm((f) => ({ ...f, startDate: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Date de fin</label>
                        <Input type="date" value={compForm.endDate} onChange={(e) => setCompForm((f) => ({ ...f, endDate: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Clôture inscriptions</label>
                        <Input type="date" value={compForm.registrationDeadline} onChange={(e) => setCompForm((f) => ({ ...f, registrationDeadline: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Max participants *</label>
                        <Input type="number" min="2" max="256" value={compForm.maxParticipants} onChange={(e) => setCompForm((f) => ({ ...f, maxParticipants: e.target.value }))} />
                      </div>
                      {editingCompId && (
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Statut</label>
                          <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={compForm.status} onChange={(e) => setCompForm((f) => ({ ...f, status: e.target.value as "open" | "full" | "closed" }))}>
                            <option value="open">Ouvert</option>
                            <option value="full">Complet</option>
                            <option value="closed">Fermé</option>
                          </select>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Description</label>
                        <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" placeholder="Description du tournoi..." value={compForm.description} onChange={(e) => setCompForm((f) => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Règlement</label>
                        <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" placeholder="Matchs en 2 sets gagnants..." value={compForm.rules} onChange={(e) => setCompForm((f) => ({ ...f, rules: e.target.value }))} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Récompenses (séparées par |)</label>
                        <Input placeholder="1er: Trophée + 500 TND | 2ème: 200 TND | 3ème: 100 TND" value={compForm.prizes} onChange={(e) => setCompForm((f) => ({ ...f, prizes: e.target.value }))} />
                        <p className="text-[11px] text-muted-foreground mt-1">Exemple: 1er prix | 2ème prix | 3ème prix</p>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button className="flex-1" onClick={() => void saveComp()} disabled={compSaving}>
                        {compSaving ? "Enregistrement..." : editingCompId ? "Mettre à jour" : "Créer la compétition"}
                      </Button>
                      <Button variant="outline" onClick={() => setShowCompForm(false)}>Annuler</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Registrations drawer */}
              {viewingRegistrations !== null && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <div className="gradient-card rounded-2xl border border-border w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                    <div className="flex items-center justify-between p-5 border-b border-border">
                      <div>
                        <h3 className="font-bold">Inscrits — {competitions.find((c) => c.id === viewingRegistrations)?.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{registrations.length} joueur{registrations.length !== 1 ? "s" : ""}</p>
                      </div>
                      <button onClick={() => setViewingRegistrations(null)} className="text-muted-foreground hover:text-foreground text-xl">×</button>
                    </div>
                    <div className="overflow-y-auto flex-1 p-4 space-y-2">
                      {regsLoading ? (
                        [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)
                      ) : registrations.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground text-sm">Aucun joueur inscrit.</div>
                      ) : (
                        registrations.map((r, i) => (
                          <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-muted/20 transition-colors">
                            <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm">{r.firstName} {r.lastName}</div>
                              <div className="text-xs text-muted-foreground">{r.email} · {new Date(r.registeredAt).toLocaleDateString("fr-FR")}</div>
                            </div>
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md shrink-0">{r.rankingScore} pts</span>
                            <button
                              className="text-red-400 hover:text-red-300 text-xs font-bold shrink-0 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                              onClick={() => void removeRegistration(viewingRegistrations, r.userId)}
                            >
                              Retirer
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Competitions table */}
              {compLoading ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
              ) : competitions.length === 0 ? (
                <div className="gradient-card rounded-2xl border border-border p-12 text-center">
                  <Trophy size={40} className="text-muted-foreground mx-auto mb-4 opacity-30" />
                  <p className="font-semibold mb-1">Aucune compétition</p>
                  <p className="text-sm text-muted-foreground mb-4">Créez votre premier tournoi pour commencer.</p>
                  <Button size="sm" onClick={openCreateComp}><Plus size={14} className="mr-1" /> Créer une compétition</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {competitions.map((c) => {
                    const fill = Math.min(100, Math.round(((c.participants ?? 0) / c.max_participants) * 100));
                    const sConfig = { open: "bg-emerald-500/15 text-emerald-400", full: "bg-amber-500/15 text-amber-400", closed: "bg-red-500/15 text-red-400" };
                    return (
                      <div key={c.id} className="gradient-card rounded-2xl border border-border p-5">
                        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-base">{c.name}</h3>
                              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${sConfig[c.status]}`}>
                                {c.status === "open" ? "Ouvert" : c.status === "full" ? "Complet" : "Fermé"}
                              </span>
                              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{c.sport}</span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1.5">
                              <span>{new Date(c.start_date).toLocaleDateString("fr-FR")}</span>
                              <span>·</span>
                              <span>{c.location}</span>
                              <span>·</span>
                              <span>{c.participants ?? 0} / {c.max_participants} inscrits</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void loadRegistrations(c.id)}>
                              <Users size={13} className="mr-1" /> Inscrits
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEditComp(c)}>
                              Modifier
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs text-red-400 hover:text-red-300 border-red-500/30 hover:bg-red-500/10" onClick={() => void deleteComp(c.id)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${fill >= 100 ? "bg-amber-500" : fill >= 75 ? "bg-orange-500" : "bg-primary"}`} style={{ width: `${fill}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground font-mono w-8 text-right">{fill}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Revenue ── */}
          {activeSection === "revenue" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-display font-bold">Revenue & Billing</h2>
              {!revenue ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    <StatCard icon={CreditCard} label="Total Revenue" value={`${(revenue.summary?.total_revenue ?? 0).toFixed(3)} TND`} />
                    <StatCard icon={CheckCircle2} label="Paid" value={revenue.summary?.paid_count ?? 0} />
                    <StatCard icon={Clock} label="Pending" value={revenue.summary?.pending_count ?? 0} />
                    <StatCard icon={RefreshCw} label="Refunded" value={revenue.summary?.refunded_count ?? 0} />
                  </div>
                  {revenue.monthly.length > 0 && (
                    <div className="gradient-card rounded-2xl border border-border/50 p-5">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Monthly Revenue (TND)</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={revenue.monthly}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                          <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {!revenue.monthly.length && (
                    <div className="gradient-card rounded-2xl border border-border/50 p-12 text-center">
                      <CreditCard size={32} className="text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No payment history yet.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Activity Logs ── */}
          {activeSection === "logs" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-display font-bold">Activity Logs</h2>
              <div className="space-y-2">
                {(overview?.logs ?? []).map((log) => (
                  <div key={log.id} className="gradient-card rounded-xl border border-border/30 p-4 flex items-start gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{log.action}</span>
                        {log.arena_name && <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{log.arena_name}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{log.detail}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{log.actor_name} · {new Date(log.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {!(overview?.logs ?? []).length && (
                  <div className="py-16 text-center">
                    <Activity size={32} className="text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No activity logs yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── System Status ── */}
          {/* ── Arenas & Calibration (super-admin) ── */}
          {activeSection === "calibration" && (
            <SuperAdminCalibrationContent onBack={() => setActiveSection("overview")} />
          )}

          {/* ── System Status ── */}
          {activeSection === "system" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-display font-bold">System Status</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* API Status */}
                <div className="gradient-card rounded-2xl border border-green-500/30 p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="font-bold text-sm">API Server</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Express.js — Operational</p>
                </div>

                {/* Database */}
                <div className="gradient-card rounded-2xl border border-green-500/30 p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="font-bold text-sm">Database</span>
                  </div>
                  <p className="text-xs text-muted-foreground">PostgreSQL — Connected</p>
                </div>

                {/* WebSocket */}
                <div className="gradient-card rounded-2xl border border-green-500/30 p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Wifi size={14} className="text-green-400" />
                    <span className="font-bold text-sm">WebSocket (Socket.IO)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Live scoring & updates active</p>
                </div>

                {/* Redis Placeholder */}
                <div className="gradient-card rounded-2xl border border-amber-500/30 p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="font-bold text-sm">Redis Cache</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Optional — configure REDIS_URL to enable</p>
                </div>

                {/* SmartPlay AI */}
                <div className={`gradient-card rounded-2xl border p-5 sm:col-span-2 ${aiStatus?.connected ? "border-green-500/30" : "border-orange-500/30"}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {aiStatus?.connected
                      ? <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                      : <AlertCircle size={14} className="text-orange-400" />}
                    <Brain size={14} className="text-primary" />
                    <span className="font-bold text-sm">SmartPlay AI Microservice</span>
                    {aiStatus?.version && <span className="text-[10px] text-muted-foreground">v{aiStatus.version}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {aiStatus?.message ?? "Checking status…"}
                  </p>
                  {!aiStatus?.connected && (
                    <div className="mt-3 p-3 rounded-xl bg-orange-500/5 border border-orange-500/20">
                      <p className="text-xs text-orange-300">
                        The AI microservice is pending deployment. The platform continues to function normally without it.
                        Set <code className="font-mono">SMARTPLAY_AI_URL</code> to connect when ready.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </Layout>
  );
};

export default Admin;
