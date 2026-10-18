import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelStore } from '../src/ai/models/ModelStore';

describe('ModelStore: Resumption, Hash Verification, Cancellation and Session Management', () => {
  let modelStore: ModelStore;

  beforeEach(() => {
    modelStore = ModelStore.getInstance();
    vi.restoreAllMocks();
  });

  it('verifies SHA-256 correctly and rejects invalid hash', async () => {
    const data = new TextEncoder().encode('valid-model-weights');
    // SHA-256 of 'valid-model-weights'
    // Let's compute with Web Crypto
    const expectedBuffer = await crypto.subtle.digest('SHA-256', data.buffer);
    const expectedHex = Array.from(new Uint8Array(expectedBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const isValid = await modelStore.verifySha256(data.buffer, expectedHex);
    expect(isValid).toBe(true);

    const isInvalid = await modelStore.verifySha256(data.buffer, 'deadbeef1234567890');
    expect(isInvalid).toBe(false);
  });

  it('deletes model from cache upon SHA-256 mismatch during download', async () => {
    const deleteSpy = vi.spyOn(modelStore, 'deleteModel').mockResolvedValue();

    // Mock fetch to return some dummy data
    const dummyBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-length': '8' }),
      body: {
        getReader: () => {
          let readOnce = false;
          return {
            read: async () => {
              if (!readOnce) {
                readOnce = true;
                return { done: false, value: dummyBytes };
              }
              return { done: true, value: undefined };
            }
          };
        }
      }
    } as unknown as Response);

    // Provide incorrect expected hash
    await expect(
      modelStore.downloadModel('corrupt-model', 'https://example.com/model.bin', 'incorrect-hash-1234')
    ).rejects.toThrow(/SHA-256 hash mismatch/);

    // Verify file deletion was immediately triggered!
    expect(deleteSpy).toHaveBeenCalledWith('corrupt-model');
  });

  it('supports cancellation via cancelDownload / AbortSignal', async () => {
    // Mock fetch that hangs or checks signal
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException('The user aborted a request.', 'AbortError'));
          return;
        }
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
      });
    });

    const downloadPromise = modelStore.downloadModel('cancel-test-model', 'https://example.com/test.bin');
    // Cancel immediately
    modelStore.cancelDownload('cancel-test-model');

    await expect(downloadPromise).rejects.toThrow(/cancelled/i);
  });

  it('manages sessions with reuse and 60s idle auto-release', async () => {
    vi.useFakeTimers();

    let disposeCalled = false;
    const sessionObj = { handle: 42 };

    const factory = vi.fn().mockResolvedValue(sessionObj);
    const disposeFn = vi.fn().mockImplementation(() => {
      disposeCalled = true;
    });

    // 1. Acquire session: calls factory
    const s1 = await modelStore.acquireSession('test-session', factory, disposeFn);
    expect(s1).toBe(sessionObj);
    expect(factory).toHaveBeenCalledTimes(1);

    // 2. Immediate second call reuses session without recreating
    const s2 = await modelStore.acquireSession('test-session', factory, disposeFn);
    expect(s2).toBe(sessionObj);
    expect(factory).toHaveBeenCalledTimes(1);

    // 3. Advance time by 30 seconds: session should still be alive
    vi.advanceTimersByTime(30_000);
    expect(disposeCalled).toBe(false);

    // 4. Advance time past 60 seconds of idle time: session should be released!
    vi.advanceTimersByTime(35_000);
    expect(disposeCalled).toBe(true);
    expect(disposeFn).toHaveBeenCalledWith(sessionObj);

    vi.useRealTimers();
  });
});
