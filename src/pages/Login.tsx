import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Layout from "@/components/Layout";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { setSession } from "@/lib/session";
import { useLocale } from "@/i18n/locale";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLocale();

  const redirectTarget = new URLSearchParams(location.search).get("redirect");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await api<{ token: string; refreshToken: string; user: Parameters<typeof setSession>[1] }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setSession(result.token, result.user, result.refreshToken);
      toast.success("Login successful.");
      const defaultPath =
        ["admin", "super_admin"].includes(result.user.role) ? "/admin" :
        result.user.role === "coach" ? "/coach" :
        "/reservation";
      navigate(redirectTarget ?? defaultPath, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailValue = (forgotEmail || email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      toast.error("Enter a valid email first.");
      return;
    }
    setForgotLoading(true);
    try {
      const result = await api<{ success: boolean; message: string; resetCode?: string; resetLink?: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: emailValue }),
      });
      if (result.resetCode) {
        setResetCode(result.resetCode);
        toast.message(`Dev code: ${result.resetCode}`);
      }
      if (result.resetLink) {
        toast.message(`Dev link: ${result.resetLink}`);
      }
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request password reset.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetWithCode = async () => {
    const emailValue = (forgotEmail || email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      toast.error("Enter a valid email first.");
      return;
    }
    if (!/^\d{6}$/.test(resetCode.trim())) {
      toast.error("Enter a valid 6-digit reset code.");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      toast.error("New password must be at least 8 chars with uppercase, lowercase and number.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast.error("New password confirmation does not match.");
      return;
    }
    setResetLoading(true);
    try {
      await api<{ success: boolean }>("/api/auth/reset-password-code", {
        method: "POST",
        body: JSON.stringify({
          email: emailValue,
          code: resetCode.trim(),
          password: newPassword,
        }),
      });
      toast.success("Password updated successfully. You can login now.");
      setShowForgot(false);
      setResetCode("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center py-12">
        <div className="w-full max-w-md gradient-card rounded-2xl border border-border p-8 animate-slide-up">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold mb-2">{t("auth.login.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" placeholder={t("auth.placeholder.email")} value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">{t("auth.password")}</Label>
              <div className="relative mt-1.5">
                <Input id="password" type={showPw ? "text" : "password"} placeholder={t("auth.placeholder.password")} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button type="button" onClick={() => setShowForgot((prev) => !prev)} className="mt-2 text-xs text-primary hover:underline">
                {showForgot ? "Hide forgot-password" : "Forgot password?"}
              </button>
            </div>
            {showForgot && (
              <div className="rounded-xl border border-border p-3 bg-muted/20 space-y-3">
                <div>
                  <Label>Recovery Email</Label>
                  <Input
                    type="email"
                    placeholder={t("auth.placeholder.email")}
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <Button type="button" variant="outline" className="w-full" disabled={forgotLoading} onClick={() => void handleForgotPassword()}>
                  {forgotLoading ? "Sending reset code..." : "Send reset code"}
                </Button>
                <div className="pt-2 border-t border-border/60 space-y-3">
                  <Label>Reset Code</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={resetCode}
                    onChange={(event) => setResetCode(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                  />
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    placeholder="********"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <Label>Confirm New Password</Label>
                  <Input
                    type="password"
                    placeholder="********"
                    value={newPasswordConfirm}
                    onChange={(event) => setNewPasswordConfirm(event.target.value)}
                  />
                  <Button type="button" className="w-full" disabled={resetLoading} onClick={() => void handleResetWithCode()}>
                    {resetLoading ? "Updating..." : "Reset with code"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">We send a 6-digit code by email. The link is optional fallback.</p>
              </div>
            )}
            <Button type="submit" className="w-full glow-yellow" disabled={loading}>
              <LogIn size={18} className="mr-2" /> {loading ? t("auth.login.loading") : t("auth.login.submit")}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-6">
            {t("auth.login.noAccount")} {" "}
            <Link to="/signup" className="text-primary hover:underline">{t("auth.signup.link")}</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Login;
