import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, ArrowLeft } from "lucide-react";
import { VireonLogo } from "@/components/VireonLogo";
import { getLang } from "@/lib/i18n";

export default function ResetPassword() {
  const navigate = useNavigate();
  const en = getLang() === "en";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Listen for auth state change or check active session
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        // Give Supabase a moment to process recovery token from URL hash
        setTimeout(async () => {
          const { data: retryData } = await supabase.auth.getSession();
          if (retryData.session) {
            setReady(true);
          } else {
            setReady(true); // Allow form rendering, but handle error on submit
          }
        }, 800);
      }
    };
    checkSession();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(en ? "Password must be at least 6 characters." : "كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error(en ? "Passwords do not match." : "كلمتا المرور غير متطابقتين.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success(en ? "Password updated successfully!" : "تم تحديث كلمة المرور بنجاح!");
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 2000);
    } catch (err: any) {
      console.error("[ResetPassword] Error:", err);
      const msg = err?.message?.toLowerCase() || "";
      if (msg.includes("same password")) {
        toast.error(en ? "New password must be different from previous password." : "يجب أن تكون كلمة المرور الجديدة مختلفة عن الحالية.");
      } else if (msg.includes("session")) {
        toast.error(en ? "Reset session expired. Please request a new reset link." : "انتهت صلاحية الجلسة. يرجى طلب رابط إعادة تعيين جديد.");
      } else {
        toast.error(err?.message || (en ? "Failed to update password." : "فشل تحديث كلمة المرور."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-4 py-8" dir={en ? "ltr" : "rtl"}>
      <section className="w-full max-w-sm space-y-6 bg-card border border-border p-6 rounded-2xl shadow-xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <VireonLogo className="w-14 h-14" />
          <h1 className="font-heading text-xl font-bold text-foreground tracking-tight">
            {en ? "Reset Password" : "إعادة تعيين كلمة المرور"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {en ? "Enter your new password for Vireon" : "أدخل كلمة المرور الجديدة لحسابك في Vireon"}
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
            <p className="text-sm font-bold text-foreground">
              {en ? "Password reset complete!" : "تم تغيير كلمة المرور بنجاح!"}
            </p>
            <p className="text-xs text-muted-foreground">
              {en ? "Redirecting to main screen..." : "جارٍ توجيهك إلى الصفحة الرئيسية..."}
            </p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4" noValidate>
            <div className="relative">
              <Lock className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none`} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder={en ? "New password (min 6 chars)" : "كلمة المرور الجديدة (6 أحرف على الأقل)"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full ${en ? "pl-10 pr-10" : "pr-10 pl-10"} py-3 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary`}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label="Toggle password visibility"
                className={`absolute ${en ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-muted-foreground`}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="relative">
              <Lock className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none`} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder={en ? "Confirm new password" : "تأكيد كلمة المرور الجديدة"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full ${en ? "pl-10 pr-10" : "pr-10 pl-10"} py-3 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary`}
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !ready}
              className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{loading ? (en ? "Updating..." : "جارٍ التحديث...") : (en ? "Update Password" : "تحديث كلمة المرور")}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{en ? "Return to Sign In" : "العودة للرئيسية"}</span>
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
