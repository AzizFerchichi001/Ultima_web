import { Link } from "react-router-dom";
import { BadgeCheck, Languages, Mail, Shield, UserCircle2 } from "lucide-react";
import PlayerShell from "@/components/player/PlayerShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/lib/session";
import { useLocale } from "@/i18n/locale";

function InfoRow({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/55 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <Icon size={14} /> {label}
      </div>
      <p className="break-words font-semibold">{value}</p>
    </div>
  );
}

export default function PlayerProfile() {
  const user = getSessionUser();
  const { t, locale, setLocale } = useLocale();

  return (
    <PlayerShell>
      <div className="space-y-6">
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <UserCircle2 size={36} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("player.profile.title")}</p>
                <h1 className="font-display text-3xl font-bold">{user?.firstName} {user?.lastName}</h1>
                <p className="text-sm text-muted-foreground">{user?.arenaName ?? t("auth.allArenas")}</p>
              </div>
            </div>
            <Badge variant={user?.status === "active" ? "secondary" : "destructive"}>
              {user?.status ?? t("status.pending")}
            </Badge>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr,0.55fr]">
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5 sm:p-6">
            <h2 className="mb-4 font-display text-xl font-bold">{t("player.profile.personalInfo")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={UserCircle2} label={t("auth.firstName")} value={user?.firstName ?? "--"} />
              <InfoRow icon={UserCircle2} label={t("auth.lastName")} value={user?.lastName ?? "--"} />
              <InfoRow icon={Mail} label={t("auth.email")} value={user?.email ?? "--"} />
              <InfoRow icon={Shield} label={t("auth.role")} value={t("auth.role.player")} />
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <BadgeCheck size={18} className="text-primary" />
                <h2 className="font-display text-xl font-bold">{t("player.profile.account")}</h2>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("player.profile.emailStatus")}</span>
                  <Badge variant={user?.emailVerified ? "secondary" : "outline"}>
                    {user?.emailVerified ? t("status.confirmed") : t("status.pending")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("player.profile.memberStatus")}</span>
                  <Badge variant="outline">{user?.membershipStatus ?? "--"}</Badge>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Languages size={18} className="text-primary" />
                <h2 className="font-display text-xl font-bold">{t("nav.lang")}</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["en", "fr"] as const).map((lang) => (
                  <Button
                    key={lang}
                    variant={locale === lang ? "default" : "outline"}
                    onClick={() => setLocale(lang)}
                  >
                    {lang.toUpperCase()}
                  </Button>
                ))}
              </div>
            </section>

            <Button asChild variant="outline" className="w-full">
              <Link to="/reset-password">{t("player.profile.security")}</Link>
            </Button>
          </aside>
        </div>
      </div>
    </PlayerShell>
  );
}
