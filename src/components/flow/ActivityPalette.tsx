"use client";

import {
  FLOW_DIRECTION,
  QUICK_RECIPES,
  iconForBlock,
  type QuickRecipe,
} from "./activityMeta";
import type { BlockSummary } from "./types";

const SECTIONS: { id: string; title: string; categories: string[]; hint: string }[] = [
  { id: "ingest", title: "Ingest", categories: ["ingest"], hint: "Bring data in" },
  { id: "transform", title: "Transform", categories: ["transform"], hint: "Clean & map" },
  { id: "analyse", title: "Analyse", categories: ["analyse"], hint: "Stats & charts" },
  { id: "ai", title: "AI", categories: ["ai"], hint: "Optional, your API key" },
  { id: "output", title: "Output", categories: ["output"], hint: "Shape export" },
];

type Props = {
  blocks: BlockSummary[];
  onAdd: (type: string) => void;
  onQuickRecipe: (recipe: QuickRecipe) => void;
};

export function ActivityPalette({ blocks, onAdd, onQuickRecipe }: Props) {
  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur-md">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Activities</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Click to add (auto-wires when possible) or drag onto the canvas
        </p>
      </div>

      <div className="flow-direction mx-3 mb-2 rounded-xl border border-border bg-bg/70 px-2.5 py-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          Data flows
        </p>
        <div className="flex items-center justify-between gap-0.5">
          {FLOW_DIRECTION.map((step, i) => (
            <div key={step.id} className="flex min-w-0 flex-1 items-center">
              <div className="flow-direction__step" title={step.title} data-step={step.id}>
                {step.label}
              </div>
              {i < FLOW_DIRECTION.length - 1 && (
                <span className="flow-direction__arrow" aria-hidden>
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-3 mb-2 flex max-h-[32%] min-h-0 shrink-0 flex-col">
        <p className="mb-1.5 shrink-0 px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          Quick add
        </p>
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto pe-0.5">
          {QUICK_RECIPES.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className="palette-recipe"
              style={{ ["--recipe-accent" as string]: recipe.accent }}
              onClick={() => onQuickRecipe(recipe)}
              title={recipe.hint}
            >
              <span className="palette-recipe__icons" aria-hidden>
                {recipe.steps.slice(0, 3).map((t) => (
                  <span key={t} className="palette-recipe__icon">
                    {iconForBlock(t)}
                  </span>
                ))}
                {recipe.steps.length > 3 && (
                  <span className="palette-recipe__more">+{recipe.steps.length - 3}</span>
                )}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[12px] font-semibold tracking-tight text-ink">
                  {recipe.label}
                </span>
                <span className="block truncate text-[10px] text-muted">{recipe.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {SECTIONS.map((section) => {
          const items = blocks.filter((b) => section.categories.includes(b.category));
          if (!items.length) return null;
          return (
            <section key={section.id} className="px-1">
              <div className="mb-1.5 flex items-baseline justify-between px-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {section.title}
                </h3>
                <span className="text-[10px] text-muted/80">{section.hint}</span>
              </div>
              <div className="space-y-0.5">
                {items.map((b) => (
                  <button
                    key={b.type}
                    type="button"
                    className="palette-item"
                    onClick={() => onAdd(b.type)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/flowlytics-block", b.type);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <span className="palette-item__row">
                      <span
                        className="palette-item__icon"
                        data-category={b.category}
                        aria-hidden
                      >
                        {iconForBlock(b.type)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold tracking-tight">
                          {b.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                          {b.description}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
