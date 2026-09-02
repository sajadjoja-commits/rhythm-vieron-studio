export interface ParsedCaption {
  start: number;
  end: number;
  text: string;
}

export interface SRTParseResult {
  captions: ParsedCaption[];
  totalBlocks: number;
  parsedCount: number;
  skippedCount: number;
}

/**
 * Parses an SRT timestamp string (e.g. "00:01:23,456" or "00:01:23.456" or "01:23,456") into seconds (float).
 */
export function parseSRTTimestamp(tsStr: string): number | null {
  if (!tsStr) return null;
  const cleaned = tsStr.trim().replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds)) return null;
    return minutes * 60 + seconds;
  }
  return null;
}

/**
 * Parses full SRT file text content into structured caption objects.
 */
export function parseSRT(srtContent: string): SRTParseResult {
  if (!srtContent || !srtContent.trim()) {
    return { captions: [], totalBlocks: 0, parsedCount: 0, skippedCount: 0 };
  }

  // Normalize line endings
  const normalized = srtContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  // Split into blocks by double or multiple newlines
  const rawBlocks = normalized.split(/\n\s*\n/);

  const captions: ParsedCaption[] = [];
  let totalBlocks = 0;
  let skippedCount = 0;

  for (const block of rawBlocks) {
    const lines = block
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;

    totalBlocks++;

    // Find line index containing timestamp arrow "-->"
    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1) {
      skippedCount++;
      continue;
    }

    const timeLine = lines[timeLineIdx];
    const textLines = lines.slice(timeLineIdx + 1);

    if (textLines.length === 0) {
      skippedCount++;
      continue;
    }

    const timeParts = timeLine.split("-->");
    if (timeParts.length !== 2) {
      skippedCount++;
      continue;
    }

    const start = parseSRTTimestamp(timeParts[0]);
    const end = parseSRTTimestamp(timeParts[1]);

    if (start === null || end === null || end < start) {
      skippedCount++;
      continue;
    }

    // Strip HTML formatting tags and ASS/SSA tags
    const rawText = textLines.join(" ");
    const cleanText = rawText
      .replace(/<[^>]*>/g, "")
      .replace(/\{[^}]*\}/g, "")
      .trim();

    if (!cleanText) {
      skippedCount++;
      continue;
    }

    captions.push({
      start: Math.round(start * 1000) / 1000,
      end: Math.round(Math.max(start + 0.3, end) * 1000) / 1000,
      text: cleanText,
    });
  }

  return {
    captions,
    totalBlocks,
    parsedCount: captions.length,
    skippedCount,
  };
}
