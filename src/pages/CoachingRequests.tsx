import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/i18n/locale";
import {
  MessageSquare, Calendar, Clock, Users, CreditCard, Loader2,
  Download, Smartphone, CheckCircle, MapPin, GraduationCap,
  ChevronDown, Star,
} from "lucide-react";
import { toast } from "sonner";
import { getToken } from "@/lib/session";
import QRCode from "qrcode";

type RequestRow = {
  id: number;
  coachUserId: number;
  coachName: string;
  coachHeadline: string | null;
  coachHourlyRate: number | null;
  requestedDate: string;
  requestedStartTime: string;
  requestedEndTime: string;
  playersCount: number;
  status: string;
  paymentStatus: string;
  reservationId: number | null;
  coachReplyMessage: string | null;
  counterProposedDate: string | null;
  counterProposedStartTime: string | null;
  counterProposedEndTime: string | null;
  arenaName: string | null;
  arenaCity: string | null;
  courtName: string | null;
  courtType: string | null;
  surfaceType: string | null;
  createdAt: string;
};

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending:          { label: "coachRequests.status.pending",          cls: "border-amber-300/30 bg-amber-300/12 text-amber-200" },
  accepted:         { label: "coachRequests.status.accepted",         cls: "border-emerald-300/30 bg-emerald-300/12 text-emerald-200" },
  rejected:         { label: "coachRequests.status.rejected",         cls: "border-red-300/30 bg-red-300/12 text-red-200" },
  counter_proposed: { label: "coachRequests.status.counter_proposed", cls: "border-sky-300/30 bg-sky-300/12 text-sky-200" },
};

// ── Ticket section for paid sessions ─────────────────────────────────────────

const TicketSection = ({ reservationId }: { reservationId: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mobileUrl, setMobileUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api<{ url: string }>(`/api/reservations/${reservationId}/ticket-link`, { authenticated: true })
      .then((data) => setMobileUrl(data.url))
      .catch(() => {});
  }, [reservationId]);

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
      const res = await fetch(`/api/reservations/${reservationId}/ticket.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const p = await res.json().catch(() => ({})); throw new Error(p.message ?? "Failed"); }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `coaching-session-${reservationId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/40 bg-background/30 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
        <CheckCircle size={13} /> Your Ticket
      </div>
      <Button className="glow-yellow gap-2 h-9 text-sm w-full sm:w-auto" onClick={download} disabled={downloading}>
        {downloading
          ? <><Loader2 className="animate-spin" size={14} /> Generating…</>
          : <><Download size={14} /> Download PDF + QR Code</>}
      </Button>
      {mobileUrl ? (
        <div className="flex items-start gap-4 mt-1">
          <div className="rounded-xl overflow-hidden border border-primary/30 p-1.5 bg-[#0a0a0f] shrink-0"
            style={{ boxShadow: "0 0 16px hsl(var(--primary) / 0.15)" }}>
            <canvas ref={canvasRef} />
          </div>
          <div className="flex flex-col gap-1 justify-center pt-1">
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
  );
};

// ── Session card ──────────────────────────────────────────────────────────────

const SessionCard = ({
  req, expanded, onToggle, onPay, paying,
}: {
  req: RequestRow;
  expanded: boolean;
  onToggle: () => void;
  onPay: (id: number) => void;
  paying: boolean;
}) => {
  const { t } = useLocale();
  const sc = statusConfig[req.status] ?? { label: req.status, cls: "border-border bg-background/50 text-muted-foreground" };
  const isPaid = req.paymentStatus === "paid";

  return (
    <div className={`rounded-xl border transition-colors bg-background/45 backdrop-blur-md shadow-[0_18px_45px_hsl(var(--background)/0.32)] ${
      expanded ? "border-primary/35" : "border-primary/20 hover:border-primary/30"
    }`}>
      {/* Summary row — click to expand */}
      <button className="w-full flex items-center gap-3 p-5 text-left" onClick={onToggle}>
        <div className="p-2 rounded-xl bg-violet-500/10 flex-shrink-0">
          <GraduationCap size={16} className="text-violet-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">
            {t("coachingRequests.to")}: <span className="text-primary">{req.coachName}</span>
          </p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Calendar size={11} /> {req.requestedDate}</span>
            <span className="flex items-center gap-1"><Clock size={11} />{req.requestedStartTime}–{req.requestedEndTime}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <Badge className={`${sc.cls} text-[10px]`}>{t(sc.label)}</Badge>
          {isPaid && <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-[10px]">Paid</Badge>}
          <ChevronDown size={15} className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-border/40 space-y-4 pt-4">
          {/* Coach info banner */}
          <div className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/8 p-3">
            <div className="p-1.5 rounded-lg bg-violet-500/15 flex-shrink-0">
              <GraduationCap size={15} className="text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{req.coachName}</p>
              {req.coachHeadline && <p className="text-xs text-muted-foreground">{req.coachHeadline}</p>}
              {req.coachHourlyRate && (
                <p className="text-xs text-primary font-medium flex items-center gap-1 mt-0.5">
                  <Star size={10} /> {req.coachHourlyRate} TND / hr
                </p>
              )}
            </div>
          </div>

          {/* Detail grid */}
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar size={13} /> <span>{req.requestedDate}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={13} /> <span>{req.requestedStartTime} – {req.requestedEndTime}</span>
              </div>
              {req.arenaName && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={13} />
                  <span>{req.arenaName}{req.arenaCity ? `, ${req.arenaCity}` : ""}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users size={13} /> <span>{req.playersCount} player{req.playersCount > 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {req.courtName && (
                <p className="text-muted-foreground"><span className="text-foreground/70">Court:</span> {req.courtName}</p>
              )}
              {req.courtType && (
                <p className="text-muted-foreground capitalize"><span className="text-foreground/70">Type:</span> {req.courtType.replace("_", " ")}</p>
              )}
              {req.surfaceType && (
                <p className="text-muted-foreground capitalize"><span className="text-foreground/70">Surface:</span> {req.surfaceType}</p>
              )}
            </div>
          </div>

          {/* Coach reply / counter-proposal */}
          {req.coachReplyMessage && (
            <p className="text-sm text-muted-foreground italic rounded-xl border border-border/40 bg-background/35 px-3 py-2">
              "{req.coachReplyMessage}"
            </p>
          )}
          {req.status === "counter_proposed" && req.counterProposedDate && (
            <div className="rounded-xl border border-sky-300/25 bg-sky-300/10 p-3 text-sm text-sky-100">
              Counter-proposal: {req.counterProposedDate} · {req.counterProposedStartTime}–{req.counterProposedEndTime}
            </div>
          )}

          {/* Pay button (accepted, not yet paid) */}
          {req.status === "accepted" && !isPaid && (
            <div className="pt-1 border-t border-border/40 space-y-2">
              <Button
                className="glow-yellow gap-2 h-9 text-sm"
                onClick={() => onPay(req.id)}
                disabled={paying}
              >
                {paying
                  ? <><Loader2 className="animate-spin" size={14} /> Redirecting…</>
                  : <><CreditCard size={14} /> Pay &amp; confirm session</>}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                You will be charged for the coach fee + court fee via Stripe.
              </p>
            </div>
          )}

          {/* Ticket section (paid) */}
          {isPaid && req.reservationId && (
            <TicketSection reservationId={req.reservationId} />
          )}
          {isPaid && !req.reservationId && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300">
              Session paid — ticket will be available once court assignment is confirmed.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const CoachingRequests = () => {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handlePay = async (requestId: number) => {
    setPayingId(requestId);
    try {
      const data = await api<{ url: string }>(`/api/payments/coaching-request/${requestId}/checkout`, {
        method: "POST", authenticated: true,
      });
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to start payment.");
      setPayingId(null);
    }
  };

  useEffect(() => {
    api<{ requests: RequestRow[] }>("/api/player/coaching-requests", { authenticated: true })
      .then((data) => {
        const rows = data.requests ?? [];
        setRequests(rows);
        // Auto-expand the most recent paid session if coming from a notification
        const firstPaid = rows.find((r) => r.paymentStatus === "paid");
        if (firstPaid) setExpandedId(firstPaid.id);
      })
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl border border-primary/25 bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("coachingRequests.title")}</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="mb-6">{t("coachingRequests.empty")}</p>
            <Button onClick={() => navigate("/coaches")} className="rounded-xl glow-yellow">
              {t("coachingRequests.findCoach")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <SessionCard
                key={req.id}
                req={req}
                expanded={expandedId === req.id}
                onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
                onPay={handlePay}
                paying={payingId === req.id}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CoachingRequests;
