import { motion, useReducedMotion } from 'framer-motion'
import { GeneratorArt } from './GeneratorArt'

// The homepage's one orchestrated moment: the genset's panel light comes on,
// the cable runs out to the festoon line and the bulbs light up in turn.
const BULBS = Array.from({ length: 9 }, (_, i) => {
  const x = 150 + i * 50
  const sag = Math.sin((i / 8) * Math.PI) * 34
  return { x, y: 70 + sag }
})

export function HeroScene() {
  const reduce = useReducedMotion()
  const delay = (s: number) => (reduce ? 0 : s)

  return (
    <svg viewBox="0 0 600 440" className="h-auto w-full" role="img" aria-label="A silent diesel generator powering a line of festoon lights at a site">
      <defs>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFD27A" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFD27A" stopOpacity="0" />
        </radialGradient>
        <pattern id="mesh" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0H0V22" fill="none" stroke="#ffffff" strokeOpacity="0.05" />
        </pattern>
      </defs>

      {/* site backdrop: scaffold frame and ground */}
      <rect width="600" height="440" fill="url(#mesh)" />
      <g stroke="#ffffff" strokeOpacity="0.09" strokeWidth="3" fill="none">
        <path d="M430 400V150M520 400V150M430 150h90M430 230h90M430 310h90M430 150l90 80M520 230l-90 80" />
        <path d="M120 400V40M590 400V40" />
      </g>
      <rect y="398" width="600" height="42" fill="#17191C" />
      <path d="M0 398h600" stroke="#F2A20C" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="18 12" />

      {/* festoon line */}
      <path d={`M120 52 Q 350 140 590 52`} stroke="#0d0f11" strokeWidth="2.5" fill="none" />
      {BULBS.map((b, i) => (
        <g key={i}>
          <line x1={b.x} y1={b.y - 6} x2={b.x} y2={b.y + 4} stroke="#0d0f11" strokeWidth="2" />
          <motion.circle
            cx={b.x} cy={b.y + 14} r="26" fill="url(#glow)"
            initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }}
            transition={{ delay: delay(1.9 + i * 0.09), duration: 0.5 }}
          />
          <motion.circle
            cx={b.x} cy={b.y + 12} r="7"
            initial={{ fill: reduce ? '#FFE3A3' : '#4A4F57' }} animate={{ fill: '#FFE3A3' }}
            transition={{ delay: delay(1.9 + i * 0.09), duration: 0.25 }}
          />
        </g>
      ))}

      {/* cable from the genset panel to the festoon pole */}
      <path d="M352 318 C 385 318, 380 398, 420 398 S 590 398, 590 330 L 590 52" stroke="#0d0f11" strokeWidth="7" fill="none" strokeLinecap="round" />
      <motion.path
        d="M352 318 C 385 318, 380 398, 420 398 S 590 398, 590 330 L 590 52"
        stroke="#F2A20C" strokeWidth="2.5" fill="none" strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }}
        transition={{ delay: delay(0.7), duration: reduce ? 0 : 1.2, ease: 'easeInOut' }}
      />

      <GeneratorArt kva={82} running x="-20" y="163" width="440" height="264" title="82 kVA silent generator running" />
    </svg>
  )
}
