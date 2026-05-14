import { useEffect, useRef, useState } from "react";
import { format, parseISO, isAfter, addHours } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Activity, Calendar, Clock, Download, Loader2, MapPin, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getSessionUser, getToken } from "@/lib/session";
import { useLocale } from "@/i18n/locale";

type RefundStatus = "not_applicable" | "pending" | "succeeded" | "failed" | "already_refunded";

type ReservationParticipant = {
  id: number;
  userId?: number | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  status?: "confirmed" | "invited" | "pending_account" | "cancelled";
  role?: "creator" | "participant";
};

type UserReservation = {
  id: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status: "confirmed" | "cancelled";
  court_name: string;
  arena_name: string;
  sport: string;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  refund_status?: RefundStatus | null;
  refunded_amount?: number | null;
  participants?: ReservationParticipant[];
};

type CancelResponse = {
  success: boolean;
  reservation: { id: number; status: string; cancelled_at: string; cancellation_reason: string | null };
  refund: { status: RefundStatus; stripeRefundId: string | null; amount: number | null };
  notifications: { coachNotified: boolean };
  message?: string;
};

function parseDateTimeSafe(datePart?: string, timePart?: string) {
  if (!datePart) return null;
  const parsed = parseISO(timePart ? `${datePart}T${timePart}` : datePart);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function participantName(participant: ReservationParticipant) {
  return participant.displayName || [participant.firstName, participant.lastName].filter(Boolean).join(" ") || participant.email;
}

type ModalProps = {
  reservationId: number;
  courtName: string;
  date: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  loading: boolean;
};

function CancelModal({ reservationId, courtName, date, onConfirm, onClose, loading }: ModalProps) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="gradient-card rounded-2xl border border-border w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-xl font-bold mb-1">{t("playerReservations.cancelTitle")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          <span className="font-semibold text-foreground">{courtName}</span> - {date}
        </p>
        <p className="text-sm text-muted-foreground mb-4">{t("playerReservations.cancelText").replace("{id}", String(reservationId))}</p>

        <label className="block text-sm font-medium mb-1">{t("playerReservations.cancelReason")}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("playerReservations.cancelPlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none h-20 mb-5 focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={loading}
        />

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>{t("common.back")}</Button>
          <Button variant="destructive" className="flex-1" onClick={() => onConfirm(reason.trim())} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <XCircle size={16} className="mr-2" />}
            {loading ? t("playerReservations.cancelling") : t("playerReservations.confirmCancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

const UserReservations = () => {
  const { t, locale } = useLocale();
  const dateLocale = locale === "fr" ? fr : enUS;
  const [reservations, setReservations] = useState<UserReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ id: number; courtName: string; date: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const user = getSessionUser();

  const formatReservationDate = (rawDate?: string) => {
    const parsed = parseDateTimeSafe(rawDate);
    if (!parsed) return "--";
    return format(parsed, locale === "fr" ? "EEEE d MMMM yyyy" : "EEEE, MMMM d, yyyy", { locale: dateLocale });
  };

  const statusLabel = (status?: string) => {
    if (status === "pending_account") return t("res.participantStatus.pendingAccount");
    if (status === "invited") return t("res.participantStatus.invited");
    if (status === "cancelled") return t("status.cancelled");
    return t("status.confirmed");
  };

  const loadReservations = async () => {
    if (!user) return;
    try {
      const data = await api<{ reservations: UserReservation[] }>("/api/reservations", { authenticated: true });
      setReservations(data.reservations || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("playerReservations.loadFail"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadReservations(); }, []);

  const handleConfirmCancel = async (reason: string) => {
    if (!modal) return;
    setCancelling(true);
    try {
      const data = await api<CancelResponse>(`/api/reservations/${modal.id}/cancel`, {
        method: "PATCH",
        authenticated: true,
        body: { reason: reason || null },
      });
      setReservations((prev) => prev.map((r) => r.id === modal.id ? {
        ...r,
        status: "cancelled",
        cancelled_at: data.reservation?.cancelled_at ?? null,
        cancellation_reason: data.reservation?.cancellation_reason ?? null,
        refund_status: data.refund?.status ?? null,
        refunded_amount: data.refund?.amount ?? null,
      } : r));
      toast.success(data.message || t("playerReservations.cancelled"));
      setModal(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("playerReservations.cancelFail"));
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadTicket = async (id: number) => {
    try {
      const token = getToken();
      if (!token) throw new Error(t("playerReservations.loginForTicket"));
      const response = await fetch(`/api/reservations/${id}/ticket.pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? t("playerReservations.ticketFail"));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ultima-reservation-${id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("playerReservations.ticketFail"));
    }
  };

  if (!user) return null;
  if (loading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="gradient-card rounded-2xl border border-border p-6 space-y-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {modal && (
        <CancelModal
          reservationId={modal.id}
          courtName={modal.courtName}
          date={modal.date}
          onConfirm={handleConfirmCancel}
          onClose={() => !cancelling && setModal(null)}
          loading={cancelling}
        />
      )}

      <section className="py-12 animate-fade-in">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold">{t("playerReservations.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("playerReservations.subtitle")}</p>
          </div>
          <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 shrink-0">
            <Activity size={14} /> {reservations.length}
          </div>
        </div>

        {reservations.length === 0 ? (
          <div className="gradient-card rounded-2xl border border-border p-12 text-center">
            <Calendar className="mx-auto text-muted-foreground mb-4 opacity-20" size={48} />
            <p className="text-muted-foreground">{t("playerReservations.empty")}</p>
            <Button asChild className="mt-5 glow-yellow"><Link to="/player/reservations/new">{t("playerDashboard.bookCourt")}</Link></Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reservations.map((res) => {
              const resStart = parseDateTimeSafe(res.reservation_date, res.start_time);
              const canCancel = Boolean(resStart) && isAfter(resStart!, addHours(new Date(), 24)) && res.status !== "cancelled";
              const participants = res.participants ?? [];

              return (
                <div key={res.id} className={`gradient-card rounded-2xl border border-border p-6 transition-all duration-300 hover:border-primary/30 ${res.status === "cancelled" ? "opacity-70" : ""}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="bg-primary/10 p-3 rounded-xl text-primary"><Calendar size={20} /></div>
                    <Badge variant={res.status === "confirmed" ? "secondary" : "destructive"}>{res.status === "confirmed" ? t("status.confirmed") : t("status.cancelled")}</Badge>
                  </div>

                  <h3 className="text-xl font-bold mb-1">{res.court_name}</h3>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-muted-foreground gap-2"><MapPin size={14} className="text-primary" /> {res.arena_name}</div>
                    <div className="flex items-center text-sm text-foreground/80 gap-2"><Calendar size={14} className="text-primary" />{formatReservationDate(res.reservation_date)}</div>
                    <div className="flex items-center text-sm text-foreground/80 gap-2"><Clock size={14} className="text-primary" />{res.start_time?.slice(0, 5) || "--:--"} - {res.end_time?.slice(0, 5) || "--:--"}</div>
                    {participants.length > 0 && (
                      <div className="rounded-xl border border-border/70 bg-background/35 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2"><Users size={13} />{t("res.review.participants")}</div>
                        <div className="space-y-1.5">
                          {participants.slice(0, 4).map((participant) => (
                            <div key={`${res.id}-${participant.id}-${participant.email}`} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate">{participant.role === "creator" ? t("res.players.creator") : participantName(participant)}</span>
                              <Badge variant="outline" className="text-[10px] shrink-0">{statusLabel(participant.status)}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {res.status === "cancelled" && res.cancellation_reason && (
                      <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-2">{t("playerReservations.reason")}: {res.cancellation_reason}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Button asChild variant="secondary" size="sm" className="w-full">
                      <Link to={`/player/reservations/${res.id}`}>{t("reservationDetails.title")}</Link>
                    </Button>
                    {res.status !== "cancelled" && (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => void handleDownloadTicket(res.id)}>
                        <Download size={16} className="mr-2" /> {t("playerReservations.downloadTicket")}
                      </Button>
                    )}
                    {canCancel ? (
                      <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/20 hover:bg-destructive hover:text-destructive-foreground" onClick={() => setModal({ id: res.id, courtName: res.court_name, date: formatReservationDate(res.reservation_date) })}>
                        <XCircle size={16} className="mr-2" /> {t("playerReservations.cancel")}
                      </Button>
                    ) : res.status !== "cancelled" && (
                      <div className="text-[10px] text-center text-muted-foreground italic border-t border-border/50 pt-3">{t("playerReservations.cancelWindow")}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
};

export default UserReservations;
