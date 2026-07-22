/** Lightweight styled text for Ask messages — bold, italics, code, lists, callouts. */

function renderInline(text: string, keyPrefix: string, tone: "default" | "inverse") {
  // Split bold, italic, inline code
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong
          key={key}
          className={
            tone === "inverse"
              ? "font-semibold text-white"
              : "font-semibold text-accent-deep"
          }
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return (
        <em key={key} className={tone === "inverse" ? "text-white/90" : "text-muted"}>
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className={
            tone === "inverse"
              ? "rounded bg-white/15 px-1 py-0.5 text-[0.85em]"
              : "rounded bg-accent-soft px-1 py-0.5 text-[0.85em] text-accent-deep"
          }
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

export function AskRichText({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "inverse";
}) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  const muted = tone === "inverse" ? "text-white/75" : "text-muted";
  const body = tone === "inverse" ? "text-white" : "text-ink";

  return (
    <div className={`ask-rich space-y-2.5 text-sm leading-relaxed ${body}`}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const listLines = lines.filter((l) => /^[•\-\*]\s+/.test(l.trim()));
        if (listLines.length === lines.length && lines.length > 0) {
          return (
            <ul key={bi} className="ask-rich__list space-y-1.5 pl-0">
              {lines.map((line, li) => (
                <li key={li} className="ask-rich__li flex gap-2">
                  <span
                    className={
                      tone === "inverse" ? "text-white/50" : "text-accent"
                    }
                    aria-hidden
                  >
                    •
                  </span>
                  <span className="min-w-0 flex-1">
                    {renderInline(
                      line.trim().replace(/^[•\-\*]\s+/, ""),
                      `${bi}-${li}`,
                      tone,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        // Numbered section headings like "1. Question"
        const heading = block.match(/^\*\*\d+\.\s+(.+)\*\*$/);
        if (heading) {
          return (
            <p
              key={bi}
              className={
                tone === "inverse"
                  ? "text-base font-semibold text-white"
                  : "text-base font-semibold text-accent-deep"
              }
            >
              {heading[1]}
            </p>
          );
        }

        return (
          <p key={bi} className={`whitespace-pre-wrap ${body}`}>
            {lines.map((line, li) => (
              <span key={li} className={li === 0 ? undefined : muted}>
                {li > 0 ? <br /> : null}
                {renderInline(line, `${bi}-${li}`, tone)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
