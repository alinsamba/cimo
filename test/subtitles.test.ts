import { describe, expect, test } from 'bun:test';
import { parseSubRip, parseSRTTimestamp, cleanSRTText } from '../src/engine/subtitles/srt';
import { parseWebVTT, parseVTTTimestamp, parseVTTCueSettings, cleanVTTText } from '../src/engine/subtitles/vtt';
import { parseASS, parseASSTimestamp, parseASSColor, mapASSAlignment, mapSSAAlignment, formatASSText } from '../src/engine/subtitles/ass';
import { SubtitleRenderer } from '../src/engine/subtitles/renderer';
import type { SubtitleTrack } from '../src/core/types';

describe('SRT Parser', () => {
  test('parses standard SRT timestamps correctly', () => {
    expect(parseSRTTimestamp('00:01:23,456')).toBeCloseTo(83.456, 3);
    expect(parseSRTTimestamp('01:00:00,000')).toBe(3600);
    expect(parseSRTTimestamp('00:00:05.500')).toBeCloseTo(5.5, 3);
    expect(parseSRTTimestamp('01:30,000')).toBe(90);
  });

  test('parses basic SRT content with multiple cues', () => {
    const srt = `
1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,000 --> 00:00:08,000
This is a second subtitle.
`;
    const cues = parseSubRip(srt);
    expect(cues.length).toBe(2);
    expect(cues[0]?.startTime).toBe(1.0);
    expect(cues[0]?.endTime).toBe(4.0);
    expect(cues[0]?.text).toBe('Hello, world!');
    expect(cues[0]?.id).toBe('1');

    expect(cues[1]?.startTime).toBe(5.0);
    expect(cues[1]?.endTime).toBe(8.0);
    expect(cues[1]?.text).toBe('This is a second subtitle.');
    expect(cues[1]?.id).toBe('2');
  });

  test('parses multi-line cues and preserves line breaks as <br/>', () => {
    const srt = `
1
00:00:10,000 --> 00:00:14,000
First line of cue
Second line of cue
Third line of cue
`;
    const cues = parseSubRip(srt);
    expect(cues.length).toBe(1);
    expect(cues[0]?.text).toBe('First line of cue<br/>Second line of cue<br/>Third line of cue');
    expect(cues[0]?.rawText).toBe('First line of cue\nSecond line of cue\nThird line of cue');
  });

  test('extracts styling tags (bold, italic, font color, alignment)', () => {
    const srt = `
1
00:00:01,000 --> 00:00:03,000
{\\an8}<i>Top center subtitle in italics</i>

2
00:00:04,000 --> 00:00:07,000
<font color="#ff0000"><b>Red bold text</b></font>
`;
    const cues = parseSubRip(srt);
    expect(cues.length).toBe(2);
    
    expect(cues[0]?.style?.alignment).toBe('top-center');
    expect(cues[0]?.style?.italic).toBe(true);

    expect(cues[1]?.style?.color).toBe('#ff0000');
    expect(cues[1]?.style?.bold).toBe(true);
  });

  test('handles malformed cues and removes UTF-8 BOM', () => {
    const srtWithBOM = '\uFEFF1\n00:00:01,000 --> 00:00:02,500\nValid text after BOM\n\n\n2\n00:00:03,000 --> 00:00:05,000\nSecond cue\n';
    const cues = parseSubRip(srtWithBOM);
    expect(cues.length).toBe(2);
    expect(cues[0]?.text).toBe('Valid text after BOM');
    expect(cues[1]?.text).toBe('Second cue');
  });

  test('sorts cues chronologically by start time', () => {
    const srt = `
2
00:00:10,000 --> 00:00:12,000
Later cue

1
00:00:02,000 --> 00:00:04,000
Earlier cue
`;
    const cues = parseSubRip(srt);
    expect(cues[0]?.startTime).toBe(2.0);
    expect(cues[1]?.startTime).toBe(10.0);
  });
});

describe('WebVTT Parser', () => {
  test('parses WebVTT timestamps correctly', () => {
    expect(parseVTTTimestamp('00:05.200')).toBeCloseTo(5.2, 3);
    expect(parseVTTTimestamp('01:15.500')).toBeCloseTo(75.5, 3);
    expect(parseVTTTimestamp('01:02:03.456')).toBeCloseTo(3723.456, 3);
  });

  test('parses cue settings (align, line, position)', () => {
    const style1 = parseVTTCueSettings('line:0% align:start');
    expect(style1.alignment).toBe('top-left');

    const style2 = parseVTTCueSettings('line:50% align:center position:50%');
    expect(style2.alignment).toBe('mid-center');
    expect(style2.marginH).toBe(50);

    const style3 = parseVTTCueSettings('line:90% align:right');
    expect(style3.alignment).toBe('bot-right');
  });

  test('parses standard WebVTT file with header, comments, and cues', () => {
    const vtt = `WEBVTT - Demo subtitles

NOTE This is a comment block
that should be skipped by the parser

STYLE
::cue { color: white; }

1
00:00:01.000 --> 00:00:04.000 line:0% align:center
Top centered announcement

cue-2
00:00:05.500 --> 00:00:08.000
<v Narrator>Once upon a time in a galaxy far away...</v>
`;
    const cues = parseWebVTT(vtt);
    expect(cues.length).toBe(2);

    expect(cues[0]?.id).toBe('1');
    expect(cues[0]?.startTime).toBe(1.0);
    expect(cues[0]?.endTime).toBe(4.0);
    expect(cues[0]?.style?.alignment).toBe('top-center');
    expect(cues[0]?.text).toBe('Top centered announcement');

    expect(cues[1]?.id).toBe('cue-2');
    expect(cues[1]?.startTime).toBe(5.5);
    expect(cues[1]?.endTime).toBe(8.0);
    expect(cues[1]?.text).toContain('data-speaker="Narrator"');
  });

  test('cleans VTT classes and intra-cue timestamps', () => {
    const raw = '<c.yellow><00:01.000>Hello <00:02.000>World!</c>';
    const cleaned = cleanVTTText(raw);
    expect(cleaned).toBe('<span class="yellow">Hello World!</span>');
  });
});

describe('ASS/SSA Parser', () => {
  test('parses ASS timestamps correctly', () => {
    expect(parseASSTimestamp('0:00:05.50')).toBeCloseTo(5.5, 2);
    expect(parseASSTimestamp('1:23:45.67')).toBeCloseTo(5025.67, 2);
  });

  test('converts ASS colors (&HAABBGGRR / &HBBGGRR) to CSS', () => {
    // Red in ASS: BB=00, GG=00, RR=FF
    expect(parseASSColor('&H0000FF&')).toBe('#ff0000');
    expect(parseASSColor('&H000000FF')).toBe('#ff0000');

    // Green in ASS: BB=00, GG=FF, RR=00
    expect(parseASSColor('&H00FF00&')).toBe('#00ff00');
    expect(parseASSColor('&H0000FF00')).toBe('#00ff00');

    // Blue in ASS: BB=FF, GG=00, RR=00
    expect(parseASSColor('&HFF0000&')).toBe('#0000ff');
    expect(parseASSColor('&H00FF0000')).toBe('#0000ff');

    // White
    expect(parseASSColor('&HFFFFFF&')).toBe('#ffffff');

    // Semi-transparent: AA=80 (128) -> alpha = (255 - 128) / 255 = ~0.498
    const semi = parseASSColor('&H800000FF');
    expect(semi).toContain('rgba(255, 0, 0,');
  });

  test('maps ASS numpad alignment and SSA alignment correctly', () => {
    // ASS numpad
    expect(mapASSAlignment(1)).toBe('bot-left');
    expect(mapASSAlignment(2)).toBe('bot-center');
    expect(mapASSAlignment(3)).toBe('bot-right');
    expect(mapASSAlignment(5)).toBe('mid-center');
    expect(mapASSAlignment(7)).toBe('top-left');
    expect(mapASSAlignment(8)).toBe('top-center');

    // SSA legacy
    expect(mapSSAAlignment(1)).toBe('bot-left');
    expect(mapSSAAlignment(5)).toBe('top-left');
    expect(mapSSAAlignment(6)).toBe('top-center');
    expect(mapSSAAlignment(10)).toBe('mid-center');
  });

  test('parses complete ASS document with styles and override tags', () => {
    const ass = `[Script Info]
Title: Sample ASS
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,20,1
Style: Title,Trebuchet MS,32,&H0000FFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,2,8,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Normal text with {\\b1}bold{\\b0} and {\\c&H0000FF&}red color{\\c}
Dialogue: 0,0:00:05.00,0:00:08.50,Title,,0,0,0,,{\\an7}Top-left title with \\Nmultiple lines, and a comma inside
`;
    const cues = parseASS(ass);
    expect(cues.length).toBe(2);

    // First cue: Default style
    expect(cues[0]?.startTime).toBe(1.0);
    expect(cues[0]?.endTime).toBe(4.0);
    expect(cues[0]?.style?.fontFamily).toBe('Arial');
    expect(cues[0]?.style?.fontSize).toBe('24px');
    expect(cues[0]?.style?.alignment).toBe('bot-center');
    expect(cues[0]?.style?.marginV).toBe(20);
    expect(cues[0]?.text).toContain('<b>bold</b>');
    expect(cues[0]?.text).toContain('style="color: #ff0000;"');

    // Second cue: Title style with overrides
    expect(cues[1]?.startTime).toBe(5.0);
    expect(cues[1]?.endTime).toBe(8.5);
    expect(cues[1]?.style?.fontFamily).toBe('Trebuchet MS');
    expect(cues[1]?.style?.fontSize).toBe('32px');
    expect(cues[1]?.style?.bold).toBe(true);
    expect(cues[1]?.style?.alignment).toBe('top-left'); // Overridden from 8 (top-center) to 7 (top-left) by {\an7}
    expect(cues[1]?.text).toContain('<br/>');
    expect(cues[1]?.text).toContain('multiple lines, and a comma inside');
  });

  test('parses SSA v4 styles and dialogue correctly', () => {
    const ssa = `[Script Info]
ScriptType: v4.00

[V4 Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding
Style: Default,Helvetica,20,16777215,255,0,0,0,-1,1,2,2,6,20,20,20,0,0

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: Marked=0,0:00:02.00,0:00:05.00,Default,,0,0,0,,SSA Top Center Cue
`;
    const cues = parseASS(ssa);
    expect(cues.length).toBe(1);
    expect(cues[0]?.startTime).toBe(2.0);
    expect(cues[0]?.endTime).toBe(5.0);
    expect(cues[0]?.style?.italic).toBe(true);
    expect(cues[0]?.style?.alignment).toBe('top-center'); // SSA alignment 6 is top-center
  });
});

describe('SubtitleRenderer', () => {
  const sampleTrack: SubtitleTrack = {
    id: 'sub-1',
    label: 'English',
    language: 'en',
    format: 'srt',
    cues: [
      { startTime: 1.0, endTime: 4.0, text: 'Cue 1' },
      { startTime: 3.0, endTime: 6.0, text: 'Cue 2 (overlapping)' },
      { startTime: 10.0, endTime: 15.0, text: 'Cue 3', style: { alignment: 'top-center', color: '#ffff00', bold: true } },
    ],
  };

  test('extracts active cues at specific playback time', () => {
    // At t=0.5s, no cue
    expect(SubtitleRenderer.getActiveCues(sampleTrack, 0.5).length).toBe(0);

    // At t=2.0s, Cue 1 is active
    const at2 = SubtitleRenderer.getActiveCues(sampleTrack, 2.0);
    expect(at2.length).toBe(1);
    expect(at2[0]?.text).toBe('Cue 1');

    // At t=3.5s, Cue 1 and Cue 2 are both active (overlapping)
    const at35 = SubtitleRenderer.getActiveCues(sampleTrack, 3.5);
    expect(at35.length).toBe(2);
    expect(at35.map((c) => c.text)).toEqual(['Cue 1', 'Cue 2 (overlapping)']);

    // At t=12.0s, Cue 3 is active
    const at12 = SubtitleRenderer.getActiveCues(sampleTrack, 12.0);
    expect(at12.length).toBe(1);
    expect(at12[0]?.text).toBe('Cue 3');
  });

  test('applies subtitle offset correctly', () => {
    // Cue 3 is at 10.0s - 15.0s.
    // If offset is +2.0s (delay subtitles by 2s), Cue 3 should appear at video time 12.0s - 17.0s.
    // At video time 10.5s, effective time is 10.5 - 2 = 8.5s (not yet started).
    expect(SubtitleRenderer.getActiveCues(sampleTrack, 10.5, 2.0).length).toBe(0);

    // At video time 12.5s, effective time is 12.5 - 2 = 10.5s (active!).
    const delayed = SubtitleRenderer.getActiveCues(sampleTrack, 12.5, 2.0);
    expect(delayed.length).toBe(1);
    expect(delayed[0]?.text).toBe('Cue 3');

    // If offset is -2.0s (advance subtitles by 2s), Cue 3 appears at video time 8.0s - 13.0s.
    // At video time 8.5s, effective time is 8.5 - (-2) = 10.5s (active!).
    const advanced = SubtitleRenderer.getActiveCues(sampleTrack, 8.5, -2.0);
    expect(advanced.length).toBe(1);
    expect(advanced[0]?.text).toBe('Cue 3');
  });

  test('formats cue CSS properties with alignment positioning', () => {
    const renderer = new SubtitleRenderer();

    const topCenterStyle = renderer.formatCueStyle({
      startTime: 0,
      endTime: 5,
      text: 'Test',
      style: { alignment: 'top-center', color: '#ff0000', bold: true },
    });

    expect(topCenterStyle.top).toBeDefined();
    expect(topCenterStyle.left).toBe('50%');
    expect(topCenterStyle.transform).toBe('translateX(-50%)');
    expect(topCenterStyle.color).toBe('#ff0000');
    expect(topCenterStyle['font-weight']).toBe('bold');

    const botRightStyle = renderer.formatCueStyle({
      startTime: 0,
      endTime: 5,
      text: 'Test',
      style: { alignment: 'bot-right', italic: true },
    });

    expect(botRightStyle.bottom).toBeDefined();
    expect(botRightStyle.right).toBeDefined();
    expect(botRightStyle['text-align']).toBe('right');
    expect(botRightStyle['font-style']).toBe('italic');
  });

  test('renders overlay HTML containing active cues', () => {
    const renderer = new SubtitleRenderer();
    const cues = SubtitleRenderer.getActiveCues(sampleTrack, 12.0);
    const html = renderer.renderOverlay(cues);

    expect(html).toContain('cimo-subtitles-layer');
    expect(html).toContain('cimo-subtitle-cue');
    expect(html).toContain('Cue 3');
  });
  test('handles null track and empty cues gracefully', () => {
    const renderer = new SubtitleRenderer();
    expect(renderer.getActiveCues(10)).toEqual([]);
    expect(renderer.renderOverlay([])).toContain('cimo-subtitles-layer');
  });

  test('supports mount and instance methods', () => {
    const renderer = new SubtitleRenderer({
      offsetSeconds: 1.5,
      defaultFontSize: '20px',
      defaultColor: '#ffff00',
    });

    renderer.setTrack(sampleTrack);
    expect(renderer.getTrack()?.id).toBe('sub-1');
    expect(renderer.getOffset()).toBe(1.5);

    renderer.setOffset(0);
    expect(renderer.getOffset()).toBe(0);
    expect(renderer.getActiveCues(2.0).length).toBe(1);

    const baseCSS = renderer.getBaseCSS();
    expect(baseCSS).toContain('.cimo-subtitles-layer');
  });
});
