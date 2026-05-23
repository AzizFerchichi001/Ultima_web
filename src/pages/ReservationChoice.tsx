import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/locale";
import { CalendarDays, UserCheck, ArrowRight, Bell } from "lucide-react";

const ReservationChoice = () => {
  const { t } = useLocale();
  const navigate = useNavigate();

  const options = [
    {
      icon: <CalendarDays className="w-8 h-8 text-primary" />,
      title: t("resChoice.courtOnly.title"),
      desc: t("resChoice.courtOnly.desc"),
      cta: t("resChoice.courtOnly.cta"),
      notice: null,
      accent: "from-primary/10 to-primary/5",
      border: "border-primary/20 hover:border-primary/50",
      onClick: () => navigate("/player/reservations/new"),
    },
    {
      icon: <UserCheck className="w-8 h-8 text-amber-500" />,
      title: t("resChoice.withCoach.title"),
      desc: t("resChoice.withCoach.desc"),
      cta: t("resChoice.withCoach.cta"),
      notice: t("resChoice.withCoach.notice"),
      accent: "from-amber-500/10 to-amber-500/5",
      border: "border-amber-500/20 hover:border-amber-500/50",
      onClick: () => navigate("/player/coach-booking"),
    },
  ];

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12 max-w-lg">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
            {t("resChoice.title")}
          </h1>
          <p className="text-muted-foreground text-base">
            {t("resChoice.subtitle")}
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl">
          {options.map((opt) => (
            <button
              key={opt.title}
              onClick={opt.onClick}
              className={`group relative rounded-3xl border-2 bg-card text-left p-8 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${opt.border}`}
            >
              {/* Gradient accent */}
              <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${opt.accent} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />

              <div className="relative">
                {/* Icon */}
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-6">
                  {opt.icon}
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-foreground mb-3">{opt.title}</h2>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  {opt.desc}
                </p>

                {/* Notice (for coach option) */}
                {opt.notice && (
                  <div className="flex items-start gap-2 mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Bell className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      {opt.notice}
                    </p>
                  </div>
                )}

                {/* CTA */}
                <div className="flex items-center gap-2 font-semibold text-sm text-primary group-hover:gap-3 transition-all">
                  {opt.cta}
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default ReservationChoice;
