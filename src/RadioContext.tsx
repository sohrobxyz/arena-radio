import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import { type Station } from "./radio-stations";
import { type Song, fetchStationSongs } from "./lib/arena";

type RadioContextValue = {
  activeStation: Station | null;
  currentSong: { title: string; artist: string; url: string } | null;
  isPlaying: boolean;
  isLoading: boolean;
  selectStation: (station: Station) => void;
  stop: () => void;
};

type YTPlayer = {
  playVideo(): void;
  stopVideo(): void;
  destroy(): void;
  getDuration(): number;
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
};

type SCWidget = {
  bind(event: string, callback: () => void): void;
  pause(): void;
  seekTo(ms: number): void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
    SC?: {
      Widget: ((iframe: HTMLIFrameElement) => SCWidget) & {
        Events: { READY: string; FINISH: string; ERROR: string };
      };
    };
  }
}

const RadioContext = createContext<RadioContextValue | null>(null);

export function useRadio(): RadioContextValue {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used within RadioProvider");
  return ctx;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [currentSong, setCurrentSong] = useState<{ title: string; artist: string; url: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Mutable refs — no re-renders needed
  const songsRef = useRef<Song[]>([]);
  const songIndexRef = useRef(0);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const scWidgetRef = useRef<SCWidget | null>(null);
  const ytReadyRef = useRef(false);
  const ytCallbacksRef = useRef<Array<() => void>>([]);
  const scLoadedRef = useRef(false);
  const ytIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Kept in sync with state so closures always read current value
  const activeStationRef = useRef<Station | null>(null);
  const nextSongRef = useRef<() => void>(() => {});
  // Guards against double-trigger (interval + onStateChange firing simultaneously)
  const isTransitioningRef = useRef(false);

  useEffect(() => { activeStationRef.current = activeStation; }, [activeStation]);

  // ─── YouTube API ──────────────────────────────────────────────────────────

  const loadYouTubeAPI = useCallback(() => {
    if (window.YT || document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
    window.onYouTubeIframeAPIReady = () => {
      ytReadyRef.current = true;
      ytCallbacksRef.current.forEach(fn => fn());
      ytCallbacksRef.current = [];
    };
  }, []);

  const waitForYT = useCallback((): Promise<void> => {
    return new Promise(resolve => {
      if (ytReadyRef.current) return resolve();
      ytCallbacksRef.current.push(resolve);
      loadYouTubeAPI();
    });
  }, [loadYouTubeAPI]);

  // ─── SoundCloud API ───────────────────────────────────────────────────────

  const loadSCAPI = useCallback((): Promise<void> => {
    return new Promise(resolve => {
      if (scLoadedRef.current) return resolve();
      if (window.SC) { scLoadedRef.current = true; return resolve(); }
      const s = document.createElement("script");
      s.src = "https://w.soundcloud.com/player/api.js";
      s.onload = () => { scLoadedRef.current = true; resolve(); };
      document.head.appendChild(s);
    });
  }, []);

  // ─── Player lifecycle ─────────────────────────────────────────────────────

  const destroyCurrent = useCallback(() => {
    isTransitioningRef.current = false;
    if (ytIntervalRef.current) { clearInterval(ytIntervalRef.current); ytIntervalRef.current = null; }
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.stopVideo(); ytPlayerRef.current.destroy(); } catch (_) {}
      ytPlayerRef.current = null;
    }
    if (scWidgetRef.current) {
      try { scWidgetRef.current.pause(); } catch (_) {}
      scWidgetRef.current = null;
    }
    const ytEl = document.getElementById("radio-yt-container");
    const scEl = document.getElementById("radio-sc-container");
    if (ytEl) ytEl.innerHTML = "";
    if (scEl) scEl.innerHTML = "";
  }, []);

  const playYouTube = useCallback(async (song: Song, seekTo: number): Promise<void> => {
    const videoId = extractYouTubeId(song.url);
    if (!videoId) { nextSongRef.current(); return; }

    await waitForYT();
    const YT = window.YT;
    if (!YT) { nextSongRef.current(); return; }

    return new Promise(resolve => {
      const container = document.getElementById("radio-yt-container");
      if (!container) return resolve();
      const div = document.createElement("div");
      container.appendChild(div);

      ytPlayerRef.current = new YT.Player(div, {
        videoId,
        playerVars: { autoplay: 1, playsinline: 1, controls: 0 },
        events: {
          onReady: e => {
            if (seekTo > 0) e.target.seekTo(seekTo, true);
            e.target.playVideo();
            resolve();
            ytIntervalRef.current = setInterval(() => {
              if (!ytPlayerRef.current) return;
              try {
                const dur = ytPlayerRef.current.getDuration();
                const cur = ytPlayerRef.current.getCurrentTime();
                if (dur > 0 && cur >= dur - 1.5) {
                  clearInterval(ytIntervalRef.current!);
                  ytIntervalRef.current = null;
                  nextSongRef.current();
                }
              } catch (_) {}
            }, 1500);
          },
          onStateChange: e => {
            if (e.data === 0) {
              if (ytIntervalRef.current) { clearInterval(ytIntervalRef.current); ytIntervalRef.current = null; }
              nextSongRef.current();
            }
          },
          onError: () => nextSongRef.current(),
        },
      });
    });
  }, [waitForYT]);

  const playSoundCloud = useCallback(async (song: Song, seekTo: number): Promise<void> => {
    await loadSCAPI();
    if (!window.SC) { nextSongRef.current(); return; }

    return new Promise(resolve => {
      const container = document.getElementById("radio-sc-container");
      if (!container) return resolve();

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "width:300px;height:166px;border:none;";
      iframe.allow = "autoplay";
      iframe.src =
        `https://w.soundcloud.com/player/?url=${encodeURIComponent(song.url)}` +
        `&auto_play=true&buying=false&liking=false&download=false` +
        `&sharing=false&show_artwork=false&show_comments=false` +
        `&show_playcount=false&show_user=false&hide_related=true`;
      container.appendChild(iframe);

      const widget = window.SC!.Widget(iframe);
      scWidgetRef.current = widget;
      widget.bind(window.SC!.Widget.Events.READY, () => {
        if (seekTo > 0) widget.seekTo(seekTo * 1000);
        resolve();
      });
      widget.bind(window.SC!.Widget.Events.FINISH, () => nextSongRef.current());
      widget.bind(window.SC!.Widget.Events.ERROR, () => nextSongRef.current());
    });
  }, [loadSCAPI]);

  const playSong = useCallback(async (song: Song, liveEntry = false) => {
    destroyCurrent();
    isTransitioningRef.current = false;
    const seekTo = liveEntry ? Math.floor(Math.random() * 180) : 0;
    setCurrentSong({ title: song.title, artist: song.artist, url: song.url });
    setIsPlaying(false);

    if (song.provider === "youtube") {
      await playYouTube(song, seekTo);
      setIsPlaying(true);
    } else if (song.provider === "soundcloud") {
      await playSoundCloud(song, seekTo);
      setIsPlaying(true);
    } else {
      nextSongRef.current();
    }
  }, [destroyCurrent, playYouTube, playSoundCloud]);

  const nextSong = useCallback(() => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    const songs = songsRef.current;
    if (!songs.length) { isTransitioningRef.current = false; return; }
    songIndexRef.current = (songIndexRef.current + 1) % songs.length;
    playSong(songs[songIndexRef.current]);
  }, [playSong]);

  useEffect(() => { nextSongRef.current = nextSong; }, [nextSong]);

  const stop = useCallback(() => {
    destroyCurrent();
    setActiveStation(null);
    setCurrentSong(null);
    setIsPlaying(false);
    setIsLoading(false);
    songsRef.current = [];
    songIndexRef.current = 0;
  }, [destroyCurrent]);

  const selectStation = useCallback(async (station: Station) => {
    if (activeStationRef.current?.slug === station.slug) {
      stop();
      return;
    }

    destroyCurrent();
    setActiveStation(station);
    setIsLoading(true);
    setIsPlaying(false);
    setCurrentSong(null);

    try {
      const songs = await fetchStationSongs(station.slug);

      if (!songs.length) {
        setIsLoading(false);
        setCurrentSong({ title: "NO PLAYABLE TRACKS", artist: "", url: "" });
        return;
      }

      const ordered = station.shuffle !== false ? shuffleArray(songs) : songs;
      songsRef.current = ordered;
      songIndexRef.current = 0;
      setIsLoading(false);

      await playSong(ordered[0], true);
    } catch (err) {
      console.error("Radio error:", err);
      setIsLoading(false);
      setCurrentSong({ title: "FAILED TO LOAD", artist: "", url: "" });
    }
  }, [destroyCurrent, stop, playSong]);

  return (
    <RadioContext.Provider value={{ activeStation, currentSong, isPlaying, isLoading, selectStation, stop }}>
      {children}
      <div style={{ position: "fixed", opacity: 0, pointerEvents: "none", zIndex: -1, width: 1, height: 1, overflow: "hidden" }}>
        <div id="radio-yt-container" />
        <div id="radio-sc-container" />
      </div>
    </RadioContext.Provider>
  );
}
