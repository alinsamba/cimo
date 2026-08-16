export type MediaCategory = 'video' | 'audio' | 'subtitle';

export interface FileTypeDefinition {
  readonly extension: string;
  readonly mimeType: string;
  readonly category: MediaCategory;
  readonly description: string;
  readonly uti?: string; // Uniform Type Identifier for macOS
}

/**
 * Standard video file type definitions supported by Cimo.
 */
export const VIDEO_FILE_TYPES: readonly FileTypeDefinition[] = [
  { extension: '.mp4', mimeType: 'video/mp4', category: 'video', description: 'MPEG-4 Video', uti: 'public.mpeg-4' },
  { extension: '.mkv', mimeType: 'video/x-matroska', category: 'video', description: 'Matroska Video', uti: 'org.matroska.mkv' },
  { extension: '.webm', mimeType: 'video/webm', category: 'video', description: 'WebM Video', uti: 'org.webmproject.webm' },
  { extension: '.avi', mimeType: 'video/x-msvideo', category: 'video', description: 'Audio Video Interleave', uti: 'public.avi' },
  { extension: '.mov', mimeType: 'video/quicktime', category: 'video', description: 'QuickTime Movie', uti: 'com.apple.quicktime-movie' },
  { extension: '.flv', mimeType: 'video/x-flv', category: 'video', description: 'Flash Video', uti: 'com.adobe.flash.video' },
  { extension: '.m4v', mimeType: 'video/x-m4v', category: 'video', description: 'iTunes Video', uti: 'com.apple.m4v-video' },
  { extension: '.ts', mimeType: 'video/mp2t', category: 'video', description: 'MPEG Transport Stream', uti: 'public.mpeg-2-transport-stream' },
  { extension: '.wmv', mimeType: 'video/x-ms-wmv', category: 'video', description: 'Windows Media Video', uti: 'com.microsoft.windows-media-wmv' },
  { extension: '.ogv', mimeType: 'video/ogg', category: 'video', description: 'Ogg Video', uti: 'org.xiph.ogv' },
] as const;

/**
 * Standard audio file type definitions supported by Cimo.
 */
export const AUDIO_FILE_TYPES: readonly FileTypeDefinition[] = [
  { extension: '.mp3', mimeType: 'audio/mpeg', category: 'audio', description: 'MP3 Audio', uti: 'public.mp3' },
  { extension: '.flac', mimeType: 'audio/flac', category: 'audio', description: 'FLAC Audio', uti: 'org.xiph.flac' },
  { extension: '.wav', mimeType: 'audio/wav', category: 'audio', description: 'Waveform Audio', uti: 'com.microsoft.waveform-audio' },
  { extension: '.aac', mimeType: 'audio/aac', category: 'audio', description: 'AAC Audio', uti: 'public.aac-audio' },
  { extension: '.ogg', mimeType: 'audio/ogg', category: 'audio', description: 'Ogg Vorbis Audio', uti: 'org.xiph.ogg-audio' },
  { extension: '.m4a', mimeType: 'audio/mp4', category: 'audio', description: 'MPEG-4 Audio', uti: 'public.mpeg-4-audio' },
  { extension: '.opus', mimeType: 'audio/opus', category: 'audio', description: 'Opus Audio', uti: 'org.xiph.opus' },
  { extension: '.wma', mimeType: 'audio/x-ms-wma', category: 'audio', description: 'Windows Media Audio', uti: 'com.microsoft.windows-media-wma' },
  { extension: '.aiff', mimeType: 'audio/x-aiff', category: 'audio', description: 'AIFF Audio', uti: 'public.aiff-audio' },
] as const;

/**
 * Standard subtitle file type definitions supported by Cimo.
 */
export const SUBTITLE_FILE_TYPES: readonly FileTypeDefinition[] = [
  { extension: '.srt', mimeType: 'application/x-subrip', category: 'subtitle', description: 'SubRip Subtitle', uti: 'public.plain-text' },
  { extension: '.vtt', mimeType: 'text/vtt', category: 'subtitle', description: 'WebVTT Subtitle', uti: 'public.vtt' },
  { extension: '.ass', mimeType: 'text/x-ssa', category: 'subtitle', description: 'Advanced SubStation Alpha', uti: 'public.plain-text' },
  { extension: '.ssa', mimeType: 'text/x-ssa', category: 'subtitle', description: 'SubStation Alpha', uti: 'public.plain-text' },
] as const;

/**
 * All supported file type definitions.
 */
export const ALL_FILE_TYPES: readonly FileTypeDefinition[] = [
  ...VIDEO_FILE_TYPES,
  ...AUDIO_FILE_TYPES,
  ...SUBTITLE_FILE_TYPES,
] as const;

export function getSupportedVideoFormats(): readonly FileTypeDefinition[] {
  return VIDEO_FILE_TYPES;
}

export function getSupportedAudioFormats(): readonly FileTypeDefinition[] {
  return AUDIO_FILE_TYPES;
}

export function getSupportedSubtitleFormats(): readonly FileTypeDefinition[] {
  return SUBTITLE_FILE_TYPES;
}

export function getAllSupportedFormats(): readonly FileTypeDefinition[] {
  return ALL_FILE_TYPES;
}

export const EXTENSION_LOOKUP: Record<string, FileTypeDefinition> = Object.fromEntries(
  ALL_FILE_TYPES.map((item) => [item.extension.toLowerCase(), item])
);

export const MIME_TYPE_LOOKUP: Record<string, FileTypeDefinition> = Object.fromEntries(
  ALL_FILE_TYPES.map((item) => [item.mimeType.toLowerCase(), item])
);

export function extractExtension(filePathOrName: string): string {
  const noQuery = filePathOrName.includes('?') ? (filePathOrName.split('?')[0] ?? '') : filePathOrName;
  const clean = noQuery.includes('#') ? (noQuery.split('#')[0] ?? '') : noQuery;
  const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  const fileName = lastSlash !== -1 ? clean.slice(lastSlash + 1) : clean;
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return '';
  }
  return fileName.slice(lastDot).toLowerCase();
}

export function getAllMimeTypes(): string[] {
  const uniqueMimes: Record<string, true> = {};
  for (const item of ALL_FILE_TYPES) {
    uniqueMimes[item.mimeType] = true;
  }
  return Object.keys(uniqueMimes);
}

export function getAllExtensions(): string[] {
  return ALL_FILE_TYPES.map((item) => item.extension);
}

export function getMimeType(filePathOrExtension: string): string | undefined {
  const ext = filePathOrExtension.startsWith('.')
    ? filePathOrExtension.toLowerCase()
    : extractExtension(filePathOrExtension);
  return EXTENSION_LOOKUP[ext]?.mimeType;
}

export function getExtension(mimeType: string): string | undefined {
  return MIME_TYPE_LOOKUP[mimeType.toLowerCase()]?.extension;
}

export function getFileCategory(filePathOrExtension: string): MediaCategory | 'unknown' {
  const ext = filePathOrExtension.startsWith('.')
    ? filePathOrExtension.toLowerCase()
    : extractExtension(filePathOrExtension);
  return EXTENSION_LOOKUP[ext]?.category ?? 'unknown';
}

export function isSupportedMedia(filePathOrExtension: string): boolean {
  const category = getFileCategory(filePathOrExtension);
  return category === 'video' || category === 'audio';
}

export function isSupportedSubtitle(filePathOrExtension: string): boolean {
  return getFileCategory(filePathOrExtension) === 'subtitle';
}

/**
 * Linux: Generate compliant XDG .desktop file contents.
 */
export function generateDesktopEntry(execPath = 'cimo', iconPath = 'cimo'): string {
  const mimeTypes = getAllMimeTypes().join(';');

  return `[Desktop Entry]
Version=1.0
Type=Application
Name=Cimo
GenericName=Media Player
Comment=Minimalist, high-performance cross-platform media player
Exec=${execPath} %U
Icon=${iconPath}
Terminal=false
StartupNotify=true
StartupWMClass=cimo
Categories=AudioVideo;Player;Video;Audio;
MimeType=${mimeTypes};
Keywords=player;media;video;audio;subtitles;mpris;equalizer;
Actions=PlayPause;Next;Previous;Stop;

[Desktop Action PlayPause]
Name=Play/Pause
Exec=${execPath} --toggle-play
Icon=media-playback-start

[Desktop Action Next]
Name=Next Track
Exec=${execPath} --next
Icon=media-skip-forward

[Desktop Action Previous]
Name=Previous Track
Exec=${execPath} --previous
Icon=media-skip-backward

[Desktop Action Stop]
Name=Stop
Exec=${execPath} --stop
Icon=media-playback-stop
`;
}

/**
 * Linux: Generate mimeapps.list file entries.
 */
export function generateLinuxMimeAppsList(desktopFileName = 'cimo.desktop'): string {
  const mimeLines = getAllMimeTypes()
    .map((m) => `${m}=${desktopFileName};`)
    .join('\n');

  return `[Default Applications]\n${mimeLines}\n\n[Added Associations]\n${mimeLines}\n`;
}

/**
 * Windows: Generate Windows Registry .reg file for ProgIDs & File Associations.
 */
export function generateWindowsRegistry(
  appName = 'Cimo',
  exePath = 'C:\\Program Files\\Cimo\\cimo.exe'
): string {
  const sanitizedExe = exePath.replace(/\\/g, '\\\\');
  let reg = `Windows Registry Editor Version 5.00\n\n`;

  reg += `[HKEY_LOCAL_MACHINE\\Software\\Clients\\Media\\${appName}]\n`;
  reg += `@="${appName} Media Player"\n\n`;

  reg += `[HKEY_LOCAL_MACHINE\\Software\\Clients\\Media\\${appName}\\Capabilities]\n`;
  reg += `"ApplicationDescription"="Minimalist, high-performance cross-platform media player"\n`;
  reg += `"ApplicationName"="${appName}"\n\n`;

  reg += `[HKEY_LOCAL_MACHINE\\Software\\Clients\\Media\\${appName}\\Capabilities\\FileAssociations]\n`;
  for (const item of ALL_FILE_TYPES) {
    reg += `"${item.extension}"="${appName}.AssocFile${item.extension}"\n`;
  }
  reg += `\n`;

  for (const item of ALL_FILE_TYPES) {
    const progId = `${appName}.AssocFile${item.extension}`;
    reg += `[HKEY_CLASSES_ROOT\\${progId}]\n`;
    reg += `@="${item.description}"\n\n`;
    reg += `[HKEY_CLASSES_ROOT\\${progId}\\shell\\open\\command]\n`;
    reg += `@="\\"${sanitizedExe}\\" \\"%1\\""\n\n`;
  }

  return reg;
}

/**
 * Windows: Generate Windows file associations AppX / Package.appxmanifest XML fragment.
 */
export function generateWindowsManifest(appName = 'Cimo', executable = 'cimo.exe'): string {
  const extensions = getAllExtensions();
  const fileTypeTags = extensions
    .map((ext) => `            <uap:FileType>${ext}</uap:FileType>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10">
  <Applications>
    <Application Id="${appName}" Executable="${executable}" EntryPoint="Windows.FullTrustApplication">
      <Extensions>
        <uap:Extension Category="windows.fileTypeAssociation">
          <uap:FileTypeAssociation Name="${appName.toLowerCase()}.media">
            <uap:DisplayName>${appName} Media File</uap:DisplayName>
            <uap:SupportedFileTypes>
${fileTypeTags}
            </uap:SupportedFileTypes>
          </uap:FileTypeAssociation>
        </uap:Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>`;
}

/**
 * macOS: Generate macOS CFBundleDocumentTypes Info.plist array fragment.
 */
export function generateMacOSInfoExtension(): string {
  const groups: Array<{ name: string; types: readonly FileTypeDefinition[] }> = [
    { name: 'Video File', types: VIDEO_FILE_TYPES },
    { name: 'Audio File', types: AUDIO_FILE_TYPES },
    { name: 'Subtitle File', types: SUBTITLE_FILE_TYPES },
  ];

  const dicts = groups.map((group) => {
    const extTags = group.types
      .map((t) => `        <string>${t.extension.replace(/^\./, '')}</string>`)
      .join('\n');
    const mimeTags = Array.from(new Set(group.types.map((t) => t.mimeType)))
      .map((m) => `        <string>${m}</string>`)
      .join('\n');

    return `    <dict>
      <key>CFBundleTypeName</key>
      <string>${group.name}</string>
      <key>CFBundleTypeRole</key>
      <string>Viewer</string>
      <key>LSHandlerRank</key>
      <string>Alternate</string>
      <key>CFBundleTypeExtensions</key>
      <array>
${extTags}
      </array>
      <key>CFBundleTypeMIMETypes</key>
      <array>
${mimeTags}
      </array>
    </dict>`;
  });

  return `<key>CFBundleDocumentTypes</key>
<array>
${dicts.join('\n')}
</array>`;
}

/**
 * Android: Generate AndroidManifest.xml intent-filter declarations.
 */
export function generateAndroidManifest(): string {
  return `<activity android:name=".MainActivity" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="file" />
        <data android:scheme="content" />
        <data android:scheme="http" />
        <data android:scheme="https" />
        <data android:mimeType="video/*" />
        <data android:mimeType="audio/*" />
    </intent-filter>
</activity>`;
}

/**
 * iOS: Generate iOS Info.plist file sharing and document opening configuration.
 */
export function generateIOSInfoPlist(): string {
  return `<key>UIFileSharingEnabled</key>
<true/>
<key>LSSupportsOpeningDocumentsInPlace</key>
<true/>
<key>UISupportsDocumentBrowser</key>
<true/>
${generateMacOSInfoExtension()}`;
}
