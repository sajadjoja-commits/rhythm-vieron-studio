package com.vireon.ai;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Phase 9: Native Background Job Processor for Android.
 * 
 * Manages long-running background operations (large exports, model downloads,
 * proxy video generation, frame processing).
 * - Holds partial WakeLock to prevent CPU throttling when app is backgrounded.
 * - Posts persistent status notification to Android status bar.
 * - Supports real cancellation and progress reporting.
 */
@CapacitorPlugin(name = "VireonBackgroundJob")
public class VireonBackgroundJobPlugin extends Plugin {
    private static final String TAG = "VireonBgJob";
    private static final String CHANNEL_ID = "vieron_background_jobs";
    private static final String CHANNEL_NAME = "Vieron Background Tasks";

    private final ConcurrentHashMap<String, PowerManager.WakeLock> mWakeLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, JobState> mActiveJobs = new ConcurrentHashMap<>();
    private NotificationManager mNotificationManager;

    private static class JobState {
        final String jobId;
        final String title;
        final String taskType;
        int progress;
        String stageMessage;
        boolean cancelled;

        JobState(String jobId, String title, String taskType) {
            this.jobId = jobId;
            this.title = title;
            this.taskType = taskType;
            this.progress = 0;
            this.stageMessage = "Starting...";
            this.cancelled = false;
        }
    }

    @Override
    public void load() {
        super.load();
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background media and AI processing operations in Vieron Studio");
            mNotificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (mNotificationManager != null) {
                mNotificationManager.createNotificationChannel(channel);
            }
        } else {
            mNotificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        }
    }

    @PluginMethod
    public void startBackgroundJob(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null || jobId.trim().isEmpty()) {
            call.reject("jobId is required", "INVALID_ARGUMENT");
            return;
        }

        String title = call.getString("title", "Processing in Background");
        String taskType = call.getString("taskType", "general");

        try {
            // 1. Acquire WakeLock (max 15 minutes safeguard)
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "VieronStudio:Job:" + jobId
                );
                wl.setReferenceCounted(false);
                wl.acquire(15 * 60 * 1000L); // 15 min safety timeout
                mWakeLocks.put(jobId, wl);
            }

            // 2. Register job state
            JobState state = new JobState(jobId, title, taskType);
            mActiveJobs.put(jobId, state);

            // 3. Post initial notification
            updateNotification(state);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("jobId", jobId);
            ret.put("status", "running");
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "Failed to start background job: " + jobId, e);
            call.reject("Failed to start background job: " + e.getMessage(), "START_FAILED");
        }
    }

    @PluginMethod
    public void updateBackgroundJob(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null) {
            call.reject("jobId is required", "INVALID_ARGUMENT");
            return;
        }

        JobState state = mActiveJobs.get(jobId);
        if (state == null) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Job not active or already finished");
            call.resolve(ret);
            return;
        }

        int progress = call.getInt("progress", state.progress);
        String stageMessage = call.getString("stageMessage", state.stageMessage);

        state.progress = Math.max(0, Math.min(100, progress));
        state.stageMessage = stageMessage;

        updateNotification(state);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("jobId", jobId);
        ret.put("isCancelled", state.cancelled);
        call.resolve(ret);
    }

    @PluginMethod
    public void finishBackgroundJob(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null) {
            call.reject("jobId is required", "INVALID_ARGUMENT");
            return;
        }

        cleanUpJob(jobId);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("jobId", jobId);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelBackgroundJob(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null) {
            call.reject("jobId is required", "INVALID_ARGUMENT");
            return;
        }

        JobState state = mActiveJobs.get(jobId);
        if (state != null) {
            state.cancelled = true;
        }

        cleanUpJob(jobId);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("jobId", jobId);
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getActiveJobs(PluginCall call) {
        JSArray jobs = new JSArray();
        for (JobState state : mActiveJobs.values()) {
            JSObject item = new JSObject();
            item.put("jobId", state.jobId);
            item.put("title", state.title);
            item.put("taskType", state.taskType);
            item.put("progress", state.progress);
            item.put("stageMessage", state.stageMessage);
            item.put("isCancelled", state.cancelled);
            jobs.put(item);
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("jobs", jobs);
        ret.put("count", mActiveJobs.size());
        call.resolve(ret);
    }

    private void updateNotification(JobState state) {
        if (mNotificationManager == null) return;
        try {
            int notifId = Math.abs(state.jobId.hashCode());
            NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(state.title)
                .setContentText(state.stageMessage)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setProgress(100, state.progress, state.progress == 0);

            mNotificationManager.notify(notifId, builder.build());
        } catch (Exception e) {
            Log.w(TAG, "Notification post failed (permission might be pending)", e);
        }
    }

    private void cleanUpJob(String jobId) {
        mActiveJobs.remove(jobId);

        PowerManager.WakeLock wl = mWakeLocks.remove(jobId);
        if (wl != null && wl.isHeld()) {
            try {
                wl.release();
            } catch (Throwable ignored) {}
        }

        if (mNotificationManager != null) {
            try {
                int notifId = Math.abs(jobId.hashCode());
                mNotificationManager.cancel(notifId);
            } catch (Throwable ignored) {}
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (String jobId : mActiveJobs.keySet()) {
            cleanUpJob(jobId);
        }
        super.handleOnDestroy();
    }
}
