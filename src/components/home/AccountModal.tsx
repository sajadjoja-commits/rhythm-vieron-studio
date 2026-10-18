import React from "react";
import {
  X,
  User,
  Shield,
  Sparkles,
  Settings,
  LogOut,
  FolderOpen,
  Cpu,
  Cloud,
  CheckCircle2,
  Crown
} from "lucide-react";
import { getLang } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  isGuest?: boolean;
  onNavigate: (tab: string) => void;
  onLogout?: () => void;
  projectsCount?: number;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  session,
  isGuest,
  onNavigate,
  onLogout,
  projectsCount = 0,
}) => {
  if (!isOpen) return null;

  const en = getLang() === "en";
  const userAvatar = session?.user?.user_metadata?.avatar_url;
  const userName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    (isGuest ? (en ? "Guest User" : "مستخدم ضيف") : "Vireon Creator");
  const userEmail = session?.user?.email || (isGuest ? (en ? "Temporary Guest Session" : "جلسة مؤقتة بدون حساب") : "");

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-card/95 border border-border sm:rounded-3xl rounded-t-3xl p-5 shadow-2xl relative animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto no-scrollbar"
        dir={en ? "ltr" : "rtl"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar with title and close button */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-sm text-foreground">
                {en ? "Account Profile" : "الملف الشخصي والحساب"}
              </h2>
              <span className="text-[10px] text-muted-foreground block">
                {en ? "Manage your identity & cloud sync" : "إدارة بيانات حسابك والمزامنة السحابية"}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              playSfx("click");
              onClose();
            }}
            className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-secondary/80 via-secondary/40 to-card border border-border/80 p-4 mb-4">
          <div className="flex items-center gap-3.5 relative z-10">
            <div className="relative">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover border-2 border-primary shadow-md"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center border-2 border-border shadow-inner">
                  <User className="w-7 h-7 text-muted-foreground" />
                </div>
              )}
              <div
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center"
                title={en ? "Online" : "متصل"}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-base font-bold text-foreground truncate">{userName}</p>
                <Crown className="w-4 h-4 text-amber-400 shrink-0" />
              </div>
              {userEmail && <p className="text-xs text-muted-foreground truncate mt-0.5">{userEmail}</p>}
              <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
                <Sparkles className="w-3 h-3" />
                <span>{isGuest ? (en ? "Guest Mode" : "وضع الضيف") : (en ? "Pro AI Creator" : "حساب AI مفعّل")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="bg-secondary/50 border border-border/70 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1 text-primary">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="text-base font-bold text-foreground leading-tight">{projectsCount}</div>
            <div className="text-[10px] text-muted-foreground">{en ? "Projects" : "مشاريعك"}</div>
          </div>

          <div className="bg-secondary/50 border border-border/70 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1 text-indigo-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="text-base font-bold text-foreground leading-tight">Neural</div>
            <div className="text-[10px] text-muted-foreground">{en ? "AI Engine" : "محرك AI"}</div>
          </div>

          <div className="bg-secondary/50 border border-border/70 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1 text-emerald-400">
              <Cloud className="w-4 h-4" />
            </div>
            <div className="text-base font-bold text-emerald-400 leading-tight">
              {isGuest ? (en ? "Local" : "محلي") : (en ? "Active" : "نشط")}
            </div>
            <div className="text-[10px] text-muted-foreground">{en ? "Cloud Sync" : "مزامنة"}</div>
          </div>
        </div>

        {/* Quick Capabilities Highlights */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              {en ? "AI Video Studio & 4K Export" : "استوديو الفيديو وتصدير 4K"}
            </span>
            <span className="font-bold text-primary">{en ? "Enabled" : "متاح"}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              {en ? "Smart Background Removal & DSP" : "عزل الخلفية الذكي والمؤثرات"}
            </span>
            <span className="font-bold text-primary">{en ? "Unlimited" : "غير محدود"}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Navigate to full Settings */}
          <button
            onClick={() => {
              playSfx("click");
              onClose();
              onNavigate("settings");
            }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all active:scale-[0.98] shadow-md shadow-primary/20"
          >
            <Settings className="w-4 h-4" />
            <span>{en ? "Open App Settings" : "فتح إعدادات التطبيق الكاملة"}</span>
          </button>

          {/* Logout or switch */}
          {onLogout && (
            <button
              onClick={() => {
                playSfx("click");
                onClose();
                onLogout();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-secondary hover:bg-destructive/15 text-muted-foreground hover:text-destructive font-medium text-xs transition-colors border border-border/60"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isGuest ? (en ? "Exit Guest Mode" : "الخروج من وضع الضيف") : (en ? "Sign Out" : "تسجيل الخروج")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
