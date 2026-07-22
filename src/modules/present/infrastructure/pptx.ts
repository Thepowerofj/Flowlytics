import PptxGenJS from "pptxgenjs";
import type { PresentationModel } from "../domain/presentationModel";

const INK = "0F1F1C";
const MUTED = "5A6E67";
const ACCENT = "0D9488";
const ACCENT_DEEP = "0F766E";
const ACCENT_SOFT = "CCFBF1";
const FORECAST = "C2410C";
const FORECAST_SOFT = "FFEDD5";
const WHITE = "FFFFFF";
const BG = "F4F7F6";

export async function renderPptx(model: PresentationModel): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "Flowlytics";
  pptx.title = model.title;
  pptx.subject = "Insight pack";

  for (const [index, slide] of model.slides.entries()) {
    const s = pptx.addSlide();
    s.background = { color: BG };

    if (slide.kind === "title") {
      s.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 10,
        h: 3.4,
        fill: { color: ACCENT_DEEP },
        line: { color: ACCENT_DEEP },
      });
      s.addText(slide.eyebrow || "Flowlytics", {
        x: 0.6,
        y: 1.0,
        w: 8.8,
        h: 0.35,
        fontSize: 12,
        color: ACCENT_SOFT,
        bold: true,
      });
      s.addText(slide.title, {
        x: 0.6,
        y: 1.4,
        w: 8.8,
        h: 1.1,
        fontSize: 34,
        bold: true,
        color: WHITE,
      });
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.6,
          y: 2.55,
          w: 8.8,
          h: 0.4,
          fontSize: 15,
          color: ACCENT_SOFT,
        });
      }
      s.addText(`Generated ${model.generatedAt}`, {
        x: 0.6,
        y: 5.1,
        w: 8.8,
        h: 0.3,
        fontSize: 11,
        color: MUTED,
      });
      continue;
    }

    // Accent rail
    s.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.12,
      h: 5.625,
      fill: { color: ACCENT },
      line: { color: ACCENT },
    });
    s.addText(`Flowlytics  ·  ${index + 1}/${model.slides.length}`, {
      x: 0.45,
      y: 0.2,
      w: 9,
      h: 0.3,
      fontSize: 10,
      color: MUTED,
    });

    if (slide.kind === "closing") {
      s.addText(slide.title, {
        x: 0.6,
        y: 2.0,
        w: 8.8,
        h: 0.8,
        fontSize: 28,
        bold: true,
        color: INK,
      });
      s.addText(slide.body, {
        x: 0.6,
        y: 2.9,
        w: 8.8,
        h: 1.2,
        fontSize: 15,
        color: MUTED,
      });
      continue;
    }

    s.addText(slide.title, {
      x: 0.45,
      y: 0.55,
      w: 9,
      h: 0.55,
      fontSize: 24,
      bold: true,
      color: INK,
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 0.45,
      y: 1.15,
      w: 0.7,
      h: 0.06,
      fill: { color: ACCENT },
      line: { color: ACCENT },
    });

    if (slide.kind === "bullets") {
      const action = slide.tone === "actions";
      slide.bullets.slice(0, 6).forEach((b, i) => {
        const y = 1.45 + i * 0.62;
        s.addShape(pptx.ShapeType.roundRect, {
          x: 0.45,
          y,
          w: 9.1,
          h: 0.54,
          fill: { color: action ? FORECAST_SOFT : WHITE },
          line: { color: action ? FORECAST_SOFT : "E2EAE6" },
          rectRadius: 0.1,
        });
        s.addShape(pptx.ShapeType.ellipse, {
          x: 0.62,
          y: y + 0.18,
          w: 0.16,
          h: 0.16,
          fill: { color: action ? FORECAST : ACCENT },
          line: { color: action ? FORECAST : ACCENT },
        });
        s.addText(b, {
          x: 0.95,
          y: y + 0.1,
          w: 8.4,
          h: 0.35,
          fontSize: 13,
          color: INK,
        });
      });
    } else if (slide.kind === "kpi") {
      slide.items.slice(0, 6).forEach((item, i) => {
        const x = 0.45 + (i % 3) * 3.1;
        const y = 1.5 + Math.floor(i / 3) * 1.7;
        s.addShape(pptx.ShapeType.roundRect, {
          x,
          y,
          w: 2.9,
          h: 1.45,
          fill: { color: WHITE },
          line: { color: "E2EAE6" },
          rectRadius: 0.12,
        });
        s.addShape(pptx.ShapeType.rect, {
          x,
          y,
          w: 0.1,
          h: 1.45,
          fill: { color: i % 3 === 1 ? FORECAST : ACCENT },
          line: { color: i % 3 === 1 ? FORECAST : ACCENT },
        });
        s.addText(item.label, {
          x: x + 0.25,
          y: y + 0.2,
          w: 2.45,
          h: 0.3,
          fontSize: 11,
          color: MUTED,
        });
        s.addText(item.value, {
          x: x + 0.25,
          y: y + 0.55,
          w: 2.45,
          h: 0.45,
          fontSize: 24,
          bold: true,
          color: INK,
        });
        if (item.hint) {
          s.addText(item.hint, {
            x: x + 0.25,
            y: y + 1.05,
            w: 2.45,
            h: 0.25,
            fontSize: 10,
            color: ACCENT_DEEP,
          });
        }
      });
    } else if (slide.kind === "table") {
      if (slide.caption) {
        s.addText(slide.caption, {
          x: 0.45,
          y: 1.35,
          w: 9.1,
          h: 0.3,
          fontSize: 11,
          color: MUTED,
        });
      }
      const tableRows = [
        slide.columns.map((c) => ({
          text: c,
          options: {
            bold: true,
            color: ACCENT_DEEP,
            fill: { color: ACCENT_SOFT },
          },
        })),
        ...slide.rows.map((r) =>
          r.map((cell) => ({
            text: cell,
            options: { color: INK, fill: { color: WHITE } },
          })),
        ),
      ];
      s.addTable(tableRows, {
        x: 0.45,
        y: slide.caption ? 1.7 : 1.45,
        w: 9.1,
        colW: slide.columns.map(() => 9.1 / Math.max(1, slide.columns.length)),
        border: { type: "solid", pt: 0.5, color: "E2EAE6" },
        fontSize: 11,
        color: INK,
      });
    }
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.from(out);
}
