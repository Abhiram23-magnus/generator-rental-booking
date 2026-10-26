import { useId, type SVGProps } from 'react'

// Drawn side view of a silent canopy genset. The enclosure grows with capacity so
// the lineup reads as a range of sizes. Used until the owner uploads real photos.
export function GeneratorArt({ kva, running = false, className = '', title, ...rest }: { kva: number; running?: boolean; className?: string; title?: string } & Omit<SVGProps<SVGSVGElement>, 'viewBox'>) {
  const uid = useId().replace(/:/g, '')
  const t = Math.min(Math.max((Number(kva) - 25) / 100, 0), 1)
  const w = 190 + t * 160
  const h = 96 + t * 44
  const x = (400 - w) / 2
  const top = 200 - h
  const panelX = x + w * 0.4
  const plateX = x + w * 0.72

  return (
    <svg viewBox="0 0 400 240" className={className} {...rest} role="img" aria-label={title ?? `${kva} kVA silent diesel generator`}>
      <defs>
        <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7B637" />
          <stop offset="0.55" stopColor="#F2A20C" />
          <stop offset="1" stopColor="#D88E05" />
        </linearGradient>
        <linearGradient id={`floor-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="200" cy="214" rx={w * 0.58} ry="10" fill={`url(#floor-${uid})`} />

      {/* exhaust */}
      <rect x={x + w * 0.83} y={top - 30} width="11" height="30" rx="2" fill="#3A3F46" />
      <rect x={x + w * 0.83 - 3} y={top - 34} width="17" height="6" rx="2" fill="#2A2E33" />

      {/* skid base */}
      <rect x={x - 8} y="198" width={w + 16} height="12" rx="2" fill="#2A2E33" />
      <rect x={x + 6} y="210" width="16" height="5" fill="#2A2E33" />
      <rect x={x + w - 22} y="210" width="16" height="5" fill="#2A2E33" />

      {/* canopy */}
      <rect x={x} y={top} width={w} height={h} rx="5" fill={`url(#body-${uid})`} />
      <rect x={x - 4} y={top - 7} width={w + 8} height="10" rx="3" fill="#C98400" />
      <circle cx={x + 24} cy={top - 10} r="4" fill="none" stroke="#3A3F46" strokeWidth="3" />
      <circle cx={x + w - 24} cy={top - 10} r="4" fill="none" stroke="#3A3F46" strokeWidth="3" />

      {/* door seams */}
      {[0.34, 0.66].map((f) => (
        <line key={f} x1={x + w * f} y1={top + 6} x2={x + w * f} y2="196" stroke="#9C6800" strokeOpacity="0.55" strokeWidth="1.5" />
      ))}

      {/* intake louvres */}
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={x + 14} y={top + 16 + i * ((h - 34) / 7)} width={w * 0.34 - 28} height="4" rx="2" fill="#7A5200" fillOpacity="0.55" />
      ))}

      {/* control panel window */}
      <rect x={panelX} y={top + 16} width={w * 0.2} height={Math.min(46, h * 0.42)} rx="3" fill="#23272C" />
      <circle cx={panelX + 12} cy={top + 30} r="4.5" fill={running ? '#3DDC84' : '#55606B'}>
        {running && <animate attributeName="opacity" values="1;0.45;1" dur="2.4s" repeatCount="indefinite" />}
      </circle>
      <circle cx={panelX + w * 0.2 - 16} cy={top + 34} r="8" fill="none" stroke="#8C96A0" strokeWidth="2" />
      <line x1={panelX + w * 0.2 - 16} y1={top + 34} x2={panelX + w * 0.2 - 11} y2={top + 29} stroke="#F2A20C" strokeWidth="2" />
      <rect x={panelX + 8} y={top + 44} width={w * 0.2 - 16} height="3" rx="1.5" fill="#55606B" />

      {/* rating plate */}
      <rect x={plateX} y={top + 16} width={w * 0.2} height="30" rx="2" fill="#F4F5F6" />
      <text x={plateX + w * 0.1} y={top + 37} textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight="800"
        fontSize={Math.min(15, w * 0.055)} fill="#1F2226" style={{ fontStretch: '115%' }}>
        {Number(kva)} kVA
      </text>

      {/* door handles */}
      <rect x={x + w * 0.34 - 10} y={top + h * 0.55} width="5" height="16" rx="2" fill="#3A3F46" />
      <rect x={x + w * 0.66 - 10} y={top + h * 0.55} width="5" height="16" rx="2" fill="#3A3F46" />
    </svg>
  )
}
