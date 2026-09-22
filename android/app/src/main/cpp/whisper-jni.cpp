#include <jni.h>
#include <string>
#include <vector>
#include <atomic>
#include <mutex>
#include <map>
#include <android/log.h>

#include "whisper.h"
#include "ggml.h"

#define TAG "WhisperJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static std::mutex g_cancel_mutex;
static std::map<jlong, std::atomic<bool>*> g_active_transcriptions;

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_vireon_ai_WhisperNative_initContext(JNIEnv *env, jclass clazz, jstring model_path_str) {
    if (!model_path_str) return 0;
    const char *model_path = env->GetStringUTFChars(model_path_str, nullptr);
    if (!model_path) return 0;

    LOGI("Initializing native whisper context from path: %s", model_path);

    struct whisper_context_params cparams = whisper_context_default_params();
    struct whisper_context *ctx = whisper_init_from_file_with_params(model_path, cparams);

    env->ReleaseStringUTFChars(model_path_str, model_path);

    if (!ctx) {
        LOGE("whisper_init_from_file_with_params failed for path: %s", model_path);
        return 0;
    }

    LOGI("Successfully initialized native whisper context at %p", ctx);
    return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT void JNICALL
Java_com_vireon_ai_WhisperNative_freeContext(JNIEnv *env, jclass clazz, jlong context_ptr) {
    if (!context_ptr) return;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    whisper_free(ctx);
    LOGI("Freed native whisper context %p", ctx);
}

JNIEXPORT void JNICALL
Java_com_vireon_ai_WhisperNative_cancelTranscription(JNIEnv *env, jclass clazz, jlong context_ptr) {
    std::lock_guard<std::mutex> lock(g_cancel_mutex);
    auto it = g_active_transcriptions.find(context_ptr);
    if (it != g_active_transcriptions.end() && it->second != nullptr) {
        LOGI("Cancelling active native Whisper transcription for ctx %lld", (long long)context_ptr);
        it->second->store(true, std::memory_order_relaxed);
    }
}

JNIEXPORT jint JNICALL
Java_com_vireon_ai_WhisperNative_fullTranscribe(
    JNIEnv *env,
    jclass clazz,
    jlong context_ptr,
    jfloatArray samples_array,
    jint n_samples,
    jstring language_str,
    jint n_threads,
    jboolean translate
) {
    if (!context_ptr || !samples_array || n_samples <= 0) {
        LOGE("Invalid arguments provided to fullTranscribe");
        return -1;
    }

    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    jfloat *samples = env->GetFloatArrayElements(samples_array, nullptr);
    if (!samples) {
        LOGE("Failed to get float array elements from JNI");
        return -2;
    }

    struct whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_realtime   = false;
    params.print_progress   = false;
    params.print_timestamps = false;
    params.print_special    = false;
    params.translate        = (translate == JNI_TRUE);
    params.n_threads        = (n_threads > 0) ? n_threads : 4;
    params.offset_ms        = 0;
    params.no_context       = true;
    params.single_segment   = false;

    // Responsive native cancellation via whisper.cpp abort_callback
    std::atomic<bool> cancel_flag(false);
    {
        std::lock_guard<std::mutex> lock(g_cancel_mutex);
        g_active_transcriptions[context_ptr] = &cancel_flag;
    }

    params.abort_callback = [](void *user_data) -> bool {
        auto *flag = reinterpret_cast<std::atomic<bool>*>(user_data);
        return (flag != nullptr && flag->load(std::memory_order_relaxed));
    };
    params.abort_callback_user_data = &cancel_flag;

    const char *lang = nullptr;
    if (language_str) {
        lang = env->GetStringUTFChars(language_str, nullptr);
        params.language = lang;
    } else {
        params.language = "auto";
    }

    LOGI("Running native whisper_full inference with %d samples, %d threads, lang=%s",
         n_samples, params.n_threads, params.language);

    int ret = whisper_full(ctx, params, samples, n_samples);

    {
        std::lock_guard<std::mutex> lock(g_cancel_mutex);
        g_active_transcriptions.erase(context_ptr);
    }

    if (lang) {
        env->ReleaseStringUTFChars(language_str, lang);
    }
    env->ReleaseFloatArrayElements(samples_array, samples, JNI_ABORT);

    if (ret != 0) {
        LOGW("whisper_full returned status code: %d", ret);
    } else {
        LOGI("whisper_full completed successfully. Segments extracted: %d", whisper_full_n_segments(ctx));
    }

    return ret;
}

JNIEXPORT jint JNICALL
Java_com_vireon_ai_WhisperNative_getNumSegments(JNIEnv *env, jclass clazz, jlong context_ptr) {
    if (!context_ptr) return 0;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    return whisper_full_n_segments(ctx);
}

JNIEXPORT jlong JNICALL
Java_com_vireon_ai_WhisperNative_getSegmentT0(JNIEnv *env, jclass clazz, jlong context_ptr, jint i_segment) {
    if (!context_ptr) return 0;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    return whisper_full_get_segment_t0(ctx, i_segment);
}

JNIEXPORT jlong JNICALL
Java_com_vireon_ai_WhisperNative_getSegmentT1(JNIEnv *env, jclass clazz, jlong context_ptr, jint i_segment) {
    if (!context_ptr) return 0;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    return whisper_full_get_segment_t1(ctx, i_segment);
}

JNIEXPORT jstring JNICALL
Java_com_vireon_ai_WhisperNative_getSegmentText(JNIEnv *env, jclass clazz, jlong context_ptr, jint i_segment) {
    if (!context_ptr) return env->NewStringUTF("");
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    const char *text = whisper_full_get_segment_text(ctx, i_segment);
    return env->NewStringUTF(text ? text : "");
}

JNIEXPORT jfloat JNICALL
Java_com_vireon_ai_WhisperNative_getSegmentConfidence(JNIEnv *env, jclass clazz, jlong context_ptr, jint i_segment) {
    if (!context_ptr) return 0.95f;
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    int n_tokens = whisper_full_n_tokens(ctx, i_segment);
    if (n_tokens <= 0) return 0.95f;

    float sum_p = 0.0f;
    for (int t = 0; t < n_tokens; ++t) {
        sum_p += whisper_full_get_token_p(ctx, i_segment, t);
    }
    return sum_p / static_cast<float>(n_tokens);
}

JNIEXPORT jstring JNICALL
Java_com_vireon_ai_WhisperNative_getSystemInfo(JNIEnv *env, jclass clazz) {
    const char *info = whisper_print_system_info();
    return env->NewStringUTF(info ? info : "whisper.cpp");
}

} // extern "C"
