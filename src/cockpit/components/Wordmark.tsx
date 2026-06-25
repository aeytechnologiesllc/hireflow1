interface WordmarkProps {
  size?: number;
  className?: string;
}

/** "Hireflow" — Fraunces serif with a brass sprout leaf as the dot of the i. */
export function Wordmark({ size = 26, className }: WordmarkProps) {
  const leaf = size * 0.62;
  return (
    <span
      className={`font-display inline-flex items-baseline ${className ?? ""}`}
      style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.015em", color: "hsl(150 32% 95%)", lineHeight: 1 }}
    >
      H
      <span style={{ position: "relative" }}>
        {/* dotless i */}
        {"\u0131"}
        <svg
          width={leaf}
          height={leaf}
          viewBox="0 0 24 24"
          fill="none"
          style={{ position: "absolute", left: "50%", top: -leaf * 0.78, transform: "translateX(-48%)" }}
        >
          <path
            d="M12 22C12 22 11 14 14 9C16.5 4.8 21 3 21 3C21 3 21.2 8.5 18.5 12.2C16 15.6 12 16 12 22Z"
            fill="hsl(38 64% 66%)"
          />
          <path
            d="M12 22C12 22 12.4 15.5 9.5 11.5C7.4 8.6 3.5 7.5 3.5 7.5C3.5 7.5 3.6 11.8 6 14.6C8 17 12 17.5 12 22Z"
            fill="hsl(152 44% 50%)"
          />
        </svg>
      </span>
      reflow
    </span>
  );
}

export default Wordmark;
