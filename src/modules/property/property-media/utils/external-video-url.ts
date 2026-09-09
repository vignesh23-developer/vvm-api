export function isYoutubeUrl(url?: string): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
  } catch {
    return /youtube\.com|youtu\.be/i.test(url);
  }
}

export function isInstagramUrl(url?: string): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'instagram.com' || host === 'instagr.am';
  } catch {
    return /instagram\.com|instagr\.am/i.test(url);
  }
}

export function isSupportedExternalVideoUrl(url?: string): boolean {
  return isYoutubeUrl(url) || isInstagramUrl(url);
}

export function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([^#&?]+)/,
  );
  const id = match?.[1];
  return id && id.length === 11 ? id : null;
}

export function getYoutubeThumbnail(url: string): string | null {
  const id = extractYoutubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null;
}
