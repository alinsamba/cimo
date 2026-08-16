export interface CleanedTitleResult {
  cleanTitle: string;
  badges: string[];
  rawTitle: string;
}

const TECH_PATTERNS: Array<{ regex: RegExp; badge: string }> = [
  // Resolutions
  { regex: /\b(2160p|4k|uhd)\b/i, badge: '4K' },
  { regex: /\b(1440p|2k|qhd)\b/i, badge: '1440p' },
  { regex: /\b(1080p|fhd)\b/i, badge: '1080p' },
  { regex: /\b(720p|hd)\b/i, badge: '720p' },
  { regex: /\b(480p|sd|360p)\b/i, badge: 'SD' },

  // Video Codecs
  { regex: /\b(x265|h265|hevc)\b/i, badge: 'HEVC' },
  { regex: /\b(x264|h264|avc)\b/i, badge: 'H.264' },
  { regex: /\b(av1)\b/i, badge: 'AV1' },
  { regex: /\b(vp9)\b/i, badge: 'VP9' },
  { regex: /\b(10bit|10-bit)\b/i, badge: '10-bit' },
  { regex: /\b(hdr10\+|hdr10|hdr|dovi|dv)\b/i, badge: 'HDR' },

  // Audio Codecs
  { regex: /\b(atmos)\b/i, badge: 'Atmos' },
  { regex: /\b(truehd|dts-hd|dts)\b/i, badge: 'DTS' },
  { regex: /\b(eac3|ddp|dd\+|ac3|5\.1|7\.1)\b/i, badge: '5.1' },
  { regex: /\b(flac)\b/i, badge: 'FLAC' },
  { regex: /\b(aac|opus|mp3)\b/i, badge: 'AAC' },

  // Source types
  { regex: /\b(remux|bluray|bdrip)\b/i, badge: 'BluRay' },
  { regex: /\b(web-dl|webrip|web)\b/i, badge: 'WEB' },
];

export function parseMediaDisplayTitle(raw: string): CleanedTitleResult {
  if (!raw || raw.trim() === '') {
    return { cleanTitle: 'Cimo Player', badges: [], rawTitle: raw || '' };
  }

  // 1. Strip query strings / URL protocols
  let name = raw.split('?')[0].split('#')[0];
  if (name.includes('/') || name.includes('\\')) {
    name = name.split(/[/\\]/).pop() || name;
  }

  // 2. Strip file extensions (.mp4, .mkv, .webm, etc.)
  name = name.replace(/\.(mp4|mkv|webm|avi|mov|flv|wmv|ts|m4v|mp3|flac|wav|aac|ogg|opus|m4a)$/i, '');

  const badgesSet = new Set<string>();

  // 3. Extract bracketed technical details like (720p, h264), [1080p, x265], [1080p], [YTS]
  name = name.replace(/[\(\[]\s*([^()\[\]]*?)\s*[\)\]]/g, (match, inner) => {
    let hasTech = false;
    for (const { regex, badge } of TECH_PATTERNS) {
      if (regex.test(inner)) {
        badgesSet.add(badge);
        hasTech = true;
      }
    }
    // If it's pure release group tag like [YTS], [RARBG], [PSA], strip it
    if (/^(yts|rarbg|eztv|psa|flux|galaxyrg|sparks|dimension|ettv)$/i.test(inner.trim())) {
      return '';
    }
    // If it is just a year e.g. (2024), keep it intact
    if (/^(19\d\d|20\d\d)$/.test(inner.trim())) {
      return `(${inner.trim()})`;
    }
    // If it is non-tech bracket like (Lyrics) or (Official Video), keep it
    if (/lyrics|official|audio|remix|acoustic|live|cover/i.test(inner.trim()) && !hasTech) {
      return `(${inner.trim()})`;
    }
    // If it had technical tags, strip it
    if (hasTech) {
      return '';
    }
    return match;
  });

  // 4. Extract standalone tech words from filename
  for (const { regex, badge } of TECH_PATTERNS) {
    if (regex.test(name)) {
      badgesSet.add(badge);
      name = name.replace(regex, '');
    }
  }

  // 5. Replace dot/underscore release separators with spaces, but format standalone unwrapped years
  name = name.replace(/(^|[\s._\-])(19\d\d|20\d\d)([\s._\-]|$)/g, ' ($2) ');
  name = name.replace(/[._]/g, ' ');
  name = name.replace(/[-–—]{2,}/g, ' - ');
  name = name.replace(/\(\s*\((.*?)\)\s*\)/g, '($1)');
  name = name.replace(/\s+/g, ' ').trim();

  // Clean trailing dashes or orphan brackets
  name = name.replace(/[\s\-_]+$/, '').replace(/^[\s\-_]+/, '');
  name = name.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').trim();

  if (!name) {
    name = raw.split(/[/\\]/).pop()?.split('.')[0] || 'Media File';
  }

  return {
    cleanTitle: name,
    badges: Array.from(badgesSet),
    rawTitle: raw,
  };
}
