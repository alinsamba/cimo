import type { SubtitleCue } from '../../core/types';

/**
 * Parses WebVTT timestamp (mm:ss.ttt or hh:mm:ss.ttt) into seconds.
 */
export function parseVTTTimestamp(timeStr: string): number {
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

type Alignment = NonNullable<SubtitleCue['style']>['alignment'];

/**
 * Parses WebVTT cue settings (e.g. line:0% position:50% align:center size:80%) into SubtitleCue style.
 */
export function parseVTTCueSettings(settingsStr: string): NonNullable<SubtitleCue['style']> {
  const style: NonNullable<SubtitleCue['style']> = {};
  if (!settingsStr) return style;

  const settings = settingsStr.trim().split(/\s+/);
  let horizAlign: 'left' | 'center' | 'right' = 'center';
  let vertAlign: 'top' | 'mid' | 'bot' = 'bot';

  for (const setting of settings) {
    const [key, value] = setting.split(':');
    if (!key || !value) continue;

    switch (key.toLowerCase()) {
      case 'align': {
        const val = value.toLowerCase();
        if (val === 'start' || val === 'left') {
          horizAlign = 'left';
        } else if (val === 'end' || val === 'right') {
          horizAlign = 'right';
        } else {
          horizAlign = 'center';
        }
        break;
      }
      case 'line': {
        if (value.endsWith('%')) {
          const pct = parseFloat(value);
          if (!isNaN(pct)) {
            if (pct <= 20) {
              vertAlign = 'top';
            } else if (pct < 75) {
              vertAlign = 'mid';
            } else {
              vertAlign = 'bot';
            }
          }
        } else {
          const lineNum = parseFloat(value);
          if (!isNaN(lineNum)) {
            if (lineNum >= 0 && lineNum <= 2) {
              vertAlign = 'top';
            } else if (lineNum > 2 && lineNum < 8) {
              vertAlign = 'mid';
            } else {
              vertAlign = 'bot';
            }
          }
        }
        break;
      }
      case 'position': {
        const posMatch = value.match(/^(\d+(?:\.\d+)?%?)/);
        if (posMatch && posMatch[1]) {
          const num = parseFloat(posMatch[1]);
          if (!isNaN(num) && style.marginH === undefined) {
            style.marginH = num;
          }
        }
        break;
      }
      case 'size': {
        const sizeMatch = value.match(/^(\d+(?:\.\d+)?%?)/);
        if (sizeMatch && sizeMatch[1]) {
          const num = parseFloat(sizeMatch[1]);
          if (!isNaN(num)) {
            // Could set custom style property if needed
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const alignment = `${vertAlign}-${horizAlign}` as Alignment;
  style.alignment = alignment;

  return style;
}

/**
 * Cleans WebVTT payload text:
 * - Replaces <v VoiceName>text</v> with voice span or speaker prefix
 * - Strips intra-cue timestamps like <00:19.000>
 * - Converts <c.class> into <span class="class">
 * - Converts newlines to <br/>
 */
export function cleanVTTText(rawText: string): string {
  let cleaned = rawText;

  // Replace intra-cue timestamps <00:00.000> or <00:00:00.000>
  cleaned = cleaned.replace(/<\d{2}:(?:\d{2}:)?\d{2}\.\d{3}>/g, '');

  // Convert voice tags <v Speaker Name>text</v> or <v Speaker>text
  cleaned = cleaned.replace(/<v\s+([^>]+)>([\s\S]*?)(?:<\/v>|$)/gi, (_match, speaker: string, content: string) => {
    return `<span class="vtt-voice" data-speaker="${speaker.trim()}">${content}</span>`;
  });

  // Convert <c.className> to <span class="className">
  cleaned = cleaned.replace(/<c\.([^>]+)>([\s\S]*?)<\/c>/gi, (_match, className: string, content: string) => {
    return `<span class="${className.trim()}">${content}</span>`;
  });

  // Normalize line endings to <br/>
  cleaned = cleaned
    .replace(/\r\n|\r|\n/g, '\n')
    .trim()
    .replace(/\n/g, '<br/>');

  return cleaned;
}

/**
 * Parses WebVTT (.vtt) subtitle content into an array of SubtitleCue objects.
 * Handles WEBVTT header, NOTE/STYLE blocks, cue settings, and timestamps.
 *
 * @param content The raw WebVTT file content string.
 * @returns Array of parsed SubtitleCue items sorted by start time.
 */
export function parseWebVTT(content: string): SubtitleCue[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // Remove BOM and normalize line endings
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
  const lines = normalized.split('\n');

  const cues: SubtitleCue[] = [];
  let index = 0;

  // Verify and skip WEBVTT header
  if (lines.length === 0) return [];
  const firstLine = lines[0]?.trim() ?? '';
  if (!firstLine.startsWith('WEBVTT')) {
    // Attempt fallback parsing even if header is slightly malformed
  }
  index++;

  let currentId: string | undefined = undefined;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let currentSettings = '';
  let currentTextLines: string[] = [];
  let isSkippingBlock = false;

  function flushCue(): void {
    if (currentStart !== null && currentEnd !== null && currentTextLines.length > 0) {
      const rawText = currentTextLines.join('\n').trim();
      if (rawText.length > 0) {
        const style = parseVTTCueSettings(currentSettings);

        const isBold = /<\/?b>/i.test(rawText);
        const isItalic = /<\/?i>/i.test(rawText);
        const isUnderline = /<\/?u>/i.test(rawText);

        if (isBold) style.bold = true;
        if (isItalic) style.italic = true;
        if (isUnderline) style.underline = true;

        const cue: SubtitleCue = {
          id: currentId,
          startTime: currentStart,
          endTime: currentEnd,
          text: cleanVTTText(rawText),
          rawText,
          ...(Object.keys(style).length > 0 ? { style } : {}),
        };

        cues.push(cue);
      }
    }

    currentId = undefined;
    currentStart = null;
    currentEnd = null;
    currentSettings = '';
    currentTextLines = [];
  }

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? '';
    const trimmed = line.trim();

    // Check for NOTE, STYLE, or REGION comment blocks
    if (
      currentStart === null &&
      (trimmed.startsWith('NOTE') || trimmed.startsWith('STYLE') || trimmed.startsWith('REGION'))
    ) {
      isSkippingBlock = true;
      index++;
      continue;
    }

    if (isSkippingBlock) {
      if (trimmed === '') {
        isSkippingBlock = false;
      }
      index++;
      continue;
    }

    // Check for timestamp line
    if (trimmed.includes('-->')) {
      if (currentStart !== null) {
        flushCue();
      }

      const match = trimmed.match(
        /^((?:\d{1,2}:)?\d{1,2}:\d{2}\.\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}\.\d{1,3})(?:[ \t]+(.*))?$/
      );

      if (match && match[1] && match[2]) {
        currentStart = parseVTTTimestamp(match[1]);
        currentEnd = parseVTTTimestamp(match[2]);
        currentSettings = match[3]?.trim() ?? '';
        index++;
        continue;
      }
    }

    if (currentStart !== null) {
      if (trimmed === '') {
        flushCue();
      } else {
        currentTextLines.push(line);
      }
    } else {
      if (trimmed !== '') {
        currentId = trimmed;
      }
    }

    index++;
  }

  // Flush trailing cue
  flushCue();

  return cues.sort((a, b) => a.startTime - b.startTime);
}

export const parseVTT = parseWebVTT;
