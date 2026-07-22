import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function iconForBlock(type: string, className?: string) {
  const p: IconProps = { className };
  switch (type) {
    case "ingest.csv_excel":
      return (
        <Svg {...p}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M8 13h8M8 17h5" />
        </Svg>
      );
    case "ingest.url":
      return (
        <Svg {...p}>
          <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5" />
          <path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.4a5 5 0 0 0 7.07 7.07L14 18" />
        </Svg>
      );
    case "output.email":
      return (
        <Svg {...p}>
          <path d="M4 6h16v12H4z" />
          <path d="M4 7l8 6 8-6" />
        </Svg>
      );
    case "output.presentation":
      return (
        <Svg {...p}>
          <path d="M4 5h16v10H4z" />
          <path d="M12 15v4M8 19h8" />
        </Svg>
      );
    case "transform.clean_map":
      return (
        <Svg {...p}>
          <path d="M4 7h10M4 12h16M4 17h8" />
          <path d="M18 5v4M16 7h4" />
        </Svg>
      );
    case "transform.aggregate":
      return (
        <Svg {...p}>
          <path d="M4 6h16M4 12h10M4 18h14" />
          <path d="M18 10v8M15 15h6" />
        </Svg>
      );
    case "analyse.stats":
      return (
        <Svg {...p}>
          <path d="M4 19V5M4 19h16" />
          <path d="M8 16v-5M12 16V8M16 16v-3" />
        </Svg>
      );
    case "analyse.chart":
      return (
        <Svg {...p}>
          <path d="M4 19V5M4 19h16" />
          <path d="M8 15l3-4 3 2 4-6" />
        </Svg>
      );
    case "analyse.projection":
      return (
        <Svg {...p}>
          <path d="M4 19V5M4 19h16" />
          <path d="M7 14l4-3 3 2 5-6" />
          <path d="M16 7h3v3" />
        </Svg>
      );
    case "output.structure":
      return (
        <Svg {...p}>
          <path d="M12 3v12" />
          <path d="M8 11l4 4 4-4" />
          <path d="M5 19h14" />
        </Svg>
      );
    case "ai.structure":
      return (
        <Svg {...p}>
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="M8 10h8M8 14h5" />
          <path d="M12 3v3M12 18v3" />
        </Svg>
      );
    case "ai.explain":
      return (
        <Svg {...p}>
          <path d="M5 18l2-5 4-8 4 8 2 5" />
          <path d="M8 13h8" />
        </Svg>
      );
    case "ai.analyse":
      return (
        <Svg {...p}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 9v3l2 1" />
        </Svg>
      );
    case "ai.chart":
      return (
        <Svg {...p}>
          <path d="M5 19V9l4 3 4-6 4 4v9" />
          <path d="M5 19h14" />
        </Svg>
      );
    default:
      return (
        <Svg {...p}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M8 12h8" />
        </Svg>
      );
  }
}

export const FLOW_DIRECTION = [
  { id: "ingest", label: "In", title: "Ingest" },
  { id: "transform", label: "Clean", title: "Transform" },
  { id: "analyse", label: "Analyse", title: "Analyse" },
  { id: "ai", label: "AI", title: "AI" },
  { id: "output", label: "Out", title: "Output" },
] as const;

export type QuickRecipe = {
  id: string;
  label: string;
  hint: string;
  steps: string[];
  /** Accent for the recipe chip */
  accent: string;
};

/** One-click starter chains with data flowing left → right */
export const QUICK_RECIPES: QuickRecipe[] = [
  {
    id: "to-chart",
    label: "→ Chart",
    hint: "Ingest · clean · chart",
    steps: ["ingest.csv_excel", "transform.clean_map", "analyse.chart"],
    accent: "#0F766E",
  },
  {
    id: "to-agg-chart",
    label: "→ Aggregate chart",
    hint: "Ingest · clean · aggregate · chart",
    steps: [
      "ingest.csv_excel",
      "transform.clean_map",
      "transform.aggregate",
      "analyse.chart",
    ],
    accent: "#0D9488",
  },
  {
    id: "to-stats",
    label: "→ Stats",
    hint: "Ingest · clean · stats",
    steps: ["ingest.csv_excel", "transform.clean_map", "analyse.stats"],
    accent: "#0D9488",
  },
  {
    id: "to-forecast",
    label: "→ Forecast",
    hint: "Ingest · clean · forecast",
    steps: ["ingest.csv_excel", "transform.clean_map", "analyse.projection"],
    accent: "#A16207",
  },
  {
    id: "to-agg-forecast",
    label: "→ Aggregate forecast",
    hint: "Ingest · clean · aggregate · forecast",
    steps: [
      "ingest.csv_excel",
      "transform.clean_map",
      "transform.aggregate",
      "analyse.projection",
    ],
    accent: "#A16207",
  },
  {
    id: "full-path",
    label: "Full path",
    hint: "Ingest → export",
    steps: [
      "ingest.csv_excel",
      "transform.clean_map",
      "analyse.stats",
      "analyse.chart",
      "output.structure",
    ],
    accent: "#3D5A52",
  },
  {
    id: "ai-structure",
    label: "→ AI structure",
    hint: "Notes → AI table → clean → chart",
    steps: [
      "ai.structure",
      "transform.clean_map",
      "analyse.chart",
    ],
    accent: "#0F766E",
  },
  {
    id: "ai-insights",
    label: "→ AI insights",
    hint: "Ingest · clean · AI analyse · chart",
    steps: [
      "ingest.csv_excel",
      "transform.clean_map",
      "ai.analyse",
      "analyse.chart",
    ],
    accent: "#0D9488",
  },
  {
    id: "auto-analyse",
    label: "✦ Auto analysis",
    hint: "Full path · stats · chart · AI · export (seed after upload)",
    steps: [
      "ingest.csv_excel",
      "transform.clean_map",
      "analyse.stats",
      "analyse.chart",
      "ai.analyse",
      "output.structure",
    ],
    accent: "#A16207",
  },
];
