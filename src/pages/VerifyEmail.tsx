import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type VerifyState = "loading" | "success" | "error";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => String(searchParams.get("token") ?? ""), [searchParams]);
  const initialEmail = useMemo(() => String(searchParams.get("email") ?? "").trim().toLowerCase(), [searchParams]);
  const initialCode = useMemo(() => String(searchParams.get("code") ?? "").trim(), [searchParams]);
  const initialDevLink = useMemo(() => String(searchParams.get("devLink") ?? "").trim(), [searchParams]);
  const [state, setState] = useState<VerifyState>(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "Verifying your email…" : "Enter the 6-digit code sent to your email.");
  const [verifyEmail, setVerifyEmail] = useState(initialEmail);
  const [verifyCode, setVerifyCode] = useState(initialCode);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendEmail, setResendEmail] = useState(initialEmail);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      try {
        const result = await api<{ success: boolean; message?: string }>("/api/auth/verify-email?token=" + encodeURIComponent(token));
        setState("success");
        setMessage(result.message ?? "Email verified successfully.");
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Unable to verify email.");
      }
    };
    void run();
  }, [token]);

  const handleVerifyByCode = async () => {
    const normalizedEmail = verifyEmail.trim().toLowerCase();
    const normalizedCode = verifyCode.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage("Please enter a valid email.");
      return;
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      setMessage("Please enter a valid 6-digit code.");
      return;
    }
    setVerifyingCode(true);
    try {
      const result = await api<{ success: boolean; message?: string }>("/api/auth/verify-email-code", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          code: normalizedCode,
        }),
      });
      setState("success");
      setMessage(result.message ?? "Email verified successfully.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to verify email.");
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleResend = async () => {
    const normalized = resendEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setMessage("Please enter a valid email.");
      return;
    }
    setResending(true);
    try {
      const result = await api<{ message: string; verificationCode?: string; verificationLink?: string }>("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: normalized }),
      });
      if (result.verificationCode) {
        setVerifyCode(result.verificationCode);
      }
      setMessage(result.verificationLink ? `${result.message} (Dev link: ${result.verificationLink})` : result.message);
      setVerifyEmail(normalized);
      setState("error");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to resend verification.");
    } finally {
      setResending(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center py-12">
        <div className="w-full max-w-md gradient-card rounded-2xl border border-border p-8 animate-slide-up">
          <h1 className="text-2xl font-display font-bold mb-3">Email Verification</h1>
          <p className="text-sm text-muted-foreground">{message}</p>

          {!token && initialCode && (
            <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              Local dev fallback: SMTP was not configured, so the verification code is shown here.
              <div className="mt-2 font-mono text-lg tracking-[0.35em] text-amber-50">{initialCode}</div>
              {initialDevLink && (
                <a
                  href={initialDevLink}
                  className="mt-3 inline-block text-amber-200 underline underline-offset-4 break-all"
                >
                  Open verification link
                </a>
              )}
            </div>
          )}

          {state !== "success" && (
            <div className="mt-5 rounded-xl border border-border p-4 bg-muted/20 space-y-3">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="you@email.com"
                value={verifyEmail}
                onChange={(event) => setVerifyEmail(event.target.value)}
              />
              <Label>Verification Code</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={verifyCode}
                onChange={(event) => setVerifyCode(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              />
              <Button type="button" className="w-full" onClick={() => void handleVerifyByCode()} disabled={verifyingCode}>
                {verifyingCode ? "Verifying..." : "Verify Email"}
              </Button>
            </div>
          )}

          {state === "error" && (
            <div className="mt-5 rounded-xl border border-border p-4 bg-muted/20 space-y-3">
              <Label>Resend verification code</Label>
              <Input
                type="email"
                placeholder="you@email.com"
                value={resendEmail}
                onChange={(event) => setResendEmail(event.target.value)}
              />
              <Button type="button" className="w-full" onClick={() => void handleResend()} disabled={resending}>
                {resending ? "Sending..." : "Resend Email"}
              </Button>
            </div>
          )}

          <div className="mt-6">
            <Link to="/login" className="text-primary hover:underline">Go to login</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default VerifyEmail;
