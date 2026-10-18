import { useState, useEffect } from "react";
import { Loader2, CheckCircle, AlertCircle, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { triggerHapticNotification } from "@/lib/haptics";

interface ExportProgress {
  stage: "loading" | "encoding" | "muxing" | "complete" | "error";
  progress: number;
  message: string;
}

interface Props {
  open: boolean;
  progress: ExportProgress | null;
  onDownload?: () => void;
  onClose?: () => void;
}

const ExportProgressDialog = ({ open, progress, onDownload, onClose }: Props) => {
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    if (progress?.stage === "complete") {
      setCanClose(true);
      triggerHapticNotification("success");
    } else if (progress?.stage === "error") {
      setCanClose(true);
      triggerHapticNotification("error");
    } else {
      setCanClose(false);
    }
  }, [progress?.stage]);

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "loading":
        return "جاري التحضير";
      case "encoding":
        return "جاري التحويل";
      case "muxing":
        return "جاري الدمج";
      case "complete":
        return "تم بنجاح";
      case "error":
        return "خطأ";
      default:
        return "جاري المعالجة";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && canClose) {
        onClose?.();
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {progress?.stage === "complete" ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                تم التصدير بنجاح
              </>
            ) : progress?.stage === "error" ? (
              <>
                <AlertCircle className="w-5 h-5 text-red-500" />
                خطأ في التصدير
              </>
            ) : (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {getStageLabel(progress?.stage || "")}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{progress?.message}</span>
              <span className="font-semibold">{progress?.progress || 0}%</span>
            </div>
            <Progress value={progress?.progress || 0} className="h-2" />
          </div>

          {/* Stage Indicators */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            {["loading", "encoding", "muxing", "complete"].map((stage) => {
              const stageIndex = ["loading", "encoding", "muxing", "complete"].indexOf(stage);
              const currentStageIndex = ["loading", "encoding", "muxing", "complete"].indexOf(progress?.stage || "loading");
              const isActive = stageIndex <= currentStageIndex;
              const isComplete = stageIndex < currentStageIndex;

              return (
                <div
                  key={stage}
                  className={`p-2 rounded-lg text-center font-medium transition ${
                    isComplete
                      ? "bg-green-500/20 text-green-700"
                      : isActive
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {stage === "loading" ? "تحضير" : stage === "encoding" ? "تحويل" : stage === "muxing" ? "دمج" : "انتهاء"}
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          {progress?.stage === "complete" && (
            <div className="flex gap-2 pt-4">
              <button
                onClick={onDownload}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition"
              >
                <Download className="w-4 h-4" />
                تحميل الفيديو
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition"
              >
                إغلاق
              </button>
            </div>
          )}

          {progress?.stage === "error" && (
            <div className="flex gap-2 pt-4">
              <button
                onClick={onClose}
                className="w-full py-2 rounded-lg bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportProgressDialog;
