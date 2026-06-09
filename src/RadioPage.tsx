import { useEffect, useState } from "react";
import { useRadio } from "./RadioContext";
import { STATIONS, type Station } from "./radio-stations";
import { fetchChannelLogo, extractArenaSlug, fetchChannelInfo } from "./lib/arena";
import {
  loadCustomStations,
  addCustomStation,
  removeCustomStation,
} from "./custom-stations";

function useStationLogos(stations: Station[]) {
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  // Re-fetch whenever the set of slugs changes (e.g. a custom station is added).
  const slugKey = stations.map(s => s.slug).join(",");
  useEffect(() => {
    stations.forEach(station => {
      if (station.slug in logos) return; // already fetched
      fetchChannelLogo(station.slug)
        .then(logo => {
          if (logo) setLogos(prev => ({ ...prev, [station.slug]: logo }));
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugKey]);
  return logos;
}

export function RadioPage() {
  const radio = useRadio();
  const [customStations, setCustomStations] = useState<Station[]>(() => loadCustomStations());
  const builtinSlugs = new Set(STATIONS.map(s => s.slug));
  const stations = [...STATIONS, ...customStations];
  const logos = useStationLogos(stations);

  const handleAdd = (station: Station) => setCustomStations(addCustomStation(station));
  const handleRemove = (slug: string) => {
    if (radio.activeStation?.slug === slug) radio.stop();
    setCustomStations(removeCustomStation(slug));
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Header */}
      <div style={{ width: "100%", maxWidth: 480, padding: "24px 16px 12px" }}>
        <a
          href="https://sohrob.xyz"
          style={{
            display: "block",
            textAlign: "center",
            color: "#fff",
            textDecoration: "none",
            fontWeight: "bold",
            fontFamily: "var(--font-nav)",
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
          className="back-link"
        >
          <span style={{ display: "block", fontSize: 28 }}>MADE FOR</span>
          <span style={{ display: "block", fontSize: 28, textDecoration: "underline" }}>sohrob.xyz</span>
        </a>
      </div>

      <NowPlaying />

      {/* Station list */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#1c1c1c",
          border: "2px solid #231F20",
        }}
      >
        {stations.map(station => (
          <StationRow
            key={station.slug}
            station={station}
            logo={logos[station.slug] ?? null}
            isActive={radio.activeStation?.slug === station.slug}
            isLoading={radio.isLoading && radio.activeStation?.slug === station.slug}
            onSelect={() => radio.selectStation(station)}
            onRemove={builtinSlugs.has(station.slug) ? undefined : () => handleRemove(station.slug)}
          />
        ))}

        <AddStation
          onAdd={handleAdd}
          existingSlugs={new Set(stations.map(s => s.slug))}
        />
      </div>

      <style>{`
        .back-link:hover { color: #fff; }
        .remove-station { opacity: 0; transition: opacity 0.15s; }
        .station-row:hover .remove-station { opacity: 1; }
      `}</style>
    </div>
  );
}

function AddStation({
  onAdd,
  existingSlugs,
}: {
  onAdd: (station: Station) => void;
  existingSlugs: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [explicit, setExplicit] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState("");

  const reset = () => {
    setUrl(""); setName(""); setDescription(""); setExplicit(false);
    setStatus("idle"); setError("");
  };

  const submit = async () => {
    setStatus("checking");
    setError("");

    const slug = extractArenaSlug(url);
    if (!slug) {
      setStatus("error");
      setError("Paste an are.na channel URL or slug.");
      return;
    }
    if (existingSlugs.has(slug)) {
      setStatus("error");
      setError("That station is already in your list.");
      return;
    }

    const info = await fetchChannelInfo(slug);
    if (!info) {
      setStatus("error");
      setError("Couldn't find that are.na channel. Is it public?");
      return;
    }

    onAdd({
      slug,
      name: name.trim() || info.title,
      description: description.trim() || undefined,
      shuffle: true,
      explicit: explicit || undefined,
    });
    reset();
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          width: "100%",
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "#4ade80",
          fontFamily: "inherit",
          fontSize: 15,
        }}
        className="station-row"
      >
        <span
          style={{
            width: 56, height: 56, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px dashed #555", color: "#888", fontSize: 28, lineHeight: 1,
          }}
        >
          +
        </span>
        Add a station
      </button>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "#2a2a2a",
    border: "1px solid #3a3a3a",
    color: "#fff",
    fontFamily: "inherit",
    fontSize: 14,
    borderRadius: 4,
  };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Add a station</div>
      <input
        autoFocus
        style={inputStyle}
        placeholder="are.na channel URL or slug"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
      />
      <input
        style={inputStyle}
        placeholder="Display name (optional)"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
      />
      <input
        style={inputStyle}
        placeholder="Description (optional)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#888", fontSize: 13 }}>
        <input type="checkbox" checked={explicit} onChange={e => setExplicit(e.target.checked)} />
        Mark explicit
      </label>

      {error && <div style={{ color: "#e53e3e", fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={submit}
          disabled={status === "checking"}
          style={{
            flex: 1, padding: "8px 12px", background: "#FF5E00", color: "#000",
            border: "none", borderRadius: 4, fontFamily: "inherit", fontSize: 14,
            fontWeight: "bold", cursor: "pointer",
            opacity: status === "checking" ? 0.6 : 1,
          }}
        >
          {status === "checking" ? "Checking…" : "Add"}
        </button>
        <button
          onClick={() => { reset(); setOpen(false); }}
          style={{
            padding: "8px 12px", background: "transparent", color: "#888",
            border: "1px solid #3a3a3a", borderRadius: 4, fontFamily: "inherit",
            fontSize: 14, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function NowPlaying() {
  const radio = useRadio();
  const song = radio.currentSong;

  const tickerText = song
    ? (song.artist ? `${song.artist} – ${song.title}` : song.title).toUpperCase()
    : "NOTHING IS PLAYING";

  // ~40px/s scroll; ~12px per char at this font size.
  const tickerDuration = Math.max(6, (tickerText.length * 12) / 40);

  return (
    <div style={{ width: "100%", maxWidth: 480, padding: "8px 16px 16px" }}>
      <a
        href={song?.url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          background: "#2a2a2a",
          color: "#FF5E00",
          padding: "6px 12px",
          borderRadius: 6,
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.4)",
          fontFamily: "var(--font-ticker)",
          fontSize: 15,
          textDecoration: "none",
          cursor: song?.url ? "pointer" : "default",
        }}
      >
        <span
          key={tickerText}
          style={{
            display: "inline-block",
            whiteSpace: "nowrap",
            letterSpacing: "0.08em",
            animation: `marquee ${tickerDuration}s linear infinite`,
          }}
        >
          {tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        </span>
      </a>
    </div>
  );
}

function StationRow({
  station,
  logo,
  isActive,
  isLoading,
  onSelect,
  onRemove,
}: {
  station: Station;
  logo: string | null;
  isActive: boolean;
  isLoading: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        width: "100%",
        padding: "12px 16px",
        background: isActive ? "#242424" : "transparent",
        borderBottom: "1px solid #2e2e2e",
        cursor: "pointer",
        textAlign: "left",
        color: "inherit",
        fontFamily: "inherit",
      }}
      className="station-row"
    >
      {/* Thumbnail */}
      <div
        style={{
          width: 56,
          height: 56,
          flexShrink: 0,
          background: "#333",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          fontSize: 22,
          fontWeight: "bold",
          letterSpacing: "-0.03em",
          overflow: "hidden",
        }}
      >
        {logo
          ? <img src={logo} alt={station.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : station.name[0].toUpperCase()
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {isActive && (
            <span style={{ color: "#e53e3e", fontSize: 10, lineHeight: 1 }}>●</span>
          )}
          <span
            style={{
              color: "#fff",
              fontWeight: "bold",
              fontSize: 17,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            {station.name}
          </span>
          {station.explicit && (
            <span
              style={{
                background: "#ff0000",
                color: "#fff",
                fontSize: 9,
                fontWeight: "bold",
                padding: "1px 5px",
                letterSpacing: "0.02em",
                flexShrink: 0,
              }}
            >
              E
            </span>
          )}
        </div>

        {station.description && (
          <div
            style={{
              color: "#888",
              fontSize: 13,
              letterSpacing: "-0.01em",
              marginBottom: 4,
            }}
          >
            {station.description}
          </div>
        )}

        <div
          style={{
            color: isActive ? "#888" : "#4ade80",
            fontSize: 13,
            letterSpacing: "0.02em",
          }}
        >
          {isLoading ? "Loading…" : isActive ? "■ Stop" : "> Play"}
        </div>
      </div>

      {/* Remove — custom stations only */}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove station"
          aria-label="Remove station"
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            background: "transparent",
            border: "none",
            color: "#888",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
          }}
          className="remove-station"
        >
          ✕
        </button>
      )}
    </div>
  );
}
