import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

type Step = "email" | "code" | "done";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlToken = useMemo(() => String(searchParams.get("token") ?? ""), [searchParams]);

  // Token-link flow (from email link) — goes straight to password entry
  const [tokenPassword, setTokenPassword] = useState("");
  const [tokenConfirm, setTokenConfirm] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);

  // Code flow (from "Forgot password?" on login page or direct navigation)
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // — Token-link flow —
  const handleTokenReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!PASSWORD_REGEX.test(tokenPassword)) {
      toast.error("Password must be at least 8 chars with uppercase, lowercase and number.");
      return;
    }
    if (tokenPassword !== tokenConfirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setTokenLoading(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: urlToken, password: tokenPassword }),
      });
      toast.success("Password updated successfully.");
      navigate("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setTokenLoading(false);
    }
  };

  // — Code flow: step 1 send code —
  const handleSendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSendingCode(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      toast.success("If the account exists, a 6-digit code was sent to your email.");
      setStep("code");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send reset code.");
    } finally {
      setSendingCode(false);
    }
  };

  // — Code flow: step 2 verify code + new password —
  const handleResetWithCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("Enter a valid 6-digit code.");
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      toast.error("Password must be at least 8 chars with uppercase, lowercase and number.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setResetLoading(true);
    try {
      await api("/api/auth/reset-password-code", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim(), password }),
      });
      toast.success("Password updated successfully.");
      setStep("done");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setResetLoading(false);
    }
  };

  // — Token-link flow UI —
  if (urlToken) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex items-center justify-center py-12">
          <div className="w-full max-w-md gradient-card rounded-2xl border border-border p-8 animate-slide-up">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mb-4">
                <LockKeyhole size={24} className="text-primary" />
              </div>
              <h1 className="text-2xl font-display font-bold mb-2">Set New Password</h1>
              <p className="text-sm text-muted-foreground">Create a strong password for your account.</p>
            </div>
            <form onSubmit={handleTokenReset} className="space-y-4">
              <div>
                <Label>New Password</Label>
                <Input type="password" value={tokenPassword} onChange={(e) => setTokenPassword(e.target.value)} placeholder="••••••••" required className="mt-1.5" />
                <p className="text-[11px] text-muted-foreground mt-1">8+ chars, uppercase, lowercase, and a number.</p>
              </div>
              <div>
                <Label>Confirm Password</Label>
                <Input type="password" value={tokenConfirm} onChange={(e) => setTokenConfirm(e.target.value)} placeholder="••••••••" required className="mt-1.5" />
              </div>
              <Button type="submit" className="w-full glow-yellow" disabled={tokenLoading}>
                <LockKeyhole size={16} className="mr-2" />
                {tokenLoading ? "Updating…" : "Update Password"}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground text-center mt-6">
              Back to <Link to="/login" className="text-primary hover:underline">login</Link>
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  // — Code flow UI —
  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center py-12">
        <div className="w-full max-w-md gradient-card rounded-2xl border border-border p-8 animate-slide-up">

          {step === "done" ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 mb-2">
                <ShieldCheck size={28} className="text-green-400" />
              </div>
              <h1 className="text-2xl font-display font-bold">Password Updated</h1>
              <p className="text-sm text-muted-foreground">Your password has been reset successfully. You can now log in with your new password.</p>
              <Button className="w-full glow-yellow mt-4" onClick={() => navigate("/login")}>Go to Login</Button>
            </div>
          ) : step === "email" ? (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mb-4">
                  <Mail size={24} className="text-primary" />
                </div>
                <h1 className="text-2xl font-display font-bold mb-2">Forgot Password?</h1>
                <p className="text-sm text-muted-foreground">Enter your account email and we'll send you a 6-digit reset code.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5"
                    onKeyDown={(e) => e.key === "Enter" && void handleSendCode()}
                  />
                </div>
                <Button className="w-full glow-yellow" disabled={sendingCode} onClick={() => void handleSendCode()}>
                  {sendingCode ? "Sending…" : "Send Reset Code"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mb-4">
                  <LockKeyhole size={24} className="text-primary" />
                </div>
                <h1 className="text-2xl font-display font-bold mb-2">Enter Reset Code</h1>
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to <span className="text-foreground font-medium">{email}</span>.
                </p>
              </div>
              <form onSubmit={handleResetWithCode} className="space-y-4">
                <div>
                  <Label>6-Digit Code</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                    className="mt-1.5 text-center text-xl tracking-[0.4em] font-mono"
                  />
                </div>
                <div>
                  <Label>New Password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="mt-1.5" />
                  <p className="text-[11px] text-muted-foreground mt-1">8+ chars, uppercase, lowercase, and a number.</p>
                </div>
                <div>
                  <Label>Confirm Password</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required className="mt-1.5" />
                </div>
                <Button type="submit" className="w-full glow-yellow" disabled={resetLoading}>
                  <LockKeyhole size={16} className="mr-2" />
                  {resetLoading ? "Updating…" : "Reset Password"}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setStep("email")}
                >
                  ← Use a different email
                </button>
              </form>
            </>
          )}

          <p className="text-sm text-muted-foreground text-center mt-6">
            Back to <Link to="/login" className="text-primary hover:underline">login</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default ResetPassword;
