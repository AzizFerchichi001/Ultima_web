import { Link } from "react-router-dom";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import UserReservations from "@/components/UserReservations";
import { useLocale } from "@/i18n/locale";

export default function AccountReservations() {
  const { t } = useLocale();
  return (
    <Layout>
      <div className="container py-8 space-y-6">
        <Link
          to="/account"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> {t("account.back")}
        </Link>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">{t("account.title")}</p>
            <h1 className="mt-1.5 font-display text-2xl font-bold">{t("account.reservations.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("account.reservations.subtitle")}</p>
          </div>
          <Button asChild className="gap-2 glow-yellow">
            <Link to="/player/reservations/new">
              <CalendarPlus size={16} /> {t("player.action.bookCourt")}
            </Link>
          </Button>
        </div>

        <UserReservations />
      </div>
    </Layout>
  );
}
