interface BrandMarkProps {
  size?: number;
  className?: string;
}

// Custom HireFlow mark — emerald tile with an "orbit" glyph (white ring + core + a
// brass satellite) that nods to Ava's orb. Replaces the off-brand stock logo png.
export default function BrandMark({ size = 40, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hfMarkGrad" x1="3" y1="3" x2="37" y2="37" gradientUnits="userSpaceOnUse">
          <stop stopColor="#23b487" />
          <stop offset="1" stopColor="#0b5740" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#hfMarkGrad)" />
      <rect x="1.75" y="1.75" width="36.5" height="36.5" rx="10.25" fill="none" stroke="rgba(255,255,255,0.16)" />
      <circle cx="20" cy="20" r="8.4" fill="none" stroke="#eef6f1" strokeWidth="1.7" strokeOpacity="0.9" />
      <circle cx="20" cy="20" r="2.5" fill="#eef6f1" />
      <circle cx="28.4" cy="20" r="2.2" fill="#e6c184" />
    </svg>
  );
}
