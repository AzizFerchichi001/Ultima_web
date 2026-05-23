import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, Search, RefreshCw, Users, CalendarDays,
} from "lucide-react";
import { useLocale } from "@/i18n/locale";

type Reservation = {
  id: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status: "confirmed" | "cancelled" | "completed";
  payment_status: string;
  booking_type: string;
  court_name: string;
  arena_name: string;
  owner_name: string;
  owner_email: string;
  coach_name: string | null;
  special_code: string;
};

type TabId = "all" | "upcoming" | "completed" | "cancelled" | "coach";

const STATUS_CLS: Record<string, string> = {
  confirmed: "bg-green-500/10 text-green-400 border-green-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled:  "bg-red-500/10 text-red-400 border-red-500/30",
};
const PAY_CLS: Record<string, string> = {
  paid:     "bg-green-500/10 text-green-400 border-green-500/30",
  pending:  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  failed:   "bg-red-500/10 text-red-400 border-red-500/30",
  refunded: "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

export default function ReservationsPanel() {
  const { t } = useLocale();
  const today = new Date().toISOString().slice(0, 10);

  const TABS: { id: TabId; label: string }[] = [
    { id: "all",       label: t("admin.res.tabAll") },
    { id: "upcoming",  label: t("admin.res.tabUpcoming") },
    { id: "completed", label: t("admin.res.tabCompleted") },
    { id: "cancelled", label: t("admin.res.tabCancelled") },
    { id: "coach",     label: t("admin.res.tabCoach") },
  ];
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading]           = useState(true);
  const [tab, setTab]                   = useState<TabId>("all");
  const [search, setSearch]             = useState("");
  const [dateFilter, setDateFilter]     = useState("");
  const [updatingId, setUpdatingId]     = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ reservations: Reservation[] }>(
        "/api/admin/reservations/v2", { authenticated: true }
      );
      setReservations(data.reservations ?? []);
    } catch {
      // fall back to v1 without booking_type
      try {
        const v1 = await api<{ reservations: Reservation[] }>(
          "/api/admin/reservations", { authenticated: true }
        );
        setReservations((v1.reservations ?? []).map(r => ({
          ...r, booking_type: "court", coach_name: null,
        })));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("admin.res.loadFail"));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      await api(`/api/admin/reservations/${id}/status`, {
        method: "PATCH", authenticated: true, body: { status },
      });
      toast.success(status === "completed" ? t("admin.res.statusDone") : t("admin.res.statusCancel"));
      setReservations(prev => prev.map(r =>
        r.id === id ? { ...r, status: status as Reservation["status"] } : r
      ));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.res.updateFail"));
    } finally {
      setUpdatingId(null);
    }
  }

  const stats = useMemo(() => ({
    total:    reservations.length,
    today:    reservations.filter(r => r.reservation_date === today).length,
    upcoming: reservations.filter(r => r.reservation_date >= today && r.status === "confirmed").length,
    cancelled:reservations.filter(r => r.status === "cancelled").length,
    coach:    reservations.filter(r => r.booking_type === "coaching_session").length,
  }), [reservations, today]);

  const filtered = useMemo(() => {
    let list = reservations;
    if (tab === "upcoming")  list = list.filter(r => r.reservation_date >= today && r.status === "confirmed");
    else if (tab === "completed") list = list.filter(r => r.status === "completed");
    else if (tab === "cancelled") list = list.filter(r => r.status === "cancelled");
    else if (tab === "coach")     list = list.filter(r => r.booking_type === "coaching_session");
    if (dateFilter) list = list.filter(r => r.reservation_date === dateFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.owner_name?.toLowerCase().includes(q) ||
        r.owner_email?.toLowerCase().includes(q) ||
        r.court_name?.toLowerCase().includes(q) ||
        (r.coach_name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [reservations, tab, dateFilter, search, today]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-bold">{t("admin.res.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("admin.res.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {t("admin.refresh")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: t("admin.res.statTotal"),    value: stats.total,     color: "text-foreground" },
          { label: t("admin.res.statToday"),    value: stats.today,     color: "text-blue-400"   },
          { label: t("admin.res.statUpcoming"), value: stats.upcoming,  color: "text-green-400"  },
          { label: t("admin.res.statCancelled"),value: stats.cancelled, color: "text-red-400"    },
          { label: t("admin.res.statCoach"),    value: stats.coach,     color: "text-primary"    },
        ].map(s => (
          <div key={s.label} className="gradient-card rounded-xl border border-border/50 px-4 py-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border/50 bg-muted/20 p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === t.id ? "bg-primary text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
            {t.id === "coach" && stats.coach > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/20 text-primary px-1.5 py-px text-[9px]">{stats.coach}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-52">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder={t("admin.res.searchPh")} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-muted-foreground flex-shrink-0" />
          <Input type="date" className="h-9 w-44" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
          {dateFilter && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => setDateFilter("")}>{t("admin.res.clear")}</Button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[0,1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-2xl text-muted-foreground text-sm">
          {t("admin.res.empty")}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {[t("admin.res.colPlayer"), t("admin.res.colCourt"), t("admin.res.colDateTime"), t("admin.res.colType"), t("admin.res.colStatus"), t("admin.res.colPayment"), t("admin.res.colActions")].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{r.owner_name}</p>
                      <p className="text-xs text-muted-foreground">{r.owner_email}</p>
                      {r.coach_name && (
                        <p className="text-[11px] text-primary flex items-center gap-1 mt-0.5">
                          <Users size={9}/> {t("admin.res.coachLabel")} {r.coach_name}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.court_name}</p>
                      <p className="text-xs text-muted-foreground">{r.arena_name}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <p className="font-medium">{r.reservation_date}</p>
                      <p className="text-xs text-muted-foreground">{r.start_time} – {r.end_time}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${r.booking_type === "coaching_session" ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/50 text-muted-foreground border-border"}`}>
                        {r.booking_type === "coaching_session" ? t("admin.res.typeCoach") : t("admin.res.typeCourt")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${STATUS_CLS[r.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${PAY_CLS[r.payment_status] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {r.payment_status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "confirmed" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" disabled={updatingId === r.id}
                            onClick={() => updateStatus(r.id, "completed")}
                            className="h-7 px-2 text-[11px] text-green-400 hover:bg-green-500/10">
                            <CheckCircle2 size={11}/> {t("admin.res.done")}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={updatingId === r.id}
                            onClick={() => updateStatus(r.id, "cancelled")}
                            className="h-7 px-2 text-[11px] text-red-400 hover:bg-red-500/10">
                            <XCircle size={11}/> {t("admin.res.cancelAction")}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border/30 bg-muted/10 text-xs text-muted-foreground">
            {t("admin.res.count").replace("{n}", String(filtered.length)).replace("{total}", String(reservations.length))}
          </div>
        </div>
      )}
    </div>
  );
}
