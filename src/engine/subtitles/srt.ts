import type { SubtitleCue } from '../../core/types';

/**
 * Parses timestamp strings into seconds.
 * Supports formats:
 * - 00:00:00,000 or 00:00:00.000 (hh:mm:ss,ms)
 * - 00:00,000 or 00:00.000 (mm:ss,ms)
 */
export function parseSRTTimestamp(timeStr: string): number {
  const trimmed = timeStr.trim().replace(',', '.');
  const parts = trimmed.split(':');
  
  if (parts.length === 3) {
    const hours = parseFloat(parts[0] ?? '0');
    const minutes = parseFloat(parts[1] ?? '0');
    const seconds = parseFloat(parts[2] ?? '0');
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0] ?? '0');
    const seconds = parseFloat(parts[1] ?? '0');
    return minutes * 60 + seconds;
  } else if (parts.length === 1) {
    return parseFloat(parts[0] ?? '0');
  }
  
  return 0;
}

/**
 * Extracts alignment from SRT SSA-style tags like {\an1} - {\an9}.
 */
function extractAlignmentFromTags(text: string): SubtitleCue['style'] extends undefined ? never : NonNullable<SubtitleCue['style']>['alignment'] | undefined {
  const anMatch = text.match(/\{\\an([1-9])\}/);
  if (anMatch && anMatch[1]) {
    const num = parseInt(anMatch[1], 10);
    switch (num) {
      case 1: return 'bot-left';
      case 2: return 'bot-center';
      case 3: return 'bot-right';
      case 4: return 'mid-left';
      case 5: return 'mid-center';
      case 6: return 'mid-right';
      case 7: return 'top-left';
      case 8: return 'top-center';
      case 9: return 'top-right';
      default: break;
    }
  }
  return undefined;
}

/**
 * Extracts color from <font color="..."> tag if present.
 */
function extractColorFromTags(text: string): string | undefined {
  const colorMatch = text.match(/<font[^>]+color=["']?([^"'>]+)["']?[^>]*>/i);
  if (colorMatch && colorMatch[1]) {
    return colorMatch[1];
  }
  return undefined;
}

/**
 * Sanitizes and cleans SRT text:
 * - Strips {\anX} and other SSA override tags
 * - Converts newlines to <br/>
 * - Preserves allowed HTML tags (<b>, <i>, <u>, <s>, <font>, <span>)
 */
export function cleanSRTText(rawText: string): string {
  // Strip {\anX} and other curly-brace tags
  let cleaned = rawText.replace(/\{[^}]+\}/g, '');
  
  // Normalize whitespace around newlines and replace with <br/>
  cleaned = cleaned
    .replace(/\r\n|\r|\n/g, '\n')
    .trim()
    .replace(/\n/g, '<br/>');
  
  return cleaned;
}

/**
 * Parses SubRip (.srt) subtitle content into an array of SubtitleCue objects.
 * Handles multi-line cues, timing formats, and HTML/formatting tags.
 *
 * @param content The raw SRT file content string.
 * @returns Array of parsed SubtitleCue items sorted by start time.
 */
export function parseSubRip(content: string): SubtitleCue[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // Remove BOM if present and normalize line endings
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
  const lines = normalized.split('\n');

  const cues: SubtitleCue[] = [];
  let currentId: string | undefined = undefined;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let currentTextLines: string[] = [];

  const timeRegex = /^(?:(\d+)\s+)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})(?:[ \t]+.*)?$/;

  function flushCue(): void {
    if (currentStart !== null && currentEnd !== null && currentTextLines.length > 0) {
      const rawText = currentTextLines.join('\n').trim();
      if (rawText.length > 0) {
        const alignment = extractAlignmentFromTags(rawText);
        const color = extractColorFromTags(rawText);
        const strippedOfBraces = rawText.replace(/\{[^}]+\}/g, '').trim();
        const isBold = /<\/?b>/i.test(strippedOfBraces) || /\{\\b1\}/.test(rawText);
        const isItalic = /<\/?i>/i.test(strippedOfBraces) || /\{\\i1\}/.test(rawText);
        const isUnderline = /<\/?u>/i.test(strippedOfBraces) || /\{\\u1\}/.test(rawText);

        const style: NonNullable<SubtitleCue['style']> = {};
        if (alignment) style.alignment = alignment;
        if (color) style.color = color;
        if (isBold) style.bold = true;
        if (isItalic) style.italic = true;
        if (isUnderline) style.underline = true;

        const cue: SubtitleCue = {
          id: currentId,
          startTime: currentStart,
          endTime: currentEnd,
          text: cleanSRTText(rawText),
          rawText,
          ...(Object.keys(style).length > 0 ? { style } : {}),
        };

        cues.push(cue);
      }
    }

    currentId = undefined;
    currentStart = null;
    currentEnd = null;
    currentTextLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trimEnd() ?? '';
    const trimmed = line.trim();

    // Check for timestamp line
    if (trimmed.includes('-->')) {
      // If we already had an active cue being collected, flush it
      if (currentStart !== null) {
        flushCue();
      }

      const match = trimmed.match(
        /^((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/
      );

      if (match && match[1] && match[2]) {
        currentStart = parseSRTTimestamp(match[1]);
        currentEnd = parseSRTTimestamp(match[2]);
        continue;
      }
    }

    if (currentStart !== null) {
      // We are collecting text for the current cue
      if (trimmed === '') {
        // Blank line ends the cue block
        flushCue();
      } else {
        currentTextLines.push(line);
      }
    } else {
      // We are before the timestamp line, this might be a cue index/identifier
      if (trimmed !== '') {
        currentId = trimmed;
      }
    }
  }

  // Flush any trailing cue at EOF
  flushCue();

  // Sort cues by start time
  return cues.sort((a, b) => a.startTime - b.startTime);
}

export const parseSRT = parseSubRip;
