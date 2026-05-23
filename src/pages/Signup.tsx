import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Layout from "@/components/Layout";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { setSession } from "@/lib/session";
import { useLocale } from "@/i18n/locale";

const Signup = () => {
  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    email: "",
    password: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLocale();

  const redirectTarget = new URLSearchParams(location.search).get("redirect");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim().toLowerCase());
    const passwordOk = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(form.password);
    if (!emailOk) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (!passwordOk) {
      toast.error("Password must be at least 8 chars with uppercase, lowercase and number.");
      return;
    }
    if (form.password !== confirmPassword) {
      toast.error("Password confirmation does not match.");
      return;
    }
    setLoading(true);

    try {
      const result = await api<{
        token: string;
        user: Parameters<typeof setSession>[1];
      }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setSession(result.token, result.user);
      toast.success("Account created successfully.");
      const defaultPath =
        ["admin", "super_admin"].includes(result.user.role) ? "/admin" :
        result.user.role === "coach" ? "/coach" :
        "/reservation";
      navigate(redirectTarget ?? defaultPath, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign up.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center py-12">
        <div className="w-full max-w-md gradient-card rounded-2xl border border-border p-8 animate-slide-up">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold mb-2">{t("auth.signup.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.signup.subtitle")}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("auth.lastName")}</Label>
                <Input placeholder={t("auth.placeholder.lastName")} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required className="mt-1.5" />
              </div>
              <div>
                <Label>{t("auth.firstName")}</Label>
                <Input placeholder={t("auth.placeholder.firstName")} value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>{t("auth.email")}</Label>
              <Input type="email" placeholder={t("auth.placeholder.email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="mt-1.5" />
            </div>
            <div>
              <Label>{t("auth.password")}</Label>
              <div className="relative mt-1.5">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.placeholder.password")}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">8+ chars, uppercase, lowercase, and a number.</p>
            </div>
            <div>
              <Label>Confirm Password</Label>
              <div className="relative mt-1.5">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder={t("auth.placeholder.password")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full glow-yellow" disabled={loading}>
              <UserPlus size={18} className="mr-2" /> {loading ? t("auth.signup.loading") : t("auth.signup.submit")}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-6">
            {t("auth.signup.haveAccount")} {" "}
            <Link to="/login" className="text-primary hover:underline">{t("auth.login.link")}</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Signup;
