import { createImage, getPixel, setPixel, type RawImage } from "./image.js";

/**
 * Cut a spritesheet into individual cells.
 *
 * Most free asset packs ship one packed PNG rather than loose files, so this
 * is the front door for CC0 ingestion. Pure and deterministic; the cells it
 * returns are raw and still have to pass the gate like anything else.
 */
export interface SliceOptions {
  cellWidth: number;
  cellHeight: number;
  /** Gap between cells, in pixels (packed sheets usually 0, spaced ones 1). */
  spacing?: number;
  /** Border before the first cell. */
  margin?: number;
}

export interface SlicedCell {
  /** Column and row in the sheet, 0-based. */
  col: number;
  row: number;
  /** Reading-order index: row * columns + col. */
  index: number;
  image: RawImage;
}

export function sliceSheet(sheet: RawImage, options: SliceOptions): SlicedCell[] {
  const { cellWidth, cellHeight } = options;
  const spacing = options.spacing ?? 0;
  const margin = options.margin ?? 0;
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new RangeError(`invalid cell size ${cellWidth}x${cellHeight}`);
  }

  const stepX = cellWidth + spacing;
  const stepY = cellHeight + spacing;
  const columns = Math.floor((sheet.width - margin + spacing) / stepX);
  const rows = Math.floor((sheet.height - margin + spacing) / stepY);
  if (columns <= 0 || rows <= 0) {
    throw new RangeError(
      `no ${cellWidth}x${cellHeight} cells fit in a ${sheet.width}x${sheet.height} sheet`,
    );
  }

  const cells: SlicedCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const originX = margin + col * stepX;
      const originY = margin + row * stepY;
      const image = createImage(cellWidth, cellHeight);
      for (let y = 0; y < cellHeight; y++) {
        for (let x = 0; x < cellWidth; x++) {
          setPixel(image, x, y, getPixel(sheet, originX + x, originY + y));
        }
      }
      cells.push({ col, row, index: row * columns + col, image });
    }
  }
  return cells;
}

/** True when every pixel is fully transparent — a blank cell in the sheet's grid. */
export function isBlank(img: RawImage): boolean {
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] !== 0) return false;
  }
  return true;
}
