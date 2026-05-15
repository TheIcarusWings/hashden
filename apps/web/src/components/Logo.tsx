type LogoProps = {
  size?: number;
  className?: string;
};

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="Hashden"
      className={className}
    >
      <rect x="2" y="10" width="28" height="3" fill="currentColor" />
      <rect x="2" y="19" width="28" height="3" fill="currentColor" />
      <polygon points="4,30 9,30 13,2 8,2" fill="currentColor" />
      <polygon points="19,30 24,30 28,2 23,2" fill="currentColor" />
    </svg>
  );
}
