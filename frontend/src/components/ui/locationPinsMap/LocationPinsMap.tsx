import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { LocationPin } from "../../../types/dashboard";
import "./LocationPinsMap.css";

type LocationPinsMapProps = {
  title: string;
  description: string;
  pins: LocationPin[];
};

type MapSize = {
  width: number;
  height: number;
};

type ProjectedPoint = {
  x: number;
  y: number;
};

type Tile = {
  key: string;
  src: string;
  style: CSSProperties;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 7;
const MAX_ZOOM = 12;
const DEFAULT_MAP_SIZE: MapSize = { width: 760, height: 360 };
const pinJitter = [
  [0, 0],
  [8, -6],
  [-8, 6],
  [9, 7],
  [-9, -5],
  [4, 9],
] as const;

const getMapUrl = (gpsLat: number, gpsLong: number) =>
  `https://www.google.com/maps/search/?api=1&query=${gpsLat},${gpsLong}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getProjectedPoint = (
  gpsLat: number,
  gpsLong: number,
  zoom: number,
): ProjectedPoint => {
  const latRad = (gpsLat * Math.PI) / 180;
  const sinLat = clamp(Math.sin(latRad), -0.9999, 0.9999);
  const scale = TILE_SIZE * 2 ** zoom;

  return {
    x: ((gpsLong + 180) / 360) * scale,
    y:
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
};

const getMapCenter = (pins: LocationPin[]) => {
  if (pins.length === 0) {
    return {
      gpsLat: 0,
      gpsLong: 0,
    };
  }

  const latitudes = pins.map((pin) => pin.gpsLat);
  const longitudes = pins.map((pin) => pin.gpsLong);

  return {
    gpsLat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    gpsLong: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  };
};

const getBaseZoom = (pins: LocationPin[], size: MapSize) => {
  if (pins.length === 0) {
    return MIN_ZOOM;
  }

  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const points = pins.map((pin) =>
      getProjectedPoint(pin.gpsLat, pin.gpsLong, zoom),
    );
    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const pointWidth = Math.max(...xValues) - Math.min(...xValues);
    const pointHeight = Math.max(...yValues) - Math.min(...yValues);

    if (pointWidth <= size.width * 0.78 && pointHeight <= size.height * 0.62) {
      return zoom;
    }
  }

  return MIN_ZOOM;
};

const getTileSource = (zoom: number, tileX: number, tileY: number) =>
  `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;

const getPinTypeLabel = (pin: LocationPin) => {
  if (pin.kind === "farm") return "Farm pin";
  if (pin.kind === "farmer") return "Farmer";

  return "User";
};

export function LocationPinsMap({
  title,
  description,
  pins,
}: LocationPinsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const lastWheelZoomAtRef = useRef(0);
  const [mapSize, setMapSize] = useState<MapSize>(DEFAULT_MAP_SIZE);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(
    pins[0]?.id ?? null,
  );
  const [zoomOffset, setZoomOffset] = useState(0);

  useEffect(() => {
    if (!mapRef.current) return;

    const updateMapSize = () => {
      if (!mapRef.current) return;
      const { width, height } = mapRef.current.getBoundingClientRect();

      setMapSize({
        width: Math.max(Math.round(width), 1),
        height: Math.max(Math.round(height), 1),
      });
    };

    updateMapSize();

    const observer = new ResizeObserver(updateMapSize);
    observer.observe(mapRef.current);

    return () => observer.disconnect();
  }, []);

  const mapCenter = useMemo(() => getMapCenter(pins), [pins]);
  const baseZoom = useMemo(() => getBaseZoom(pins, mapSize), [mapSize, pins]);
  const mapZoom = clamp(baseZoom + zoomOffset, MIN_ZOOM, MAX_ZOOM);
  const centerPoint = useMemo(
    () => getProjectedPoint(mapCenter.gpsLat, mapCenter.gpsLong, mapZoom),
    [mapCenter.gpsLat, mapCenter.gpsLong, mapZoom],
  );
  const topLeft = useMemo(
    () => ({
      x: centerPoint.x - mapSize.width / 2,
      y: centerPoint.y - mapSize.height / 2,
    }),
    [centerPoint, mapSize],
  );
  const selectedPin =
    pins.find((pin) => pin.id === selectedPinId) ?? pins[0] ?? null;
  const plottedPins = useMemo(
    () =>
      pins.map((pin, index) => {
        const point = getProjectedPoint(pin.gpsLat, pin.gpsLong, mapZoom);
        const [offsetX, offsetY] = pinJitter[index % pinJitter.length];

        return {
          pin,
          style: {
            left: `${point.x - topLeft.x + offsetX}px`,
            top: `${point.y - topLeft.y + offsetY}px`,
          },
        };
      }),
    [mapZoom, pins, topLeft],
  );
  const tiles = useMemo<Tile[]>(() => {
    const tileCount = 2 ** mapZoom;
    const startTileX = Math.floor(topLeft.x / TILE_SIZE);
    const endTileX = Math.floor((topLeft.x + mapSize.width) / TILE_SIZE);
    const startTileY = Math.floor(topLeft.y / TILE_SIZE);
    const endTileY = Math.floor((topLeft.y + mapSize.height) / TILE_SIZE);
    const mapTiles: Tile[] = [];

    for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;

      for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
        if (tileY < 0 || tileY >= tileCount) continue;

        mapTiles.push({
          key: `${mapZoom}-${tileX}-${tileY}`,
          src: getTileSource(mapZoom, wrappedTileX, tileY),
          style: {
            left: `${tileX * TILE_SIZE - topLeft.x}px`,
            top: `${tileY * TILE_SIZE - topLeft.y}px`,
          },
        });
      }
    }

    return mapTiles;
  }, [mapSize.height, mapSize.width, mapZoom, topLeft]);
  const userPinCount = pins.filter((pin) => pin.kind !== "farm").length;
  const farmPinCount = pins.length - userPinCount;
  const adjustZoom = useCallback((change: number) => {
    setZoomOffset((current) =>
      clamp(current + change, MIN_ZOOM - baseZoom, MAX_ZOOM - baseZoom),
    );
  }, [baseZoom]);
  const handleMapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      adjustZoom(1);
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      adjustZoom(-1);
    }
  };

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapElement) return;

    const handleMapWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 8) return;

      event.preventDefault();
      event.stopPropagation();

      const now = Date.now();
      if (now - lastWheelZoomAtRef.current < 120) return;

      lastWheelZoomAtRef.current = now;
      adjustZoom(event.deltaY < 0 ? 1 : -1);
    };

    mapElement.addEventListener("wheel", handleMapWheel, { passive: false });

    return () => {
      mapElement.removeEventListener("wheel", handleMapWheel);
    };
  }, [adjustZoom]);

  if (pins.length === 0) {
    return null;
  }

  return (
    <section className="location-map-panel" aria-labelledby="location-map-title">
      <div className="location-map-copy">
        <div>
          <span className="management-count">ADMIN MAP</span>
          <h3 id="location-map-title">{title}</h3>
          <p>{description}</p>
        </div>
        <div className="location-map-stats" aria-label="Map pin totals">
          <span>
            <strong>{pins.length}</strong>
            Total pins
          </span>
          <span>
            <strong>{userPinCount}</strong>
            Users
          </span>
          <span>
            <strong>{farmPinCount}</strong>
            Farm pins
          </span>
        </div>
      </div>
      <div className="location-map-layout">
        <div
          className="location-map-canvas"
          ref={mapRef}
          role="application"
          tabIndex={0}
          aria-label="Real map with user and farmer pins"
          onDoubleClick={() => adjustZoom(1)}
          onKeyDown={handleMapKeyDown}
        >
          <div className="location-map-tiles" aria-hidden="true">
            {tiles.map((tile) => (
              <img
                className="location-map-tile"
                draggable="false"
                key={tile.key}
                loading="lazy"
                src={tile.src}
                style={tile.style}
                alt=""
              />
            ))}
          </div>
          <div className="location-map-controls" aria-label="Map zoom controls">
            <button
              type="button"
              onClick={() => adjustZoom(1)}
              disabled={mapZoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => adjustZoom(-1)}
              disabled={mapZoom <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              -
            </button>
          </div>
          {plottedPins.map(({ pin, style }, index) => (
            <button
              className={`location-pin location-pin-${pin.kind} ${
                selectedPin?.id === pin.id ? "is-selected" : ""
              }`}
              key={pin.id}
              type="button"
              style={style}
              onClick={() => setSelectedPinId(pin.id)}
              aria-label={`${getPinTypeLabel(pin)} ${pin.label}, ${pin.detail}`}
            >
              <span>{index + 1}</span>
            </button>
          ))}
          {selectedPin && (
            <article className="location-map-detail">
              <span className={`status ${selectedPin.tone}`}>
                <i />
                {selectedPin.status}
              </span>
              <strong>{selectedPin.label}</strong>
              <small>{selectedPin.owner}</small>
              <p>{selectedPin.detail}</p>
              <a
                href={getMapUrl(selectedPin.gpsLat, selectedPin.gpsLong)}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            </article>
          )}
          <a
            className="location-map-attribution"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            &copy; OpenStreetMap contributors
          </a>
        </div>
        <div className="location-map-list" aria-label="All map pins">
          {pins.map((pin) => (
            <button
              className={selectedPin?.id === pin.id ? "is-selected" : ""}
              key={pin.id}
              type="button"
              onClick={() => setSelectedPinId(pin.id)}
            >
              <span className={`location-pin-dot location-pin-${pin.kind}`} />
              <span>
                <strong>{pin.label}</strong>
                <small>{pin.owner}</small>
              </span>
              <em>{getPinTypeLabel(pin)}</em>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
