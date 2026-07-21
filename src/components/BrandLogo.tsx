import Link from "next/link";

type Props = {
  href?: string;
  /** Wordmark size */
  size?: "sm" | "md" | "lg" | "hero";
  /** Show “Flowlytics” text beside the mark */
  wordmark?: boolean;
  className?: string;
};

const MARK = {
  sm: 28,
  md: 34,
  lg: 44,
  hero: 64,
} as const;

const WORD = {
  sm: "text-[1.35rem]",
  md: "text-[1.65rem]",
  lg: "text-4xl",
  hero: "text-6xl md:text-7xl",
} as const;

/** Flowlytics mark: three nodes on a calm data path. */
export function FlowlyticsMark({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect width="40" height="40" rx="12" fill="#0D9488" />
      <path
        d="M8 22C12 14 16 12 20 18C24 24 28 22 32 14"
        stroke="#CCFBF1"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.95"
      />
      <circle cx="9.5" cy="20.5" r="3.2" fill="#F0FDFA" />
      <circle cx="20" cy="18.5" r="3.2" fill="#F0FDFA" />
      <circle cx="30.5" cy="15.5" r="3.2" fill="#F0FDFA" />
      {/* tiny spark on the last node — “insight” */}
      <path
        d="M30.5 9.5V11.2M30.5 19.8V21.5M25.8 15.5H27.5M33.5 15.5H35.2"
        stroke="#99F6E4"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandLogo({
  href = "/",
  size = "md",
  wordmark = true,
  className = "",
}: Props) {
  const content = (
    <span className={`brand-logo ${className}`}>
      <FlowlyticsMark size={MARK[size]} />
      {wordmark && (
        <span className={`brand brand-logo__word ${WORD[size]} text-accent`}>Flowlytics</span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="brand-logo-link" aria-label="Flowlytics home">
      {content}
    </Link>
  );
}
