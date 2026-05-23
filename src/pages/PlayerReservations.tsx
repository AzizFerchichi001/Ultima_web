import { Link } from "react-router-dom";
import { CalendarPlus } from "lucide-react";
import PlayerShell from "@/components/player/PlayerShell";
import UserReservations from "@/components/UserReservations";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/locale";

export default function PlayerReservations() {
  const { t } = useLocale();
  return (
    <PlayerShell>
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-xl shadow-black/5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("player.nav.reservations")}</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{t("playerReservations.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("playerReservations.subtitle")}</p>
        </div>
        <Button asChild className="gap-2 glow-yellow">
          <Link to="/player/reservations/new"><CalendarPlus size={16} /> {t("player.action.bookCourt")}</Link>
        </Button>
      </div>
      <UserReservations />
    </PlayerShell>
  );
}
