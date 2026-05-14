import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Languages, Loader2, Mail, Save, Shield } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { getSessionUser, setSession, SessionUser } from "@/lib/session";
import { useLocale } from "@/i18n/locale";

export default function AccountSettings() {
  const user = getSessionUser();
  const { t, locale, setLocale } = useLocale();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const result = await api<{ token: string; refreshToken?: string; user: SessionUser }>(
        "/api/player/profile",
        { method: "PATCH", body: { firstName, lastName }, authenticated: true }
      );
      setSession(result.token, result.user, result.refreshToken);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("account.settings.saveFail"));
    } finally {
      setSaving(false);
    }
  };

  const isDirty = firstName !== (user?.firstName ?? "") || lastName !== (user?.lastName ?? "");

  return (
    <Layout>
      <div className="container py-8 max-w-2xl space-y-6">

        {/* Back */}
        <Link
          to="/account"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> {t("account.back")}
        </Link>

        {/* Header */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">{t("account.title")}</p>
          <h1 className="font-display text-2xl font-bold">{t("account.settings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("account.settings.subtitle")}</p>
        </div>

        {/* Personal info */}
        <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-5">
          <div>
            <h2 className="font-semibold text-base">{t("account.settings.personalInfo")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("account.settings.personalHint")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">{t("account.settings.firstName")}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">{t("account.settings.lastName")}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={60}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Mail size={13} /> Email</Label>
            <Input value={user?.email ?? ""} disabled className="opacity-60" />
            <p className="text-xs text-muted-foreground">{t("account.settings.emailNote")}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !isDirty}
              className="gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? t("account.updating") : t("account.settings.saveChanges")}
            </Button>
            {saved && (
              <span className="text-sm text-green-400 font-medium">{t("account.settings.saved")}</span>
            )}
          </div>
        </section>

        {/* Language */}
        <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Languages size={16} className="text-primary" />
            <h2 className="font-semibold text-base">{t("account.settings.language")}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-xs">
            {(["en", "fr"] as const).map((lang) => (
              <Button
                key={lang}
                variant={locale === lang ? "default" : "outline"}
                onClick={() => setLocale(lang)}
                className="uppercase"
              >
                {lang}
              </Button>
            ))}
          </div>
        </section>

        {/* Account info */}
        <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <BadgeCheck size={16} className="text-primary" />
            <h2 className="font-semibold text-base">{t("account.settings.accountInfo")}</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("account.settings.emailStatus")}</span>
              <Badge variant={user?.emailVerified ? "secondary" : "outline"}>
                {user?.emailVerified ? t("status.confirmed") : t("status.pending")}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("account.settings.membership")}</span>
              <Badge variant="outline">{user?.membershipStatus ?? "—"}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("auth.role")}</span>
              <Badge variant="outline">{t("auth.role.player")}</Badge>
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <h2 className="font-semibold text-base">{t("account.settings.security")}</h2>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/reset-password">{t("account.settings.changePassword")}</Link>
          </Button>
        </section>
      </div>
    </Layout>
  );
}
