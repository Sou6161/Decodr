import { useMemo, type CSSProperties } from 'react';

/**
 * The anime night scene behind the whole app: a glowing moon, twinkling stars,
 * and soft light-motes (fireflies) drifting down. Purely decorative, fixed, and
 * non-interactive. Animations are CSS (see index.css keyframes).
 */
export function AnimeBackdrop() {
  const stars = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        top: `${Math.random() * 82}%`,
        left: `${Math.random() * 100}%`,
        size: `${1 + Math.random() * 1.8}px`,
        delay: `${Math.random() * 4}s`,
        duration: `${2.5 + Math.random() * 3}s`,
        gold: i % 5 === 0,
      })),
    [],
  );

  const motes = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: `${Math.random() * 100}%`,
        delay: `${(i * 1.5) % 15}s`,
        duration: `${12 + Math.random() * 10}s`,
        drift: `${(Math.random() * 140 - 40).toFixed(0)}px`,
        size: 4 + Math.round(Math.random() * 4),
        gold: i % 3 === 0,
      })),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Soft silver moon with craters + a gentle glow */}
      <div className="absolute" style={{ right: '9%', top: '10%' }}>
        <div
          className="relative h-24 w-24 overflow-hidden rounded-full"
          style={{
            background: 'oklch(0.91 0.022 235)',
            boxShadow: '0 0 60px 16px oklch(0.9 0.05 235 / 0.25)',
          }}
        >
          {[
            { w: 18, h: 18, top: 16, left: 22 },
            { w: 11, h: 11, top: 48, left: 12 },
            { w: 8, h: 8, top: 30, left: 60 },
            { w: 6, h: 6, top: 62, left: 48 },
          ].map((c, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                width: c.w,
                height: c.h,
                top: c.top,
                left: c.left,
                background: 'oklch(0.8 0.02 238 / 0.45)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Stars */}
      {stars.map((s, i) => (
        <span
          key={`star-${i}`}
          className="absolute rounded-full"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            background: s.gold ? 'var(--color-gold)' : 'oklch(0.98 0.01 320)',
            animation: `twinkle ${s.duration} ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}

      {/* Drifting light motes (fireflies) */}
      {motes.map((m, i) => {
        const color = m.gold ? 'var(--color-gold)' : 'var(--color-sky)';
        return (
          <div
            key={`mote-${i}`}
            className="absolute top-0 rounded-full"
            style={
              {
                left: m.left,
                width: m.size,
                height: m.size,
                background: color,
                boxShadow: `0 0 ${m.size * 2}px ${m.size / 2}px color-mix(in oklch, ${color} 60%, transparent)`,
                '--drift': m.drift,
                animation: `mote-drift ${m.duration} linear ${m.delay} infinite`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
