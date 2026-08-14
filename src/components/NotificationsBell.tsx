import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  getNotifications,
  unreadCount,
  isUnread,
  markAllRead,
  AppNotification,
} from "@/lib/notifications";

const tagStyles: Record<string, string> = {
  جديد: "bg-primary/20 text-primary",
  تحديث: "bg-emerald-500/20 text-emerald-400",
  نصيحة: "bg-amber-500/20 text-amber-400",
};

const NotificationsBell = () => {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refreshNotifications = () => {
    setUnread(unreadCount());
    setNotifications(getNotifications());
  };

  useEffect(() => {
    refreshNotifications();

    window.addEventListener("vireon_notifications_updated", refreshNotifications);
    return () => {
      window.removeEventListener("vireon_notifications_updated", refreshNotifications);
    };
  }, []);

  const openPanel = () => {
    setOpen(true);
    markAllRead();
    setUnread(0);
  };

  return (
    <>
      <button
        onClick={openPanel}
        aria-label="الإشعارات"
        className="relative w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-foreground hover:border-primary transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex flex-col"
          dir="rtl"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 animate-fade-in" />
          <div
            className="relative mt-auto rounded-t-2xl bg-popover border border-border border-b-0 shadow-2xl glass max-h-[75vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-primary" /> الإشعارات
              </span>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-2">
              {notifications.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  لا توجد إشعارات
                </p>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex gap-3 p-3 rounded-xl bg-card border border-border"
                >
                  <div className="text-2xl shrink-0">{n.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-bold text-xs text-foreground truncate">
                        {n.title}
                      </h4>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tagStyles[n.tag] || "bg-secondary text-foreground"}`}
                      >
                        {n.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {n.body}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-1">{n.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NotificationsBell;
