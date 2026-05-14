import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Loader2,
  MapPin,
  ShieldCheck,
  Smartphone,
  Ticket,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import QRCode from "qrcode";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useLocale } from "@/i18n/locale";

type ReservationParticipant = {
  id: number;
  userId?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email: string;
  status?: "confirmed" | "invited" | "pending_account" | "cancelled";
  role?: "creator" | "participant";
};

type ReservationDetails = {
  id: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status: "confirmed" | "cancelled";
  court_name: string;
  arena_name: string;
  arena_location?: string | null;
  sport: string;
  payment_status?: string | null;
  refund_status?: string | null;
  refunded_amount?: number | null;
  cancellation_reason?: string | null;
  participants: ReservationParticipant[];
};

const participantName = (participant: ReservationParticipant) =>
  participant.displayName || [participant.firstName, participant.lastName].filter(Boolean).join(" ") || participant.email;

const formatStatus = (value?: string | null) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";

const timeToMinutes = (time?: string) => {
  const [hours, minutes] = String(time ?? "").slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

export default function ReservationDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [reservation, setReservation] = useState<ReservationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const dateLocale = locale === "fr" ? fr : enUS;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<{ reservation: ReservationDetails }>(`/api/reservations/${id}/details`, { authenticated: true })
      .then((data) => setReservation(data.reservation))
      .catch((err) => setError(err instanceof Error ? err.message : t("reservationDetails.loadFail")))
      .finally(() => setLoading(false));
  }, [id, t]);

  useEffect(() => {
    if (!reservation?.id || reservation.payment_status !== "paid") {
      setTicketUrl("");
      return;
    }
    setTicketLoading(true);
    setTicketError("");
    api<{ url: string }>(`/api/reservations/${reservation.id}/ticket-link`, { authenticated: true })
      .then((data) => setTicketUrl(data.url))
      .catch((err) => setTicketError(err instanceof Error ? err.message : t("reservationDetails.ticketUnavailable")))
      .finally(() => setTicketLoading(false));
  }, [reservation?.id, reservation?.payment_status, t]);

  useEffect(() => {
    if (!ticketUrl || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, ticketUrl, {
      width: 184,
      margin: 2,
      color: { dark: "#f5c842", light: "#0a0a0f" },
    }).catch(() => setTicketError(t("reservationDetails.qrFail")));
  }, [ticketUrl, t]);

  const formattedDate = useMemo(() => {
    if (!reservation?.reservation_date) return "--";
    const parsed = parseISO(reservation.reservation_date);
    if (Number.isNaN(parsed.getTime())) return reservation.reservation_date;
    return format(parsed, locale === "fr" ? "EEEE d MMMM yyyy" : "EEEE, MMMM d, yyyy", { locale: dateLocale });
  }, [reservation?.reservation_date, locale, dateLocale]);

  const participantStatus = (status?: string) => {
    if (status === "pending_account") return t("res.participantStatus.pendingAccount");
    if (status === "invited") return t("res.participantStatus.invited");
    if (status === "cancelled") return t("status.cancelled");
    return t("status.confirmed");
  };

  const startMinutes = timeToMinutes(reservation?.start_time);
  const endMinutes = timeToMinutes(reservation?.end_time);
  const durationMinutes = startMinutes !== null && endMinutes !== null ? Math.max(0, endMinutes - startMinutes) : null;
  const isConfirmed = reservation?.status === "confirmed";
  const isPaid = reservation?.payment_status === "paid";

  return (
    <Layout>
      <div className="container py-10">
        <Button variant="ghost" className="gap-2 mb-6" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> {t("reservationDetails.back")}
        </Button>

        {loading ? (
          <div className="grid lg:grid-cols-[1.4fr,0.8fr] gap-6">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        ) : error ? (
          <div className="gradient-card rounded-2xl border border-border p-10 text-center">
            <p className="text-destructive font-medium">{error}</p>
            <Button asChild className="mt-5"><Link to="/player/reservations">{t("reservationDetails.back")}</Link></Button>
          </div>
        ) : reservation && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/5">
              <div className="border-b border-border/60 bg-muted/35 px-5 py-4 sm:px-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${isConfirmed ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive"}`}>
                      {isConfirmed ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">#{reservation.id}</p>
                      <h1 className="truncate font-display text-2xl font-bold sm:text-3xl">{reservation.court_name}</h1>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isConfirmed ? "secondary" : "destructive"} className="px-3 py-1">
                      {isConfirmed ? t("status.confirmed") : t("status.cancelled")}
                    </Badge>
                    <Badge variant="outline" className={isPaid ? "border-green-500/35 bg-green-500/10 px-3 py-1 text-green-300" : "border-amber-500/35 bg-amber-500/10 px-3 py-1 text-amber-300"}>
                      {isPaid ? t("status.paid") : formatStatus(reservation.payment_status) || t("status.pending")}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.35fr,0.85fr]">
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-background/55 p-4">
                      <Calendar className="mb-3 text-primary" size={18} />
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("res.review.date")}</p>
                      <p className="mt-1 text-sm font-semibold leading-snug">{formattedDate}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/55 p-4">
                      <Clock className="mb-3 text-primary" size={18} />
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("res.review.time")}</p>
                      <p className="mt-1 text-sm font-semibold">{reservation.start_time?.slice(0, 5)} - {reservation.end_time?.slice(0, 5)}</p>
                      {durationMinutes !== null && <p className="mt-1 text-xs text-muted-foreground">{durationMinutes} min</p>}
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/55 p-4">
                      <Users className="mb-3 text-primary" size={18} />
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("res.review.participants")}</p>
                      <p className="mt-1 text-sm font-semibold">{reservation.participants?.length ?? 0}</p>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">{reservation.sport}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-background/55 p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <MapPin size={18} className="text-primary" />
                        <h2 className="font-display text-lg font-bold">{t("res.review.arena")}</h2>
                      </div>
                      <p className="text-base font-semibold">{reservation.arena_name}</p>
                      {reservation.arena_location && <p className="mt-2 text-sm text-muted-foreground">{reservation.arena_location}</p>}
                    </div>

                    <div className="rounded-xl border border-border/60 bg-background/55 p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <ShieldCheck size={18} className="text-primary" />
                        <h2 className="font-display text-lg font-bold">{t("reservationDetails.paymentStatus")}</h2>
                      </div>
                      <p className="text-base font-semibold">{formatStatus(reservation.payment_status) || t("status.pending")}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("reservationDetails.refundStatus")}: {formatStatus(reservation.refund_status) || t("billing.notApplicable")}
                      </p>
                    </div>
                  </div>

                  {reservation.cancellation_reason && (
                    <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm">
                      <span className="font-semibold">{t("playerReservations.reason")}:</span> {reservation.cancellation_reason}
                    </div>
                  )}
                </div>

                <aside className="rounded-2xl border border-primary/20 bg-background/65 p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Ticket size={19} className="text-primary" />
                      <h2 className="font-display text-xl font-bold">{t("reservationDetails.mobileTicket")}</h2>
                    </div>
                    <Smartphone size={18} className="text-muted-foreground" />
                  </div>

                  {isPaid ? (
                    ticketLoading ? (
                      <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed border-border">
                        <Loader2 className="animate-spin text-muted-foreground" size={24} />
                      </div>
                    ) : ticketUrl ? (
                      <div className="flex flex-col items-center gap-4 text-center">
                        <div className="rounded-2xl border border-primary/30 bg-[#0a0a0f] p-3 shadow-lg shadow-primary/10">
                          <canvas ref={qrCanvasRef} />
                        </div>
                        <p className="max-w-xs text-sm text-muted-foreground">{t("reservationDetails.scanQr")}</p>
                        <Button asChild className="w-full gap-2 glow-yellow">
                          <a href={ticketUrl} target="_blank" rel="noreferrer">
                            <Download size={16} /> {t("reservationDetails.openPdf")}
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                        {ticketError || t("reservationDetails.ticketUnavailable")}
                      </p>
                    )
                  ) : (
                    <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
                      {t("reservationDetails.qrAfterPayment")}
                    </p>
                  )}
                </aside>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1fr,0.35fr]">
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5 sm:p-6">
                <div className="mb-5 flex items-center gap-2">
                  <Users size={19} className="text-primary" />
                  <h2 className="font-display text-xl font-bold">{t("res.review.participants")}</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {reservation.participants?.map((participant, index) => (
                    <div key={`${participant.id}-${participant.email}`} className="rounded-xl border border-border/60 bg-background/55 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                          <UserRound size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold">
                              {participant.role === "creator" ? t("res.players.creator") : `${t("res.players.participant")} ${index + 1}`}
                            </p>
                            <Badge variant="outline" className="text-[10px]">{participantStatus(participant.status)}</Badge>
                          </div>
                          <p className="truncate text-sm">{participantName(participant)}</p>
                          <p className="truncate text-xs text-muted-foreground">{participant.email}</p>
                          {participant.status === "pending_account" && (
                            <p className="mt-3 text-xs text-muted-foreground">{t("res.players.guestNote")}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5 sm:p-6">
                <CreditCard size={20} className="mb-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("reservationDetails.paymentStatus")}</p>
                <p className="mt-1 text-2xl font-bold">{isPaid ? t("status.paid") : formatStatus(reservation.payment_status) || t("status.pending")}</p>
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link to="/player/reservations">{t("reservationDetails.backToReservations")}</Link>
                </Button>
              </div>
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}
