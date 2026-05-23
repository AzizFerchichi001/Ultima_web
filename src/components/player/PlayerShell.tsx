import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Brain,
  CalendarCheck,
  CalendarPlus,
  History,
  Home,
  Radio,
  Trophy,
  UserCircle2,
} from "lucide-react";
import Layout from "@/components/Layout";
import { useLocale } from "@/i18n/locale";

const playerNav = [
  { key: "player.nav.dashboard", path: "/player", icon: Home },
  { key: "player.nav.bookCourt", path: "/player/reservations/new", icon: CalendarPlus },
  { key: "player.nav.reservations", path: "/player/reservations", icon: CalendarCheck },
  { key: "player.nav.competitions", path: "/player/competitions", icon: Trophy },
  { key: "player.nav.live", path: "/player/live", icon: Radio },
  { key: "player.nav.ai", path: "/player/ai", icon: Brain },
  { key: "player.nav.history", path: "/player/history", icon: History },
  { key: "player.nav.notifications", path: "/player/notifications", icon: Bell },
  { key: "player.nav.profile", path: "/player/profile", icon: UserCircle2 },
];

function isActive(pathname: string, path: string) {
  if (path === "/player") return pathname === "/player";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function PlayerShell({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const location = useLocation();

  return (
    <Layout>
      <div className="container py-6 lg:py-8">
        <div className="mb-5 overflow-x-auto pb-1 lg:hidden">
          <div className="flex min-w-max gap-2">
            {playerNav.map(({ key, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                  isActive(location.pathname, path)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={14} />
                {t(key)}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[250px,minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-border/60 bg-card p-3 shadow-xl shadow-black/5">
              <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("player.nav.workspace")}
              </p>
              <nav className="space-y-1">
                {playerNav.map(({ key, path, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive(location.pathname, path)
                        ? "bg-primary/12 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon size={16} />
                    {t(key)}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </Layout>
  );
}
