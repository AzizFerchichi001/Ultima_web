import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Loader2, Calendar, ArrowLeft, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getToken } from "@/lib/session";
import QRCode from "qrcode";

type SessionStatus = "loading" | "paid" | "unpaid" | "error";

const PaymentSuccess = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id");
  const type = params.get("type"); // "reservation" | "coaching"
  const id = params.get("id");

  const [status, setStatus] = useState<SessionStatus>("loading");
  const [downloading, setDownloading] = useState(false);
  const [mobileQr, setMobileQr] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!sessionId) { setStatus("paid"); return; }

    api<{ status: string }>(`/api/payments/session/${sessionId}`, { authenticated: true })
      .then((data) => setStatus(data.status === "paid" ? "paid" : "unpaid"))
      .catch(() => setStatus("paid"));
  }, [sessionId]);

  // Fetch the public download URL and render QR code once paid
  useEffect(() => {
    if (status !== "paid" || type !== "reservation" || !id) return;

    api<{ url: string }>(`/api/reservations/${id}/ticket-link`, { authenticated: true })
      .then(async (data) => {
        setMobileQr(data.url);
        if (qrCanvasRef.current) {
          await QRCode.toCanvas(qrCanvasRef.current, data.url, {
            width: 200,
            margin: 2,
            color: { dark: "#f5c842", light: "#0a0a0f" },
          });
        }
      })
      .catch(() => { /* non-critical */ });
  }, [status, type, id]);

  // Re-render QR onto canvas once both the URL and canvas ref are ready
  useEffect(() => {
    if (!mobileQr || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, mobileQr, {
      width: 200,
      margin: 2,
      color: { dark: "#f5c842", light: "#0a0a0f" },
    }).catch(() => {});
  }, [mobileQr]);

  const downloadTicket = async () => {
    if (!id || type !== "reservation") return;
    setDownloading(true);
    try {
      const token = getToken();
      const response = await fetch(`/api/reservations/${id}/ticket.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const p = await response.json().catch(() => ({}));
        throw new Error(p.message ?? "Failed to download ticket.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ultima-reservation-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download ticket.");
    } finally {
      setDownloading(false);
    }
  };

  if (status === "loading") {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="animate-spin text-primary" size={40} />
          <p className="text-muted-foreground">Confirming your payment…</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        {/* Success icon */}
        <div
          className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-6"
          style={{ boxShadow: "0 0 40px hsl(142 71% 45% / 0.20)" }}
        >
          <CheckCircle className="text-green-400" size={40} />
        </div>

        <h1 className="text-3xl font-bold font-display text-foreground mb-2">Payment confirmed!</h1>
        <p className="text-muted-foreground mb-8">
          {type === "reservation"
            ? "Your court is booked. Download your ticket or scan the QR code with your phone."
            : "Your coaching session is confirmed. Your coach has been notified."}
        </p>

        <div className="gradient-card rounded-2xl border border-border p-6 space-y-5 text-left mb-8">
          {type === "reservation" && id && (
            <>
              <div className="flex items-center gap-3 text-sm text-muted-foreground border-b border-border pb-3">
                <Calendar size={16} className="text-primary shrink-0" />
                <span>Reservation #{id}</span>
              </div>

              {/* Download button */}
              <Button
                className="w-full glow-yellow h-11"
                onClick={downloadTicket}
                disabled={downloading}
              >
                {downloading
                  ? <><Loader2 className="animate-spin mr-2" size={16} />Generating…</>
                  : <><Download className="mr-2" size={16} />Download PDF + QR Code</>}
              </Button>

              {/* Mobile QR code section */}
              <div className="border-t border-border/50 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone size={15} className="text-primary shrink-0" />
                  <p className="text-sm font-medium text-foreground">Scan to download on your phone</p>
                </div>

                {mobileQr ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-xl overflow-hidden border border-primary/30 p-2 bg-[#0a0a0f] inline-block"
                      style={{ boxShadow: "0 0 20px hsl(var(--primary) / 0.15)" }}>
                      <canvas ref={qrCanvasRef} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Point your phone camera at the code — the PDF will download directly.
                    </p>
                    <a
                      href={mobileQr}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-primary underline underline-offset-4"
                    >
                      Open PDF
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px]">
                    <Loader2 className="animate-spin text-muted-foreground" size={24} />
                  </div>
                )}
              </div>
            </>
          )}

          {type === "coaching" && id && (
            <div className="text-sm text-muted-foreground space-y-4">
              <p>Your coach has been notified and the slot is blocked in their calendar.</p>
              <p className="text-xs">Your ticket is available in <strong className="text-foreground">My Coaching Requests</strong> — download the PDF or scan the QR code to get it on your phone.</p>
              <Button className="w-full glow-yellow" onClick={() => navigate("/coaching-requests")}>
                View ticket &amp; download
              </Button>
            </div>
          )}
        </div>

        <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => navigate("/")}>
          <ArrowLeft size={16} /> Back to home
        </Button>
      </div>
    </Layout>
  );
};

export default PaymentSuccess;
