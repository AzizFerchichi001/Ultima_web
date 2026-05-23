import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";
import {
  Calendar, Trophy, Activity, Brain, ArrowRight, Zap, CheckCircle2,
  TrendingUp, Target, Users, Star, Layers, BarChart2, UserPlus,
  MapPin, Rocket,
} from "lucide-react";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { getSessionUser, SessionUser } from "@/lib/session";
import { api } from "@/lib/api";
import UserReservations from "@/components/UserReservations";
import { useLocale } from "@/i18n/locale";
import heroBg from "@/assets/hero-bg.jpg";
import smartcourt from "@/assets/smartcourt.jpg";
import aiAnalysis from "@/assets/ai-analysis.jpg";

/* ── Animated counter ────────────────────────────────────────────────────── */

function useCountUp(target: number, duration = 1600, enabled = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let start: number | null = null;
    let raf: number;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return value;
}

/* ── Dashboard stat card count-up ─────────────────────────────────────────── */

const StatValue = ({ raw }: { raw: string }) => {
  const numeric = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
  const suffix = raw.replace(/[\d.,]/g, "").trim();
  const val = useCountUp(Math.round(numeric), 1200);
  if (!numeric) return <>{raw}</>;
  return <>{val.toLocaleString()}{suffix}</>;
};

/* ── Platform stat (scroll-triggered count-up) ───────────────────────────── */

function PlatformStat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, isVisible } = useScrollAnimation(0.2);
  const count = useCountUp(value, 1800, isVisible);
  return (
    <div ref={ref} className="text-center px-4">
      <div className="text-4xl sm:text-5xl font-display font-black text-primary tabular-nums">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-xs sm:text-sm text-muted-foreground mt-2 font-semibold uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}

/* ── Scroll section ──────────────────────────────────────────────────────── */

const ScrollSection = ({
  children,
  className = "",
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  direction?: "up" | "left" | "right" | "scale";
}) => {
  const { ref, isVisible } = useScrollAnimation(0.1);
  const hiddenClass =
    direction === "left"  ? "scroll-hidden-left"
    : direction === "right" ? "scroll-hidden-right"
    : direction === "scale" ? "scroll-scale-hidden"
    : "scroll-hidden";
  const visibleClass =
    direction === "up"    ? "scroll-visible"
    : direction === "scale" ? "scroll-scale-visible"
    : "scroll-visible-x";
  return (
    <div ref={ref} className={`${hiddenClass} ${isVisible ? visibleClass : ""} ${className}`}>
      {children}
    </div>
  );
};

/* ── Live badge ──────────────────────────────────────────────────────────── */

const LiveBadge = () => (
  <div
    className="absolute top-6 right-6 md:top-8 md:right-8 hidden sm:flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-md bg-background/40 border border-primary/30"
    style={{ boxShadow: "0 0 20px hsl(var(--primary) / 0.2)" }}
  >
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
    </span>
    <span className="text-[10px] uppercase tracking-widest font-bold text-foreground/80">Live Now</span>
  </div>
);

/* ── Guest value strip ───────────────────────────────────────────────────── */

const GuestValueStrip = () => {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 350);
    return () => clearTimeout(id);
  }, []);

  const items = [
    { title: t("home.value.s1.t"), desc: t("home.value.s1.d") },
    { title: t("home.value.s2.t"), desc: t("home.value.s2.d") },
    { title: t("home.value.s3.t"), desc: t("home.value.s3.d") },
  ];

  return (
    <div
      className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.7s ease, transform 0.7s ease",
        transitionDelay: "0.25s",
      }}
    >
      {items.map((item) => (
        <div key={item.title} className="rounded-xl border border-primary/20 bg-background/45 backdrop-blur-md p-4">
          <p className="text-sm font-black uppercase tracking-wider text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{item.desc}</p>
        </div>
      ))}
    </div>
  );
};

/* ── Types ───────────────────────────────────────────────────────────────── */

type DashboardStats = {
  totalMatches: number;
  winRate: string;
  ranking: number;
  upcomingBookings: number;
};

/* ── Main component ──────────────────────────────────────────────────────── */

const Index = () => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const location = useLocation();
  const { t } = useLocale();

  const features = [
    { icon: Calendar, title: t("home.features.booking.title"), desc: t("home.features.booking.desc"), link: "/reservation" },
    { icon: Trophy,   title: t("home.features.competitions.title"), desc: t("home.features.competitions.desc"), link: "/competitions" },
    { icon: Activity, title: t("home.features.live.title"), desc: t("home.features.live.desc"), link: "/live-scores" },
    { icon: Brain,    title: t("home.features.ai.title"), desc: t("home.features.ai.desc"), link: "/smartplay-ai" },
  ];

  useEffect(() => {
    const sessionUser = getSessionUser();
    setUser(sessionUser);
    if (sessionUser) {
      void api<DashboardStats>("/api/player/dashboard", { authenticated: true })
        .then(setStats)
        .catch(console.error);
    } else {
      setStats(null);
    }
  }, [location.pathname]);

  return (
    <Layout>

      {/* ══ HERO ════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        <img src={heroBg} alt="Padel court" className="absolute inset-0 w-full h-full object-cover" />

        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, hsl(var(--background) / 0.95) 0%, hsl(var(--background) / 0.65) 55%, transparent 100%), " +
              "linear-gradient(to top, hsl(var(--background) / 0.8) 0%, transparent 40%)",
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <LiveBadge />

        <div className="container relative z-10 py-20 md:py-0">
          <div className="max-w-2xl animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6 backdrop-blur-sm">
              <Zap size={16} className="animate-pulse" /> {t("home.hero.badge")}
            </div>

            {user ? (
              <>
                <h1 className="text-4xl sm:text-6xl md:text-7xl font-display font-bold leading-[0.95] mb-6">
                  <span className="text-foreground">{t("home.hero.welcome")}</span>
                  <br />
                  <span className="text-gradient">{user.firstName}</span>
                </h1>
                <p className="text-base md:text-lg text-muted-foreground max-w-xl mb-10">
                  {t("home.hero.userText")}
                </p>
                <div className="flex flex-wrap gap-3 sm:gap-4">
                  <Link to="/reservation">
                    <Button size="lg" className="glow-yellow h-12 sm:h-14 px-6 sm:px-8 text-base sm:text-lg">
                      {t("home.hero.bookCourt")}
                    </Button>
                  </Link>
                  <Link to="/performance">
                    <Button variant="outline" size="lg" className="h-12 sm:h-14 px-6 sm:px-8 text-base sm:text-lg border-primary/30 text-primary">
                      {t("home.hero.myStats")}
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-bold leading-[0.95] mb-6">
                  <span className="text-gradient">WE CONNECT</span>
                  <br />
                  <span className="text-foreground">YOUR SPORT</span>
                </h1>
                <p className="text-base md:text-xl text-muted-foreground max-w-xl mb-10">
                  {t("home.hero.guestText")}
                </p>
                <div className="flex flex-wrap gap-3 sm:gap-4">
                  <Link to="/signup">
                    <Button size="lg" className="glow-yellow h-12 sm:h-14 px-6 sm:px-8 text-base sm:text-lg">
                      {t("home.hero.start")}
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button variant="outline" size="lg" className="h-12 sm:h-14 px-6 sm:px-8 text-base sm:text-lg border-primary/30 text-primary">
                      {t("home.hero.login")}
                    </Button>
                  </Link>
                </div>
                <GuestValueStrip />
              </>
            )}
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-24 bg-background"
          style={{ clipPath: "polygon(0 100%, 100% 45%, 100% 100%, 0 100%)" }}
        />
      </section>

      {/* ══ DASHBOARD STATS (logged-in) ══════════════════════════════════════ */}
      {user && stats && (
        <section className="py-10 -mt-10 relative z-20">
          <div className="container">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { icon: Target,    label: "Win Rate",             value: stats.winRate,                  color: "text-primary" },
                { icon: TrendingUp, label: "Ranking",             value: `${stats.ranking} PTS`,          color: "text-blue-400" },
                { icon: Activity,  label: t("home.stats.matches"), value: String(stats.totalMatches),     color: "text-green-400" },
                { icon: Calendar,  label: t("home.stats.booked"), value: String(stats.upcomingBookings), color: "text-yellow-400" },
              ].map((s) => (
                <div key={s.label} className="gradient-card p-4 sm:p-6 rounded-2xl border border-primary/20 backdrop-blur-md">
                  <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground mb-3 sm:mb-4">
                    <s.icon size={16} className={s.color} />
                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest truncate">{s.label}</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-display font-bold">
                    <StatValue raw={s.value} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══ QUICK ACTIONS (logged-in) ════════════════════════════════════════ */}
      {user && (
        <section className="py-6 pb-12">
          <div className="container">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              {t("home.quickActions.title")}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { icon: Calendar,  title: t("home.quickActions.book.t"),    desc: t("home.quickActions.book.d"),    link: "/reservation",  color: "text-primary",    bg: "bg-primary/10" },
                { icon: BarChart2, title: t("home.quickActions.stats.t"),   desc: t("home.quickActions.stats.d"),   link: "/performance",  color: "text-blue-400",   bg: "bg-blue-400/10" },
                { icon: Trophy,    title: t("home.quickActions.compete.t"), desc: t("home.quickActions.compete.d"), link: "/competitions", color: "text-amber-400",  bg: "bg-amber-400/10" },
                { icon: Activity,  title: t("home.quickActions.live.t"),    desc: t("home.quickActions.live.d"),    link: "/live-scores",  color: "text-green-400",  bg: "bg-green-400/10" },
              ].map((action) => (
                <Link key={action.link} to={action.link} className="group">
                  <div className="gradient-card rounded-2xl p-4 sm:p-5 border border-border hover:border-primary/40 transition-all h-full">
                    <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl ${action.bg} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
                      <action.icon size={18} className={action.color} />
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm mb-1 leading-tight">{action.title}</h3>
                    <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed hidden sm:block">{action.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══ PLATFORM STATS STRIP ════════════════════════════════════════════ */}
      <section className="py-14 sm:py-20 border-y border-primary/10 bg-primary/[0.04]">
        <div className="container">
          <p className="text-center text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-10">
            {t("home.platformStats.tagline")}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
            <PlatformStat value={12}   suffix="+" label={t("home.platformStats.arenas")} />
            <PlatformStat value={180}  suffix="+" label={t("home.platformStats.courts")} />
            <PlatformStat value={2400} suffix="+" label={t("home.platformStats.players")} />
            <PlatformStat value={5800} suffix="+" label={t("home.platformStats.bookings")} />
          </div>
        </div>
      </section>

      {/* ══ FEATURES ════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="container">
          <ScrollSection className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4">
              {t("home.tech.title.prefix")}{" "}
              <span className="text-gradient">{t("home.tech.title.highlight")}</span>
            </h2>
          </ScrollSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {features.map((f) => (
              <ScrollSection key={f.title} direction="scale" className="h-full">
                <Link to={f.link} className="flex flex-col h-full gradient-card p-6 sm:p-8 rounded-2xl border border-border hover:border-primary/40 transition-all group">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
                    <f.icon className="text-primary" size={22} />
                  </div>
                  <h3 className="text-lg sm:text-xl font-display font-bold mb-3">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mb-5 sm:mb-6 flex-grow">{f.desc}</p>
                  <div className="flex items-center text-primary text-sm font-bold opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-1 transition-all duration-300">
                    {t("home.explore")} <ArrowRight size={14} className="ml-2" />
                  </div>
                </Link>
              </ScrollSection>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS (guest only) ════════════════════════════════════════ */}
      {!user && (
        <section className="py-20 sm:py-28 bg-muted/20">
          <div className="container">
            <ScrollSection className="text-center mb-12 sm:mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-5">
                <Zap size={14} /> {t("home.howItWorks.badge")}
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4">
                {t("home.howItWorks.title")}
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto text-sm sm:text-base">
                {t("home.howItWorks.subtitle")}
              </p>
            </ScrollSection>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 relative">
              {/* connector line desktop */}
              <div className="hidden md:block absolute top-[3.25rem] left-[calc(16.667%+2rem)] right-[calc(16.667%+2rem)] h-px bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 z-0" />

              {[
                { num: "01", icon: UserPlus, title: t("home.howItWorks.s1.t"), desc: t("home.howItWorks.s1.d") },
                { num: "02", icon: MapPin,   title: t("home.howItWorks.s2.t"), desc: t("home.howItWorks.s2.d") },
                { num: "03", icon: BarChart2, title: t("home.howItWorks.s3.t"), desc: t("home.howItWorks.s3.d") },
              ].map((step) => (
                <ScrollSection key={step.num} direction="scale" className="relative z-10">
                  <div className="gradient-card rounded-2xl p-6 sm:p-8 border border-primary/15 text-center relative overflow-hidden">
                    <div className="text-7xl font-display font-black text-primary/8 absolute -top-2 -right-1 leading-none select-none pointer-events-none">
                      {step.num}
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-5 relative z-10">
                      <step.icon size={26} className="text-primary" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold mb-3 relative z-10">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed relative z-10">{step.desc}</p>
                  </div>
                </ScrollSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══ USER RESERVATIONS (logged-in) ════════════════════════════════════ */}
      {user && (
        <section className="pb-20 border-t border-border pt-16 sm:pt-20">
          <div className="container">
            <UserReservations />
          </div>
        </section>
      )}

      {/* ══ SPORTS GALLERY ══════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 overflow-hidden">
        <div className="container">
          <ScrollSection className="text-center mb-12 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-5">
              <Layers size={14} /> {t("home.sports.badge")}
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4">
              {t("home.sports.title")}
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm sm:text-base">
              {t("home.sports.subtitle")}
            </p>
          </ScrollSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 auto-rows-[240px] sm:auto-rows-[260px]">
            {/* Large padel card */}
            <ScrollSection direction="left" className="md:col-span-2 md:row-span-2">
              <Link to="/reservation" className="relative w-full h-full min-h-[260px] md:min-h-0 rounded-3xl overflow-hidden group block">
                <img src={heroBg} alt="Padel" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <span className="text-[10px] bg-primary text-primary-foreground px-3 py-1 rounded-full font-black uppercase tracking-widest">Padel</span>
                  <h3 className="text-xl sm:text-2xl font-display font-bold mt-2">Indoor &amp; Outdoor</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("home.sports.padel.sub")}</p>
                </div>
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-primary text-primary-foreground rounded-full p-2">
                    <ArrowRight size={16} />
                  </div>
                </div>
              </Link>
            </ScrollSection>

            {/* Smart Courts card */}
            <ScrollSection direction="right">
              <div className="relative w-full h-full min-h-[240px] rounded-3xl overflow-hidden group">
                <img src={smartcourt} alt="Smart Court" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                <div className="absolute bottom-5 left-5">
                  <span className="text-[10px] bg-amber-500 text-white px-3 py-1 rounded-full font-black uppercase tracking-widest">SUMMA</span>
                  <h3 className="text-lg font-display font-bold mt-2">{t("home.sports.summa.t")}</h3>
                </div>
              </div>
            </ScrollSection>

            {/* AI Analytics card */}
            <ScrollSection direction="right">
              <div className="relative w-full h-full min-h-[240px] rounded-3xl overflow-hidden group">
                <img src={aiAnalysis} alt="AI Analytics" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                <div className="absolute bottom-5 left-5">
                  <span className="text-[10px] bg-violet-500 text-white px-3 py-1 rounded-full font-black uppercase tracking-widest">AI</span>
                  <h3 className="text-lg font-display font-bold mt-2">{t("home.sports.ai.t")}</h3>
                </div>
              </div>
            </ScrollSection>
          </div>
        </div>
      </section>

      {/* ══ TECH SHOWCASE ════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 bg-muted/30">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <ScrollSection direction="left">
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold mb-6 sm:mb-8">
                {t("home.tech.title.prefix")}{" "}
                <span className="text-gradient">{t("home.tech.title.highlight")}</span>
              </h2>
              <ul className="space-y-5 sm:space-y-6">
                {[
                  { t: t("home.tech.item1.t"), d: t("home.tech.item1.d") },
                  { t: t("home.tech.item2.t"), d: t("home.tech.item2.d") },
                  { t: t("home.tech.item3.t"), d: t("home.tech.item3.d") },
                ].map((item) => (
                  <li key={item.t} className="flex gap-4">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                      <CheckCircle2 size={14} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm sm:text-base">{item.t}</h4>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollSection>

            <ScrollSection direction="right">
              <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl hover:skew-y-0 skew-y-3 transition-all duration-700">
                <img src={smartcourt} alt="AI Analytics" className="w-full h-auto" />
                <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-60" />
              </div>
            </ScrollSection>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS (guest only) ════════════════════════════════════════ */}
      {!user && (
        <section className="py-20 sm:py-28">
          <div className="container">
            <ScrollSection className="text-center mb-12 sm:mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-5">
                <Users size={14} /> {t("home.testimonials.badge")}
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4">
                {t("home.testimonials.title")}
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
                {t("home.testimonials.subtitle")}
              </p>
            </ScrollSection>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
              {[
                {
                  name: t("home.testimonials.t1.name"),
                  role: t("home.testimonials.t1.role"),
                  text: t("home.testimonials.t1.text"),
                },
                {
                  name: t("home.testimonials.t2.name"),
                  role: t("home.testimonials.t2.role"),
                  text: t("home.testimonials.t2.text"),
                },
                {
                  name: t("home.testimonials.t3.name"),
                  role: t("home.testimonials.t3.role"),
                  text: t("home.testimonials.t3.text"),
                },
              ].map((item) => (
                <ScrollSection key={item.name} direction="scale">
                  <div className="gradient-card rounded-2xl p-6 sm:p-7 border border-primary/15 h-full flex flex-col">
                    <div className="flex gap-1 mb-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={13} className="fill-primary text-primary" />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-grow italic">
                      "{item.text}"
                    </p>
                    <div className="mt-6 flex items-center gap-3 pt-5 border-t border-border">
                      <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {item.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold leading-tight">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.role}</p>
                      </div>
                    </div>
                  </div>
                </ScrollSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══ FINAL CTA (guest only) ══════════════════════════════════════════ */}
      {!user && (
        <section className="py-20 sm:py-28 bg-muted/20">
          <div className="container">
            <ScrollSection>
              <div
                className="relative rounded-3xl overflow-hidden border border-primary/20 p-10 sm:p-16 md:p-24 text-center"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--primary)/0.14) 0%, hsl(var(--background)) 65%)",
                }}
              >
                {/* grid texture */}
                <div
                  className="absolute inset-0 opacity-[0.035] pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />
                {/* glow orb */}
                <div
                  className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20 pointer-events-none"
                  style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }}
                />

                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
                    <Rocket size={14} /> {t("home.cta.badge")}
                  </div>
                  <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-black mb-5 sm:mb-6 leading-tight">
                    {t("home.cta.title")}
                  </h2>
                  <p className="text-sm sm:text-lg text-muted-foreground max-w-xl mx-auto mb-8 sm:mb-10">
                    {t("home.cta.subtitle")}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <Link to="/signup">
                      <Button size="lg" className="glow-yellow h-12 sm:h-14 px-8 sm:px-12 text-base sm:text-lg w-full sm:w-auto">
                        {t("home.cta.btn")}
                      </Button>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {t("home.cta.loginHint")}{" "}
                      <Link to="/login" className="text-primary hover:underline font-semibold">
                        {t("nav.login")}
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            </ScrollSection>
          </div>
        </section>
      )}

    </Layout>
  );
};

export default Index;
