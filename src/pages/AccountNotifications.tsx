import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, CheckCheck, Clock, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useLocale } from "@/i18n/locale";

type NotificationRecord = {
  id: number;
  title: string;
  body: string;
  type?: string | null;
  readAt: string | null;
  createdAt?: string | null;
  linkUrl?: string | null;
};

export default function AccountNotifications() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ notifications: NotificationRecord[] }>("/api/notifications", { authenticated: true });
      setNotifications(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const markRead = async (notification: NotificationRecord) => {
    try {
      await api(`/api/notifications/${notification.id}/read`, { method: "PATCH", authenticated: true });
      setNotifications((prev) =>
        prev.map((n) => n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)
      );
      if (notification.linkUrl) navigate(notification.linkUrl);
    } catch {
      if (notification.linkUrl) navigate(notification.linkUrl);
    }
  };

  const markAllRead = async () => {
    setSaving(true);
    try {
      await api("/api/notifications/read-all", { method: "PATCH", authenticated: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } finally {
      setSaving(false);
    }
  };

  const unread = notifications.filter((n) => !n.readAt).length;

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
            <h1 className="mt-1.5 font-display text-2xl font-bold">{t("account.notifications.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("account.notifications.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{unread} {t("player.notifications.unread")}</Badge>
            <Button
              variant="outline"
              onClick={() => void markAllRead()}
              disabled={saving || unread === 0}
              className="gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
              {t("notifications.markAllRead")}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : notifications.length ? (
          <div className="space-y-3">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => void markRead(n)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  n.readAt
                    ? "border-border/60 bg-card hover:border-border"
                    : "border-primary/25 bg-primary/8 hover:border-primary/45"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={n.readAt ? "outline" : "secondary"}>
                        {n.type ?? t("notifications.title")}
                      </Badge>
                      {!n.readAt && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <p className="font-semibold">{n.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                  </div>
                  {n.createdAt && (
                    <span className="flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={12} /> {new Date(n.createdAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <Bell size={40} className="mx-auto mb-4 text-muted-foreground/40" />
            <p className="font-semibold">{t("account.notifications.empty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("player.empty.noNotifications")}</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
