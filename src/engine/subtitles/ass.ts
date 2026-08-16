import type { SubtitleCue } from '../../core/types';

export interface ASSStyle {
  name: string;
  fontName?: string;
  fontSize?: number;
  primaryColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  alignment?: NonNullable<SubtitleCue['style']>['alignment'];
  marginL?: number;
  marginR?: number;
  marginV?: number;
}

export interface ASSScriptInfo {
  title?: string;
  playResX?: number;
  playResY?: number;
  scriptType?: string;
  wrapStyle?: number;
}

/**
 * Converts ASS timestamp (h:mm:ss.cs or hh:mm:ss.ms) to seconds.
 */
export function parseASSTimestamp(timeStr: string): number {
  const trimmed = timeStr.trim();
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
  }

  return 0;
}

/**
 * Converts ASS color code (&HAABBGGRR / &HBBGGRR / integer) to CSS color string (#rrggbb or rgba(r,g,b,a)).
 */
export function parseASSColor(colorStr: string): string | undefined {
  if (!colorStr) return undefined;
  let clean = colorStr.trim().replace(/^&H|&$/gi, '').replace(/^#/, '');

  // Handle decimal integer representations if any (e.g. -2147483648 or 16777215)
  if (/^-?\d+$/.test(clean) && !/[a-fA-F]/.test(clean)) {
    const num = parseInt(clean, 10);
    const u32 = num >>> 0;
    clean = u32.toString(16).padStart(8, '0');
  }

  if (clean.length < 6) {
    clean = clean.padStart(6, '0');
  }

  if (clean.length === 6) {
    // BBGGRR
    const bb = parseInt(clean.slice(0, 2), 16) || 0;
    const gg = parseInt(clean.slice(2, 4), 16) || 0;
    const rr = parseInt(clean.slice(4, 6), 16) || 0;
    const rHex = rr.toString(16).padStart(2, '0');
    const gHex = gg.toString(16).padStart(2, '0');
    const bHex = bb.toString(16).padStart(2, '0');
    return `#${rHex}${gHex}${bHex}`;
  } else if (clean.length >= 8) {
    // AABBGGRR
    const aa = parseInt(clean.slice(0, 2), 16) || 0;
    const bb = parseInt(clean.slice(2, 4), 16) || 0;
    const gg = parseInt(clean.slice(4, 6), 16) || 0;
    const rr = parseInt(clean.slice(6, 8), 16) || 0;

    // In ASS, alpha 00 is fully opaque (1.0), FF is fully transparent (0.0)
    const alpha = Math.round(((255 - aa) / 255) * 1000) / 1000;
    if (alpha >= 1) {
      const rHex = rr.toString(16).padStart(2, '0');
      const gHex = gg.toString(16).padStart(2, '0');
      const bHex = bb.toString(16).padStart(2, '0');
      return `#${rHex}${gHex}${bHex}`;
    } else {
      return `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
    }
  }

  return undefined;
}

/**
 * Maps ASS (v4+) numpad alignment (1-9) to standard alignment type.
 */
export function mapASSAlignment(num: number): NonNullable<SubtitleCue['style']>['alignment'] {
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
    default: return 'bot-center';
  }
}

/**
 * Maps SSA (v4) alignment (1-11) to standard alignment type.
 */
export function mapSSAAlignment(num: number): NonNullable<SubtitleCue['style']>['alignment'] {
  switch (num) {
    case 1: return 'bot-left';
    case 2: return 'bot-center';
    case 3: return 'bot-right';
    case 5: return 'top-left';
    case 6: return 'top-center';
    case 7: return 'top-right';
    case 9: return 'mid-left';
    case 10: return 'mid-center';
    case 11: return 'mid-right';
    default: return 'bot-center';
  }
}

/**
 * Converts ASS dialogue override tags into formatted HTML and extracts cue styles.
 */
export function formatASSText(rawText: string, baseStyle?: ASSStyle): {
  html: string;
  styleOverrides: Partial<NonNullable<SubtitleCue['style']>>;
} {
  const styleOverrides: Partial<NonNullable<SubtitleCue['style']>> = {};
  
  // Check for global alignment tag {\anX} or {\aX}
  const anMatch = rawText.match(/\{\\an([1-9])\}/);
  if (anMatch && anMatch[1]) {
    styleOverrides.alignment = mapASSAlignment(parseInt(anMatch[1], 10));
  } else {
    const aMatch = rawText.match(/\{\\a([1-9]|10|11)\}/);
    if (aMatch && aMatch[1]) {
      styleOverrides.alignment = mapSSAAlignment(parseInt(aMatch[1], 10));
    }
  }

  // Check for primary color tag {\c&H...&} or {\1c&H...&}
  const colorMatch = rawText.match(/\{\\(?:1c|c)&H([0-9a-fA-F]+)&?\}/i);
  if (colorMatch && colorMatch[1]) {
    const parsedColor = parseASSColor(colorMatch[1]);
    if (parsedColor) {
      styleOverrides.color = parsedColor;
    }
  }

  // Check for font size {\fs<number>}
  const fsMatch = rawText.match(/\{\\fs(\d+)\}/);
  if (fsMatch && fsMatch[1]) {
    styleOverrides.fontSize = `${fsMatch[1]}px`;
  }

  // Check for font name {\fn<name>}
  const fnMatch = rawText.match(/\{\\fn([^}]+)\}/);
  if (fnMatch && fnMatch[1]) {
    styleOverrides.fontFamily = fnMatch[1].trim();
  }

  // Check for bold / italic / underline
  if (/\{\\b1\}/.test(rawText)) styleOverrides.bold = true;
  if (/\{\\b0\}/.test(rawText) && !baseStyle?.bold) styleOverrides.bold = false;
  if (/\{\\i1\}/.test(rawText)) styleOverrides.italic = true;
  if (/\{\\i0\}/.test(rawText) && !baseStyle?.italic) styleOverrides.italic = false;
  if (/\{\\u1\}/.test(rawText)) styleOverrides.underline = true;
  if (/\{\\u0\}/.test(rawText) && !baseStyle?.underline) styleOverrides.underline = false;

  // Process text into HTML tags
  let html = rawText;

  // Replace ASS line break tokens
  html = html
    .replace(/\\N/g, '<br/>')
    .replace(/\\n/g, '<br/>')
    .replace(/\\h/g, '&nbsp;');

  // Convert inline styling tags
  // Convert {\b1} ... {\b0}
  html = html.replace(/\{\\b1\}([\s\S]*?)(?:\{\\b0\}|$)/gi, '<b>$1</b>');
  // Convert {\i1} ... {\i0}
  html = html.replace(/\{\\i1\}([\s\S]*?)(?:\{\\i0\}|$)/gi, '<i>$1</i>');
  // Convert {\u1} ... {\u0}
  html = html.replace(/\{\\u1\}([\s\S]*?)(?:\{\\u0\}|$)/gi, '<u>$1</u>');
  // Convert {\s1} ... {\s0}
  html = html.replace(/\{\\s1\}([\s\S]*?)(?:\{\\s0\}|$)/gi, '<s>$1</s>');

  // Convert inline color tags: {\c&HBBGGRR&}...{\c}
  html = html.replace(/\{\\(?:1c|c)&H([0-9a-fA-F]+)&?\}([\s\S]*?)(?:\{\\(?:1c|c)&?\}|$)/gi, (_match, colorHex: string, content: string) => {
    const col = parseASSColor(colorHex);
    return col ? `<span style="color: ${col};">${content}</span>` : content;
  });

  // Strip all remaining override tags like {\pos(...)}, {\fad(...)}, {\r...}, etc.
  html = html.replace(/\{[^}]+\}/g, '');

  return { html: html.trim(), styleOverrides };
}

/**
 * Parses Advanced SubStation Alpha (.ass / .ssa) subtitle content into an array of SubtitleCue objects.
 * Handles [Script Info], [V4+ Styles], and [Events] Dialogue lines with rich styling and override tags.
 *
 * @param content The raw ASS/SSA file content string.
 * @returns Array of parsed SubtitleCue items sorted by start time.
 */
export function parseASS(content: string): SubtitleCue[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // Remove BOM and normalize line endings
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
  const lines = normalized.split('\n');

  const styles = new Map<string, ASSStyle>();
  const cues: SubtitleCue[] = [];

  let currentSection = '';
  let styleFormatColumns: string[] = [];
  let eventFormatColumns: string[] = [];
  let isV4Styles = false; // True for SSA [V4 Styles], False for ASS [V4+ Styles]

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const line = rawLine.trim();

    if (line === '' || line.startsWith(';') || line.startsWith('!')) {
      continue; // Skip empty lines and comments
    }

    // Check for section headers
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim().toLowerCase();
      if (currentSection === 'v4 styles') {
        isV4Styles = true;
      } else if (currentSection === 'v4+ styles' || currentSection === 'v4+ styles+') {
        isV4Styles = false;
      }
      continue;
    }

    // Parse [V4+ Styles] or [V4 Styles]
    if (currentSection === 'v4+ styles' || currentSection === 'v4 styles' || currentSection === 'styles') {
      if (line.startsWith('Format:')) {
        styleFormatColumns = line
          .slice('Format:'.length)
          .split(',')
          .map((col) => col.trim().toLowerCase());
        continue;
      }

      if (line.startsWith('Style:')) {
        const styleValues = line.slice('Style:'.length).split(',');
        const styleObj: Record<string, string> = {};

        for (let j = 0; j < styleFormatColumns.length; j++) {
          const colName = styleFormatColumns[j];
          const val = styleValues[j]?.trim();
          if (colName && val !== undefined) {
            styleObj[colName] = val;
          }
        }

        const name = styleObj['name'] ?? 'Default';
        const fontName = styleObj['fontname'];
        const fontSizeNum = styleObj['fontsize'] ? parseFloat(styleObj['fontsize']) : undefined;
        const primaryColorStr = styleObj['primarycolour'] ?? styleObj['primarycolor'];
        const primaryColor = primaryColorStr ? parseASSColor(primaryColorStr) : undefined;
        const boldVal = styleObj['bold'] ? parseInt(styleObj['bold'], 10) : 0;
        const italicVal = styleObj['italic'] ? parseInt(styleObj['italic'], 10) : 0;
        const underlineVal = styleObj['underline'] ? parseInt(styleObj['underline'], 10) : 0;
        const alignVal = styleObj['alignment'] ? parseInt(styleObj['alignment'], 10) : 2;

        const alignment = isV4Styles ? mapSSAAlignment(alignVal) : mapASSAlignment(alignVal);

        const marginL = styleObj['marginl'] ? parseInt(styleObj['marginl'], 10) : undefined;
        const marginR = styleObj['marginr'] ? parseInt(styleObj['marginr'], 10) : undefined;
        const marginV = styleObj['marginv'] ? parseInt(styleObj['marginv'], 10) : undefined;

        const parsedStyle: ASSStyle = {
          name,
          fontName,
          fontSize: fontSizeNum,
          primaryColor,
          bold: boldVal === -1 || boldVal === 1,
          italic: italicVal === -1 || italicVal === 1,
          underline: underlineVal === -1 || underlineVal === 1,
          alignment,
          marginL,
          marginR,
          marginV,
        };

        styles.set(name, parsedStyle);
        continue;
      }
    }

    // Parse [Events]
    if (currentSection === 'events') {
      if (line.startsWith('Format:')) {
        eventFormatColumns = line
          .slice('Format:'.length)
          .split(',')
          .map((col) => col.trim().toLowerCase());
        continue;
      }

      if (line.startsWith('Dialogue:')) {
        const payload = rawLine.slice(rawLine.indexOf(':') + 1);
        
        // Split columns up to the last column (Text), which can contain commas
        const numColumns = eventFormatColumns.length > 0 ? eventFormatColumns.length : 10;
        const values: string[] = [];
        let cursor = 0;

        for (let col = 0; col < numColumns - 1; col++) {
          const nextComma = payload.indexOf(',', cursor);
          if (nextComma === -1) {
            values.push(payload.slice(cursor).trim());
            cursor = payload.length;
            break;
          }
          values.push(payload.slice(cursor, nextComma).trim());
          cursor = nextComma + 1;
        }

        // The remainder is the Text column
        if (cursor < payload.length) {
          values.push(payload.slice(cursor));
        }

        const eventObj: Record<string, string> = {};
        for (let j = 0; j < eventFormatColumns.length; j++) {
          const colName = eventFormatColumns[j];
          const val = values[j];
          if (colName && val !== undefined) {
            eventObj[colName] = val;
          }
        }

        const startStr = eventObj['start'];
        const endStr = eventObj['end'];
        const styleName = eventObj['style'] ?? 'Default';
        const textContent = eventObj['text'] ?? values[values.length - 1] ?? '';

        if (!startStr || !endStr) continue;

        const startTime = parseASSTimestamp(startStr);
        const endTime = parseASSTimestamp(endStr);
        const baseStyle = styles.get(styleName);

        const { html, styleOverrides } = formatASSText(textContent, baseStyle);

        // Build combined cue style
        const cueStyle: NonNullable<SubtitleCue['style']> = {};
        
        // Base style values
        if (baseStyle?.primaryColor) cueStyle.color = baseStyle.primaryColor;
        if (baseStyle?.fontSize) cueStyle.fontSize = `${baseStyle.fontSize}px`;
        if (baseStyle?.fontName) cueStyle.fontFamily = baseStyle.fontName;
        if (baseStyle?.bold) cueStyle.bold = true;
        if (baseStyle?.italic) cueStyle.italic = true;
        if (baseStyle?.underline) cueStyle.underline = true;
        if (baseStyle?.alignment) cueStyle.alignment = baseStyle.alignment;
        if (baseStyle?.marginV !== undefined) cueStyle.marginV = baseStyle.marginV;
        if (baseStyle?.marginL !== undefined) cueStyle.marginH = baseStyle.marginL;

        // Apply overrides
        if (styleOverrides.color) cueStyle.color = styleOverrides.color;
        if (styleOverrides.fontSize) cueStyle.fontSize = styleOverrides.fontSize;
        if (styleOverrides.fontFamily) cueStyle.fontFamily = styleOverrides.fontFamily;
        if (styleOverrides.bold !== undefined) cueStyle.bold = styleOverrides.bold;
        if (styleOverrides.italic !== undefined) cueStyle.italic = styleOverrides.italic;
        if (styleOverrides.underline !== undefined) cueStyle.underline = styleOverrides.underline;
        if (styleOverrides.alignment) cueStyle.alignment = styleOverrides.alignment;

        const cue: SubtitleCue = {
          startTime,
          endTime,
          text: html,
          rawText: textContent,
          ...(Object.keys(cueStyle).length > 0 ? { style: cueStyle } : {}),
        };

        cues.push(cue);
      }
    }
  }

  return cues.sort((a, b) => a.startTime - b.startTime);
}

export const parseSSA = parseASS;
