import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/i18n/locale";
import { toast } from "sonner";
import { Inbox, CheckCircle, XCircle, RefreshCw, Users } from "lucide-react";

type CoachingRequest = {
  id: number;
  playerUserId: number;
  playerName: string;
  requestedDate: string;
  requestedStartTime: string;
  requestedEndTime: string;
  playersCount: number;
  message: string | null;
  status: string;
  createdAt: string;
};

const statusColor: Record<string, string> = {
  pending: "border-amber-300/30 bg-amber-300/12 text-amber-200",
  accepted: "border-emerald-300/30 bg-emerald-300/12 text-emerald-200",
  rejected: "border-red-300/30 bg-red-300/12 text-red-200",
  counter_proposed: "border-sky-300/30 bg-sky-300/12 text-sky-200",
};

const RequestCard = ({
  req,
  onRespond,
}: {
  req: CoachingRequest;
  onRespond: (id: number, action: string, data?: object) => void;
}) => {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [counterDate, setCounterDate] = useState(req.requestedDate);
  const [counterStart, setCounterStart] = useState(req.requestedStartTime);
  const [counterEnd, setCounterEnd] = useState(req.requestedEndTime);
  const [mode, setMode] = useState<"accept" | "reject" | "counter" | null>(null);
  const isPending = req.status === "pending";

  const submit = () => {
    if (!mode) return;
    const action = mode === "counter" ? "counter_propose" : mode;
    const data: Record<string, unknown> = { coachReplyMessage: replyMessage || undefined };
    if (mode === "counter") {
      data.counterProposedDate = counterDate;
      data.counterProposedStartTime = counterStart;
      data.counterProposedEndTime = counterEnd;
    }
    onRespond(req.id, action, data);
    setOpen(false);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-background/45 p-5 shadow-[0_18px_45px_hsl(var(--background)/0.32)] backdrop-blur-md space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-foreground">
            {t("coachRequests.from")} <span className="text-primary">{req.playerName}</span>
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {req.requestedDate} · {req.requestedStartTime}–{req.requestedEndTime}
          </p>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <Users className="w-3.5 h-3.5" /> {req.playersCount} {t("coachRequests.players")}
          </p>
        </div>
        <Badge className={`${statusColor[req.status] ?? "border-border bg-background/50 text-muted-foreground"} shrink-0`}>
          {t(`coachRequests.status.${req.status}`) || req.status}
        </Badge>
      </div>

      {req.message && (
        <p className="text-sm text-muted-foreground italic rounded-xl border border-border/40 bg-background/35 px-3 py-2">
          "{req.message}"
        </p>
      )}

      {isPending && (
        <>
          {!open ? (
            <div className="flex gap-2 pt-1 flex-wrap">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white rounded-xl"
                onClick={() => { setMode("accept"); setOpen(true); }}
              >
                <CheckCircle className="w-4 h-4 mr-1" /> {t("coachRequests.accept")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl border-sky-300/35 bg-background/35 text-sky-200 hover:bg-sky-300/10"
                onClick={() => { setMode("counter"); setOpen(true); }}
              >
                <RefreshCw className="w-4 h-4 mr-1" /> {t("coachRequests.counter")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl border-red-300/35 bg-background/35 text-red-200 hover:bg-red-300/10"
                onClick={() => { setMode("reject"); setOpen(true); }}
              >
                <XCircle className="w-4 h-4 mr-1" /> {t("coachRequests.reject")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 border-t border-border/40 pt-3">
              {mode === "counter" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="date"
                    value={counterDate}
                    onChange={(e) => setCounterDate(e.target.value)}
                    className="border border-primary/25 rounded-xl px-3 py-2 text-sm bg-background/50 text-foreground"
                  />
                  <input
                    type="time"
                    value={counterStart}
                    onChange={(e) => setCounterStart(e.target.value)}
                    className="border border-primary/25 rounded-xl px-3 py-2 text-sm bg-background/50 text-foreground"
                  />
                  <input
                    type="time"
                    value={counterEnd}
                    onChange={(e) => setCounterEnd(e.target.value)}
                    className="border border-primary/25 rounded-xl px-3 py-2 text-sm bg-background/50 text-foreground"
                  />
                </div>
              )}
              <Textarea
                placeholder={t("coachRequests.replyMessage")}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                rows={2}
                className="rounded-xl border-primary/25 bg-background/50 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className={`rounded-xl text-white ${
                    mode === "reject"
                      ? "bg-red-500 hover:bg-red-600"
                      : mode === "counter"
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                  onClick={submit}
                >
                  {mode === "accept"
                    ? t("coachRequests.accept")
                    : mode === "reject"
                    ? t("coachRequests.reject")
                    : t("coachRequests.counter")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const CoachRequests = () => {
  const { t } = useLocale();
  const [requests, setRequests] = useState<CoachingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api<{ requests: CoachingRequest[] }>("/api/coach/requests", { authenticated: true })
      .then((data) => setRequests(data.requests ?? []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRespond = async (id: number, action: string, data: object = {}) => {
    try {
      await api(`/api/coach/requests/${id}/respond`, {
        method: "PATCH",
        authenticated: true,
        body: JSON.stringify({ action, ...data }),
      });
      toast.success("Response sent");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl border border-primary/25 bg-primary/10 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("coachRequests.title")}</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Inbox className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>{t("coachRequests.empty")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <RequestCard key={req.id} req={req} onRespond={handleRespond} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CoachRequests;
