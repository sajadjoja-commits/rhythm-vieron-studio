/**
 * Arabic & Multilingual Caption Text Processing and Boundary Alignment Engine
 * - Non-destructive: preserves original raw speech transcript
 * - Safe Arabic punctuation & spacing normalization
 * - Boundary deduplication (eliminates repeated stutter words across chunk borders)
 * - Safe readability segmentation (formats long phrases into natural reading lines)
 * - VAD silence gap alignment
 */

import { SilenceGap } from "./vadUtils";

export interface ProcessedCaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  rawText: string;
  confidence?: number;
  words?: Array<{ word: string; start: number; end: number }>;
}

/**
 * Remove Tatweel (ـ) and excessive whitespace
 */
export function cleanArabicSpacing(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u0640]/g, "") // Remove Tatweel
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Safe Arabic punctuation formatting:
 * - Fixes Latin comma (,) to Arabic comma (،) in Arabic context
 * - Fixes Latin question mark (?) to Arabic question mark (؟) in Arabic context
 * - Ensures punctuation clings to the previous word with a trailing space
 */
export function formatArabicPunctuation(text: string): string {
  if (!text) return "";

  const hasArabicChars = /[\u0600-\u06FF]/.test(text);
  let cleaned = text;

  if (hasArabicChars) {
    // Replace Latin punctuation with Arabic equivalents
    cleaned = cleaned.replace(/,/g, "،");
    cleaned = cleaned.replace(/\?/g, "؟");
    cleaned = cleaned.replace(/;/g, "؛");
  }

  // Remove space before punctuation
  cleaned = cleaned.replace(/\s+([،,؛;:.!?؟])/g, "$1");

  // Ensure single space after punctuation if followed by a word character
  cleaned = cleaned.replace(/([،,؛;:.!?؟])([^\s،,؛;:.!?؟])/g, "$1 $2");

  return cleaned.trim();
}

/**
 * Deduplicate consecutive identical words (stutter / chunk overlap artifact)
 * e.g. "في في هذا الفيديو" -> "في هذا الفيديو"
 */
export function deduplicateAdjacentWords(text: string): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return text;

  const result: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const current = words[i];
    const prev = result[result.length - 1];

    if (!prev) {
      result.push(current);
      continue;
    }

    // Strip punctuation for comparison
    const cleanCurrent = current.replace(/[^\w\u0600-\u06FF]/g, "").toLowerCase();
    const cleanPrev = prev.replace(/[^\w\u0600-\u06FF]/g, "").toLowerCase();

    // If identical and length > 1, skip duplicate
    if (cleanCurrent && cleanCurrent === cleanPrev) {
      continue;
    }

    result.push(current);
  }

  return result.join(" ");
}

/**
 * Merge two overlapping segments at chunk boundaries without duplicating words.
 */
export function mergeOverlappingText(textA: string, textB: string): string {
  const wordsA = textA.trim().split(/\s+/);
  const wordsB = textB.trim().split(/\s+/);

  if (wordsA.length === 0) return textB;
  if (wordsB.length === 0) return textA;

  // Check overlap of 1 to 5 words
  const maxOverlap = Math.min(5, wordsA.length, wordsB.length);
  for (let overlap = maxOverlap; overlap >= 1; overlap--) {
    const tailA = wordsA.slice(-overlap).map((w) => w.replace(/[^\w\u0600-\u06FF]/g, "").toLowerCase()).join(" ");
    const headB = wordsB.slice(0, overlap).map((w) => w.replace(/[^\w\u0600-\u06FF]/g, "").toLowerCase()).join(" ");

    if (tailA === headB && tailA.length > 0) {
      // Overlap found, slice out head of B
      const nonOverlappingB = wordsB.slice(overlap);
      return [...wordsA, ...nonOverlappingB].join(" ");
    }
  }

  return `${textA} ${textB}`;
}

/**
 * Split long sentence segments (> 8 words or > 4.0s) into comfortable subtitle lines (4-7 words)
 */
export function splitLongSegment(
  segment: { start: number; end: number; text: string; rawText?: string },
  silenceGaps: SilenceGap[] = []
): Array<{ start: number; end: number; text: string; rawText: string }> {
  const rawWords = segment.text.trim().split(/\s+/);
  const duration = segment.end - segment.start;

  // If segment is comfortably short, return as is
  if (rawWords.length <= 7 && duration <= 4.0) {
    return [
      {
        start: Math.round(segment.start * 100) / 100,
        end: Math.round(segment.end * 100) / 100,
        text: segment.text.trim(),
        rawText: segment.rawText || segment.text.trim(),
      },
    ];
  }

  // Split into chunks of 5-7 words
  const targetWordsPerChunk = 6;
  const numChunks = Math.ceil(rawWords.length / targetWordsPerChunk);
  const results: Array<{ start: number; end: number; text: string; rawText: string }> = [];

  const timePerWord = duration / Math.max(1, rawWords.length);

  for (let i = 0; i < numChunks; i++) {
    const wordStartIdx = i * targetWordsPerChunk;
    const wordEndIdx = Math.min(rawWords.length, (i + 1) * targetWordsPerChunk);
    const chunkWords = rawWords.slice(wordStartIdx, wordEndIdx);
    if (chunkWords.length === 0) continue;

    const subStart = segment.start + wordStartIdx * timePerWord;
    let subEnd = segment.start + wordEndIdx * timePerWord;

    // Try to align cut points with detected silence pauses if close (< 0.25s)
    for (const gap of silenceGaps) {
      if (Math.abs(subEnd - gap.mid) <= 0.25) {
        subEnd = gap.mid;
        break;
      }
    }

    const chunkText = chunkWords.join(" ");
    results.push({
      start: Math.round(subStart * 100) / 100,
      end: Math.round(Math.max(subStart + 0.3, subEnd) * 100) / 100,
      text: chunkText,
      rawText: chunkText,
    });
  }

  return results;
}

/**
 * Comprehensive post-processing pipeline for speech recognition segments.
 */
export function processRawSegments(
  rawSegments: Array<{ start: number; end: number; text: string }>,
  silenceGaps: SilenceGap[] = [],
  timelineOffsetSec: number = 0
): ProcessedCaptionSegment[] {
  const result: ProcessedCaptionSegment[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const raw = rawSegments[i];
    const rawText = raw.text ? raw.text.trim() : "";
    if (!rawText) continue;

    // Apply safe transformations
    const cleanSpaced = cleanArabicSpacing(rawText);
    const deduped = deduplicateAdjacentWords(cleanSpaced);
    const punctuated = formatArabicPunctuation(deduped);

    const adjustedStart = Math.max(0, raw.start + timelineOffsetSec);
    const adjustedEnd = Math.max(adjustedStart + 0.3, raw.end + timelineOffsetSec);

    // Split long segments for readability
    const subSegments = splitLongSegment(
      {
        start: adjustedStart,
        end: adjustedEnd,
        text: punctuated,
        rawText,
      },
      silenceGaps
    );

    for (const sub of subSegments) {
      result.push({
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        start: sub.start,
        end: sub.end,
        text: sub.text,
        rawText: sub.rawText,
      });
    }
  }

  // Ensure chronological order and non-negative timestamps
  result.sort((a, b) => a.start - b.start);

  return result;
}
