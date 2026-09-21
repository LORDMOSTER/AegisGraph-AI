import { useEffect, useRef, useState, useCallback } from 'react';

interface ThemeTransitionOverlayProps {
  darkMode: boolean;
}

// Full-screen pixel-reveal overlay that fires whenever darkMode flips.
// We snapshot the page colour, fill a pixel grid over the whole viewport,
// stagger them in, swap the theme mid-flight, then stagger them out.
export function ThemeTransitionOverlay({ darkMode }: ThemeTransitionOverlayProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const prevDark = useRef(darkMode);

  const COLS = 16;
  const ROWS = 10;
  const PIXEL_DURATION = 300; // ms per pixel
  const STAGGER = 50;         // ms between pixels
  const TOTAL = STAGGER * (COLS * ROWS) + PIXEL_DURATION;

  const runTransition = useCallback(() => {
    setIsAnimating(true);
    // Clear after full animation
    setTimeout(() => {
      setIsAnimating(false);
    }, TOTAL);
  }, [TOTAL]);

  useEffect(() => {
    if (prevDark.current !== darkMode) {
      prevDark.current = darkMode;
      runTransition();
    }
  }, [darkMode, runTransition]);

  if (!isAnimating) return null;

  const pixels = Array.from({ length: COLS * ROWS }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    // Diagonal wave pattern
    const offset = ((col + row) / (COLS + ROWS)) * STAGGER * (COLS + ROWS) * 0.5;
    return { i, col, row, offset };
  });

  const pixelW = `${100 / COLS}%`;
  const pixelH = `${100 / ROWS}%`;

  // Colour: going dark→light = white pixels; light→dark = dark pixels
  const pixelColor = darkMode ? '#0f172a' : '#f8fafc';

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      {pixels.map(({ i, col, row, offset }) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${(col / COLS) * 100}%`,
            top: `${(row / ROWS) * 100}%`,
            width: pixelW,
            height: pixelH,
            background: pixelColor,
            borderRadius: 4,
            animation: `pixelReveal ${PIXEL_DURATION}ms ease-in-out ${offset}ms both`,
          }}
        />
      ))}

      <style>{`
        @keyframes pixelReveal {
          0%   { transform: scale(0); opacity: 0; }
          40%  { transform: scale(1.05); opacity: 1; }
          60%  { transform: scale(1); opacity: 1; }
          100% { transform: scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
