// Direct browser access to the public Are.na API.
// Public channels need no Authorization header, so this replaces the portfolio's
// backend proxy entirely. Ported from server/routes/arena.ts.

const ARENA_API = "https://api.are.na/v2";

export type Song = {
  id: number;
  title: string;
  artist: string;
  url: string;
  provider: "youtube" | "soundcloud" | "other";
  coverArt: string | null;
  embedHtml: string | null;
};

async function arenaFetch(path: string): Promise<any> {
  const res = await fetch(`${ARENA_API}${path}`);
  if (!res.ok) throw new Error(`Are.na ${res.status}: ${path}`);
  return res.json();
}

function cleanSongTitle(str: string): string {
  return str
    .replace(
      /\s*[\(\[][^\)\]]*?(official|lyric|audio|music\s*video|hd|hq|visuali[sz]er|prod\.?)[^\)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*\|.*$/, "")
    .trim();
}

function parseVideoTitle(videoTitle: string, description: string | null) {
  const descLine = (description || "").split("\n")[0].trim();
  const userArtist =
    descLine.length > 0 &&
    descLine.length < 60 &&
    !descLine.includes("©") &&
    !descLine.includes("http") &&
    !descLine.includes("Subscribe")
      ? descLine
      : null;

  const match = videoTitle.match(/ [-–—] /);
  if (match) {
    const idx = videoTitle.indexOf(match[0]);
    const parsedArtist = videoTitle.slice(0, idx).trim();
    const parsedSong = cleanSongTitle(videoTitle.slice(idx + match[0].length));
    return { artist: userArtist || parsedArtist, songTitle: parsedSong };
  }

  return { artist: userArtist || "", songTitle: cleanSongTitle(videoTitle) };
}

function detectProvider(
  url: string,
  provider: string | { name?: string } | null
): "youtube" | "soundcloud" | "other" {
  const hint = (typeof provider === "string" ? provider : provider?.name || "").toLowerCase();
  if (hint.includes("youtube") || /youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (hint.includes("soundcloud") || /soundcloud\.com/.test(url)) return "soundcloud";
  return "other";
}

// All playable tracks in a channel (paginates the full channel like the old /blocks/:slug).
export async function fetchStationSongs(slug: string): Promise<Song[]> {
  const first = await arenaFetch(`/channels/${slug}/contents?per=100&page=1`);
  const totalPages = first.total_pages || 1;

  let all: any[] = [...(first.contents || [])];

  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        arenaFetch(`/channels/${slug}/contents?per=100&page=${i + 2}`)
      )
    );
    rest.forEach((r: any) => all.push(...(r.contents || [])));
  }

  return all
    .filter((b: any) => (b.class === "Media" || b.class === "Link") && b.source?.url)
    .map((b: any) => {
      const raw = b.title || b.generated_title || "";
      const { artist, songTitle } = parseVideoTitle(raw, b.description);
      return {
        id: b.id,
        title: songTitle || raw || "Unknown Track",
        artist,
        url: b.source.url,
        provider: detectProvider(b.source.url, b.source?.provider),
        coverArt: b.image?.display?.url || b.image?.large?.url || null,
        embedHtml: b.embed?.html || null,
      };
    });
}

// Normalize whatever a user pastes (full are.na URL or bare slug) into a channel slug.
// Accepts: https://www.are.na/user/my-channel, are.na/my-channel, "my-channel".
export function extractArenaSlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pull the last path segment out of an are.na URL.
  const urlMatch = trimmed.match(/are\.na\/(?:[^/]+\/)?([^/?#]+)/i);
  const candidate = (urlMatch ? urlMatch[1] : trimmed).trim();

  // are.na slugs are lowercase, alphanumeric + hyphens.
  if (!/^[a-z0-9-]+$/.test(candidate)) return null;
  return candidate;
}

// Look up a channel to confirm it exists and grab its title / size.
export async function fetchChannelInfo(
  slug: string
): Promise<{ title: string; length: number } | null> {
  try {
    const data = await arenaFetch(`/channels/${slug}/thumb`);
    if (!data || !data.title) return null;
    return { title: data.title, length: data.length ?? 0 };
  } catch {
    return null;
  }
}

// Station thumbnail: the pinned image block, else the first image (like /channel-logo/:slug).
export async function fetchChannelLogo(slug: string): Promise<string | null> {
  const data = await arenaFetch(
    `/channels/${slug}/contents?per=100&page=1&sort=position&direction=asc`
  );
  const blocks = data.contents || [];
  const imageBlock =
    blocks.find((b: any) => b.class === "Image" && b.pinned_at) ||
    blocks.find((b: any) => b.class === "Image");
  return imageBlock?.image?.display?.url || imageBlock?.image?.large?.url || null;
}
