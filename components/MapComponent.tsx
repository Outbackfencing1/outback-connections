'use client';

// Simple placeholder map that works everywhere (no extra libs).
// Click anywhere in the grey box to "select" a Sydney coordinate.
type MapProps = { onSelect?: (lat: number, lng: number) => void };

export default function MapComponent({ onSelect }: MapProps) {
  return (
    <div
      className="h-full w-full flex items-center justify-center bg-gray-200 cursor-pointer select-none"
      onClick={() => onSelect?.(-33.8688, 151.2093)} // Sydney CBD for testing
      title="Click to simulate selecting a location"
    >
      <p className="text-gray-600">Map placeholder – click to simulate dropping a pin.</p>
    </div>
  );
}
