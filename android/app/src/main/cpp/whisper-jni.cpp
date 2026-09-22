#include <jni.h>
#include <string>
#include <vector>
#include <android/log.h>

#define TAG "WhisperJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

#ifdef HAVE_WHISPER_CPP
#include "whisper.h"
#else
// Stub definitions for compilation when whisper.h is dynamically linked or provided
struct whisper_context;
struct whisper_full_params;
#endif

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_vireon_ai_WhisperNative_initContext(JNIEnv *env, jclass clazz, jstring model_path_str) {
    if (!model_path_str) return 0;
    const char *model_path = env->GetStringUTFChars(model_path_str, nullptr);
    LOGI("Initializing whisper context from path: %s", model_path);

#ifdef HAVE_WHISPER_CPP
    struct whisper_context_params cparams = whisper_context_default_params();
    struct whisper_context *ctx = whisper_init_from_file_with_params(model_path, cparams);
    env->ReleaseStringUTFChars(model_path_str, model_path);
    return reinterpret_cast<jlong>(ctx);
#else
    LOGE("whisper.cpp core header not compiled into this binary build");
    env->ReleaseStringUTFChars(model_path_str, model_path);
    return 0;
#endif
}

JNIEXPORT void JNICALL
Java_com_vireon_ai_WhisperNative_freeContext(JNIEnv *env, jclass clazz, jlong context_ptr) {
    if (!context_ptr) return;
#ifdef HAVE_WHISPER_CPP
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    whisper_free(ctx);
    LOGI("Freed whisper context");
#endif
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
    if (!context_ptr || !samples_array || n_samples <= 0) return -1;

#ifdef HAVE_WHISPER_CPP
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    jfloat *samples = env->GetFloatArrayElements(samples_array, nullptr);
    if (!samples) return -2;

    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_realtime   = false;
    params.print_progress   = false;
    params.print_timestamps = false;
    params.print_special    = false;
    params.translate        = (translate == JNI_TRUE);
    params.n_threads        = (n_threads > 0) ? n_threads : 4;
    params.offset_ms        = 0;
    params.no_context       = true;
    params.single_segment   = false;

    const char *lang = nullptr;
    if (language_str) {
        lang = env->GetStringUTFChars(language_str, nullptr);
        params.language = lang;
    } else {
        params.language = "auto";
    }

    int ret = whisper_full(ctx, params, samples, n_samples);

    if (lang) {
        env->ReleaseStringUTFChars(language_str, lang);
    }
    env->ReleaseFloatArrayElements(samples_array, samples, JNI_ABORT);

    return ret;
#else
    return -1;
#endif
}

JNIEXPORT jint JNICALL
Java_com_vireon_ai_WhisperNative_getNumSegments(JNIEnv *env, jclass clazz, jlong context_ptr) {
    if (!context_ptr) return 0;
#ifdef HAVE_WHISPER_CPP
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    return whisper_full_n_segments(ctx);
#else
    return 0;
#endif
}

JNIEXPORT jlong JNICALL
Java_com_vireon_ai_WhisperNative_getSegmentT0(JNIEnv *env, jclass clazz, jlong context_ptr, jint i_segment) {
    if (!context_ptr) return 0;
#ifdef HAVE_WHISPER_CPP
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    return whisper_full_get_segment_t0(ctx);
#else
    return 0;
#endif
}

JNIEXPORT jlong JNICALL
Java_com_vireon_ai_WhisperNative_getSegmentT1(JNIEnv *env, jclass clazz, jlong context_ptr, jint i_segment) {
    if (!context_ptr) return 0;
#ifdef HAVE_WHISPER_CPP
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    return whisper_full_get_segment_t1(ctx);
#else
    return 0;
#endif
}

JNIEXPORT jstring JNICALL
Java_com_vireon_ai_WhisperNative_getSegmentText(JNIEnv *env, jclass clazz, jlong context_ptr, jint i_segment) {
    if (!context_ptr) return env->NewStringUTF("");
#ifdef HAVE_WHISPER_CPP
    auto *ctx = reinterpret_cast<struct whisper_context *>(context_ptr);
    const char *text = whisper_full_get_segment_text(ctx, i_segment);
    return env->NewStringUTF(text ? text : "");
#else
    return env->NewStringUTF("");
#endif
}

} // extern "C"
