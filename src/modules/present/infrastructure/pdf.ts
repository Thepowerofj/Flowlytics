import PDFDocument from "pdfkit";
import type { PresentationModel, PresentationSlide } from "../domain/presentationModel";

const INK = "#0F1F1C";
const MUTED = "#5A6E67";
const ACCENT = "#0D9488";
const ACCENT_DEEP = "#0F766E";
const ACCENT_SOFT = "#CCFBF1";
const BORDER = "#E2EAE6";
const WHITE = "#FFFFFF";
const FORECAST = "#C2410C";

export async function renderPdf(model: PresentationModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 0,
      size: "A4",
      info: { Title: model.title, Author: "Flowlytics" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (const [i, slide] of model.slides.entries()) {
      if (i > 0) doc.addPage();
      drawSlide(doc, slide, model, i);
    }

    doc.end();
  });
}

function drawSlide(
  doc: InstanceType<typeof PDFDocument>,
  slide: PresentationSlide,
  model: PresentationModel,
  index: number,
) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 48;

  // Soft page wash
  doc.rect(0, 0, pageW, pageH).fill("#F4F7F6");

  if (slide.kind === "title") {
    doc.rect(0, 0, pageW, pageH * 0.42).fill(ACCENT_DEEP);
    doc
      .fontSize(11)
      .fillColor(ACCENT_SOFT)
      .text(slide.eyebrow || "Flowlytics", margin, pageH * 0.18, {
        width: pageW - margin * 2,
      });
    doc
      .fontSize(32)
      .fillColor(WHITE)
      .text(slide.title, margin, pageH * 0.22, {
        width: pageW - margin * 2,
      });
    if (slide.subtitle) {
      doc
        .moveDown(0.6)
        .fontSize(14)
        .fillColor(ACCENT_SOFT)
        .text(slide.subtitle, { width: pageW - margin * 2 });
    }
    doc
      .fontSize(10)
      .fillColor(MUTED)
      .text(`Generated ${model.generatedAt}`, margin, pageH - 56);
    return;
  }

  // Accent rail
  doc.rect(0, 0, 8, pageH).fill(ACCENT);
  doc
    .fontSize(9)
    .fillColor(MUTED)
    .text("Flowlytics", margin, 28, { continued: true })
    .fillColor(BORDER)
    .text(`  ·  ${index + 1}/${model.slides.length}`);

  if (slide.kind === "closing") {
    doc
      .fontSize(26)
      .fillColor(INK)
      .text(slide.title, margin, pageH * 0.35, { width: pageW - margin * 2 });
    doc
      .moveDown(0.8)
      .fontSize(13)
      .fillColor(MUTED)
      .text(slide.body, { width: pageW - margin * 2 });
    return;
  }

  doc
    .fontSize(22)
    .fillColor(INK)
    .text(slide.title, margin, 56, { width: pageW - margin * 2 });
  doc
    .moveTo(margin, 92)
    .lineTo(margin + 64, 92)
    .lineWidth(3)
    .strokeColor(ACCENT)
    .stroke();

  let y = 112;

  if (slide.kind === "bullets") {
    const action = slide.tone === "actions";
    for (const b of slide.bullets) {
      const boxH = Math.max(36, doc.heightOfString(b, { width: pageW - margin * 2 - 36 }) + 18);
      if (y + boxH > pageH - 48) break;
      doc
        .roundedRect(margin, y, pageW - margin * 2, boxH, 10)
        .fill(action ? "#FFEDD5" : WHITE);
      doc
        .circle(margin + 16, y + boxH / 2, 4)
        .fill(action ? FORECAST : ACCENT);
      doc
        .fontSize(12)
        .fillColor(INK)
        .text(b, margin + 32, y + 10, {
          width: pageW - margin * 2 - 48,
        });
      y += boxH + 10;
    }
    return;
  }

  if (slide.kind === "kpi") {
    const colW = (pageW - margin * 2 - 16) / 2;
    slide.items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + col * (colW + 16);
      const cardY = y + row * 100;
      doc.roundedRect(x, cardY, colW, 88, 14).fill(WHITE);
      doc.roundedRect(x, cardY, 6, 88, 3).fill(i % 3 === 1 ? FORECAST : ACCENT);
      doc
        .fontSize(10)
        .fillColor(MUTED)
        .text(item.label, x + 18, cardY + 16, { width: colW - 28 });
      doc
        .fontSize(22)
        .fillColor(INK)
        .text(item.value, x + 18, cardY + 36, { width: colW - 28 });
      if (item.hint) {
        doc
          .fontSize(9)
          .fillColor(ACCENT_DEEP)
          .text(item.hint, x + 18, cardY + 66, { width: colW - 28 });
      }
    });
    return;
  }

  if (slide.kind === "chart") {
    if (slide.caption) {
      doc.fontSize(10).fillColor(MUTED).text(slide.caption, margin, y);
      y += 20;
    }
    drawLineChart(doc, slide.points, margin, y, pageW - margin * 2, 220);
    return;
  }

  if (slide.kind === "table") {
    if (slide.caption) {
      doc.fontSize(10).fillColor(MUTED).text(slide.caption, margin, y);
      y += 22;
    }
    const cols = slide.columns;
    const colW = (pageW - margin * 2) / Math.max(1, cols.length);
    const rowH = 22;
    // header
    doc.roundedRect(margin, y, pageW - margin * 2, rowH + 6, 8).fill(ACCENT_SOFT);
    cols.forEach((c, ci) => {
      doc
        .fontSize(9)
        .fillColor(ACCENT_DEEP)
        .text(c, margin + ci * colW + 8, y + 8, {
          width: colW - 12,
          ellipsis: true,
        });
    });
    y += rowH + 10;
    for (const row of slide.rows) {
      if (y > pageH - 48) break;
      cols.forEach((_, ci) => {
        doc
          .fontSize(9)
          .fillColor(INK)
          .text(String(row[ci] ?? ""), margin + ci * colW + 8, y, {
            width: colW - 12,
            ellipsis: true,
          });
      });
      y += rowH;
      doc
        .moveTo(margin, y - 4)
        .lineTo(pageW - margin, y - 4)
        .lineWidth(0.5)
        .strokeColor(BORDER)
        .stroke();
    }
  }
}

function drawLineChart(
  doc: InstanceType<typeof PDFDocument>,
  points: { x: string; y: number; series?: string }[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const usable = points.filter((p) => Number.isFinite(p.y));
  if (usable.length < 2) {
    doc.fontSize(11).fillColor(MUTED).text("Not enough points to chart.", x, y);
    return;
  }

  doc.roundedRect(x, y, width, height, 12).fill(WHITE);

  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 36;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const ys = usable.map((p) => p.y);
  let minY = Math.min(...ys, 0);
  let maxY = Math.max(...ys);
  if (minY === maxY) maxY = minY + 1;
  const span = maxY - minY;

  // Grid
  for (let i = 0; i <= 4; i++) {
    const gy = plotY + (plotH * i) / 4;
    doc
      .moveTo(plotX, gy)
      .lineTo(plotX + plotW, gy)
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();
    const val = maxY - (span * i) / 4;
    doc
      .fontSize(8)
      .fillColor(MUTED)
      .text(formatAxis(val), x + 6, gy - 4, { width: padL - 10, align: "right" });
  }

  const actual = usable.filter((p) => !/forecast/i.test(p.series ?? "Actual"));
  const forecast = usable.filter((p) => /forecast/i.test(p.series ?? ""));
  const drawSeries = (
    seriesPts: typeof usable,
    color: string,
    dashed = false,
  ) => {
    if (seriesPts.length < 2) return;
    doc.save();
    if (dashed) doc.dash(4, { space: 3 });
    doc.lineWidth(2.2).strokeColor(color);
    seriesPts.forEach((p, i) => {
      const idx = usable.indexOf(p);
      const px = plotX + (plotW * Math.max(0, idx)) / Math.max(1, usable.length - 1);
      const py = plotY + plotH * (1 - (p.y - minY) / span);
      if (i === 0) doc.moveTo(px, py);
      else doc.lineTo(px, py);
    });
    doc.stroke();
    doc.undash();
    doc.restore();
    for (const p of seriesPts) {
      const idx = usable.indexOf(p);
      const px = plotX + (plotW * Math.max(0, idx)) / Math.max(1, usable.length - 1);
      const py = plotY + plotH * (1 - (p.y - minY) / span);
      doc.circle(px, py, 2.5).fill(color);
    }
  };

  drawSeries(actual.length ? actual : usable, ACCENT, false);
  if (forecast.length) drawSeries(forecast, FORECAST, true);

  // X labels (first / mid / last)
  const labelIdx = [
    0,
    Math.floor((usable.length - 1) / 2),
    usable.length - 1,
  ];
  for (const idx of [...new Set(labelIdx)]) {
    const p = usable[idx];
    if (!p) continue;
    const px = plotX + (plotW * idx) / Math.max(1, usable.length - 1);
    doc
      .fontSize(7)
      .fillColor(MUTED)
      .text(String(p.x).slice(0, 12), px - 28, y + height - 22, {
        width: 56,
        align: "center",
      });
  }

  // Legend
  doc.circle(x + 18, y + height - 12, 3).fill(ACCENT);
  doc.fontSize(8).fillColor(INK).text("Actual", x + 26, y + height - 16);
  doc.circle(x + 80, y + height - 12, 3).fill(FORECAST);
  doc.fontSize(8).fillColor(INK).text("Forecast", x + 88, y + height - 16);
}

function formatAxis(n: number): string {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}
