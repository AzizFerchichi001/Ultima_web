import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, ChevronDown, LogOut, Menu, Moon, Sun, UserCircle2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { clearSession, getSessionUser, SessionUser } from "@/lib/session";
import { useLocale } from "@/i18n/locale";
import BrandLogo from "./BrandLogo";
import { api } from "@/lib/api";

// ── Link definitions ──────────────────────────────────────────────────────────

type NavLink = { key: string; path: string };

const guestLinks: NavLink[] = [
  { key: "nav.home", path: "/" },
];

// primary = always visible in bar  |  more = hidden in "More ▾" dropdown
const playerPrimary: NavLink[] = [
  { key: "player.nav.dashboard",    path: "/account" },
  { key: "player.nav.bookCourt",    path: "/reservation" },
  { key: "player.nav.reservations", path: "/account/reservations" },
  { key: "nav.coaches",             path: "/coaches" },
  { key: "player.nav.competitions", path: "/account/competitions" },
];
const playerMore: NavLink[] = [
  { key: "player.nav.live",          path: "/account/live-sessions" },
  { key: "player.nav.ai",            path: "/account/ai-analysis" },
  { key: "player.nav.notifications", path: "/account/notifications" },
];

const coachPrimary: NavLink[] = [
  { key: "nav.home",              path: "/" },
  { key: "nav.coach",             path: "/coach" },
  { key: "nav.coachAvailability", path: "/coach/availability" },
  { key: "nav.coachRequests",     path: "/coach/requests" },
  { key: "nav.competitions",      path: "/competitions" },
];
const coachMore: NavLink[] = [
  { key: "nav.coachProfile", path: "/coach/profile" },
  { key: "nav.live",         path: "/live-scores" },
];

const adminPrimary: NavLink[] = [
  { key: "nav.home",      path: "/" },
  { key: "admin.title",   path: "/admin" },
  { key: "nav.smartplay", path: "/smartplay-ai" },
  { key: "nav.live",      path: "/live-scores" },
];
const adminMore: NavLink[] = [];

function getScopedLinks(user: SessionUser | null): { primary: NavLink[]; more: NavLink[] } {
  if (!user) return { primary: guestLinks, more: [] };
  if (user.role === "admin" || user.role === "super_admin") return { primary: adminPrimary, more: adminMore };
  if (user.role === "coach") return { primary: coachPrimary, more: coachMore };
  return { primary: playerPrimary, more: playerMore };
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Notification = { id: number; title: string; body: string; readAt: string | null; linkUrl?: string | null };

// ── Component ─────────────────────────────────────────────────────────────────
const Navbar = () => {
  const [drawerOpen, setDrawerOpen]           = useState(false);
  const [moreOpen, setMoreOpen]               = useState(false);
  const [userMenuOpen, setUserMenuOpen]       = useState(false);
  const [notifOpen, setNotifOpen]             = useState(false);
  const [sessionUser, setSessionUser]         = useState<SessionUser | null>(null);
  const [notifications, setNotifications]     = useState<Notification[]>([]);

  const moreRef  = useRef<HTMLDivElement>(null);
  const userRef  = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();

  const profilePath =
    sessionUser?.role === "admin" || sessionUser?.platformRole === "super_admin"
      ? "/admin"
      : sessionUser?.role === "coach"
      ? "/coach/profile"
      : "/account/settings";

  const { primary, more } = getScopedLinks(sessionUser);
  const allLinks = [...primary, ...more];

  // ── Sync session ─────────────────────────────────────────────────────────
  useEffect(() => { setSessionUser(getSessionUser()); }, [location.pathname]);
  useEffect(() => {
    const sync = () => setSessionUser(getSessionUser());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // ── Fetch notifications ───────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionUser) { setNotifications([]); return; }
    void api<{ notifications: Notification[] }>("/api/notifications", { authenticated: true })
      .then((r) => setNotifications(r.notifications ?? []))
      .catch(() => {});
  }, [sessionUser?.id, location.pathname]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current  && !moreRef.current.contains(e.target as Node))  setMoreOpen(false);
      if (userRef.current  && !userRef.current.contains(e.target as Node))  setUserMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Close drawer on route change ──────────────────────────────────────────
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    clearSession();
    setSessionUser(null);
    setDrawerOpen(false);
    navigate("/");
  };

  const handleOpenNotif = async (id: number, linkUrl?: string | null) => {
    try {
      await api(`/api/notifications/${id}/read`, { method: "PATCH", authenticated: true });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    } catch { /* ignore */ }
    setNotifOpen(false);
    if (linkUrl) navigate(linkUrl);
  };

  const unread = notifications.filter((n) => !n.readAt).length;

  const isActive = (path: string) =>
    path === "/account"
      ? location.pathname === "/account"
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const linkClass = (path: string) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
      isActive(path)
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    }`;

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 flex h-16 items-center justify-between gap-3">

          {/* Logo */}
          <Link to="/" className="shrink-0 flex items-center gap-2" aria-label="ULTIMA home">
            <BrandLogo compact />
          </Link>

          {/* ── Desktop primary nav ───────────────────────────────────────── */}
          <div className="hidden lg:flex items-center gap-0.5 flex-1 mx-2">
            {primary.map((link) => (
              <Link key={link.path} to={link.path} className={linkClass(link.path)}>
                {t(link.key)}
              </Link>
            ))}

            {/* More dropdown */}
            {more.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    moreOpen || more.some((l) => isActive(l.path))
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  More <ChevronDown size={13} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                </button>
                {moreOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl border border-border bg-card shadow-xl p-1.5 z-50">
                    {more.map((link) => (
                      <Link
                        key={link.path}
                        to={link.path}
                        onClick={() => setMoreOpen(false)}
                        className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive(link.path)
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {t(link.key)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Desktop right controls ────────────────────────────────────── */}
          <div className="hidden lg:flex items-center gap-1 shrink-0">

            {/* Lang */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["en", "fr"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className={`px-2.5 py-1 text-xs font-bold transition-colors ${
                    locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Theme */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t("nav.theme")}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {sessionUser ? (
              <>
                {/* Notifications */}
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => setNotifOpen((v) => !v)}
                    className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Notifications"
                  >
                    <Bell size={16} />
                    {unread > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
                        {Math.min(unread, 9)}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-80 rounded-xl border border-border bg-card shadow-xl p-2 z-50">
                      <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {t("notifications.title")}
                      </p>
                      <div className="max-h-72 overflow-y-auto space-y-0.5">
                        {notifications.length ? notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => void handleOpenNotif(n.id, n.linkUrl)}
                            className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                              n.readAt ? "hover:bg-muted/40 text-muted-foreground" : "bg-primary/5 hover:bg-primary/10 text-foreground"
                            }`}
                          >
                            <p className="font-semibold text-xs truncate">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                          </button>
                        )) : (
                          <p className="px-3 py-5 text-sm text-muted-foreground text-center">{t("notifications.empty")}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* User menu */}
                <div className="relative" ref={userRef}>
                  <button
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <UserCircle2 size={15} />
                    <span className="max-w-[72px] truncate">{sessionUser.firstName}</span>
                    <ChevronDown size={12} className={`transition-transform text-muted-foreground ${userMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-border bg-card shadow-xl p-1.5 z-50">
                      <Link
                        to={profilePath}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <UserCircle2 size={14} /> {t("nav.profile")}
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <LogOut size={14} /> {t("nav.logout")}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">{t("nav.login")}</Button></Link>
                <Link to="/signup"><Button size="sm">{t("nav.signup")}</Button></Link>
              </>
            )}
          </div>

          {/* ── Mobile right: bell + hamburger ────────────────────────────── */}
          <div className="flex lg:hidden items-center gap-1">
            {sessionUser && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen((v) => !v)}
                  className="relative p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Bell size={18} />
                  {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
                      {Math.min(unread, 9)}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-border bg-card shadow-xl p-2 z-50">
                    <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t("notifications.title")}
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                      {notifications.length ? notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => void handleOpenNotif(n.id, n.linkUrl)}
                          className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                            n.readAt ? "hover:bg-muted/40 text-muted-foreground" : "bg-primary/5 hover:bg-primary/10 text-foreground"
                          }`}
                        >
                          <p className="font-semibold text-xs truncate">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        </button>
                      )) : (
                        <p className="px-3 py-4 text-sm text-muted-foreground text-center">{t("notifications.empty")}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="p-2 rounded-md text-foreground hover:bg-muted transition-colors"
              aria-label="Menu"
            >
              <Menu size={22} />
            </button>
          </div>

        </div>
      </nav>

      {/* ── Mobile drawer ────────────────────────────────────────────────────── */}
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Drawer panel — slides in from right */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-background border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <BrandLogo compact />
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav links — no scroll, just a list */}
        <div className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {allLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive(link.path)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t(link.key)}
            </Link>
          ))}
        </div>

        {/* Footer: lang + theme + auth */}
        <div className="shrink-0 border-t border-border px-3 py-4 space-y-3">
          {/* Lang + Theme row */}
          <div className="flex items-center gap-2">
            <div className="flex flex-1 rounded-lg border border-border overflow-hidden">
              {(["en", "fr"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className={`flex-1 py-1.5 text-xs font-bold transition-colors ${
                    locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>

          {/* Auth */}
          {sessionUser ? (
            <div className="flex flex-col gap-1.5">
              <Link
                to={profilePath}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <UserCircle2 size={15} /> {sessionUser.firstName} {sessionUser.lastName}
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <LogOut size={15} /> {t("nav.logout")}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Link to="/login" className="flex-1" onClick={() => setDrawerOpen(false)}>
                <Button variant="outline" className="w-full" size="sm">{t("nav.login")}</Button>
              </Link>
              <Link to="/signup" className="flex-1" onClick={() => setDrawerOpen(false)}>
                <Button className="w-full" size="sm">{t("nav.signup")}</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Navbar;
