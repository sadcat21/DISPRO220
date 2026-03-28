/**
 * Box.Piece (B.P) quantity input system.
 *
 * Format: BOXES.PIECES  (e.g. 1091.05 = 1091 boxes + 5 pieces)
 *
 * Auto-normalization: when pieces >= pieces_per_box, they roll over into boxes.
 * Example with pieces_per_box = 20:
 *   0.20 → 1.00 (1 box)
 *   0.25 → 1.05 (1 box + 5 pieces)
 *   3.45 → 5.05 (3 + 2 extra boxes from 45 pieces, 5 remaining pieces)
 */

export interface ParsedBP {
  /** Number of full boxes */
  boxes: number;
  /** Remaining pieces (always < piecesPerBox after normalization) */
  pieces: number;
  /** Total quantity in boxes (fractional) for calculations: boxes + pieces/piecesPerBox */
  totalBoxes: number;
  /** Total quantity in pieces for calculations: boxes * piecesPerBox + pieces */
  totalPieces: number;
  /** Formatted display string: "boxes.pieces" */
  display: string;
}

/**
 * Parse raw decimal digits from a B.P string.
 * The decimal part represents pieces count, NOT a fraction.
 * e.g. "8.03" → boxes=8, rawPieces=3
 *      "8.3"  → boxes=8, rawPieces=3 (single digit = 3 pieces, not 30)
 */
const extractRawParts = (value: string): { boxes: number; rawPieces: number } => {
  const cleaned = String(value).trim();
  if (!cleaned || cleaned === '.' || cleaned === '-') return { boxes: 0, rawPieces: 0 };

  const dotIndex = cleaned.indexOf('.');
  if (dotIndex === -1) {
    return { boxes: Math.max(0, parseInt(cleaned, 10) || 0), rawPieces: 0 };
  }

  const boxPart = cleaned.substring(0, dotIndex);
  const piecePart = cleaned.substring(dotIndex + 1);

  const boxes = Math.max(0, parseInt(boxPart || '0', 10) || 0);
  const rawPieces = piecePart.length > 0 ? Math.max(0, parseInt(piecePart, 10) || 0) : 0;

  return { boxes, rawPieces };
};

/**
 * Parse a B.P string and normalize pieces into boxes.
 *
 * @param value   - The raw input string (e.g. "1091.05", "0.25")
 * @param piecesPerBox - How many pieces make one box (e.g. 20)
 * @returns Normalized ParsedBP result
 */
export const parseBP = (value: string, piecesPerBox: number): ParsedBP => {
  const ppb = Math.max(1, Math.round(piecesPerBox));
  const { boxes, rawPieces } = extractRawParts(value);

  // Normalize: convert excess pieces into boxes
  const extraBoxes = Math.floor(rawPieces / ppb);
  const remainingPieces = rawPieces % ppb;
  const totalBoxes = boxes + extraBoxes;

  const totalInBoxes = totalBoxes + remainingPieces / ppb;
  const totalInPieces = totalBoxes * ppb + remainingPieces;

  // Format display: always show pieces as-is (no padding)
  const display = remainingPieces > 0
    ? `${totalBoxes}.${String(remainingPieces).padStart(2, '0')}`
    : `${totalBoxes}`;

  return {
    boxes: totalBoxes,
    pieces: remainingPieces,
    totalBoxes: totalInBoxes,
    totalPieces: totalInPieces,
    display,
  };
};

/**
 * Convert a B.P input to total boxes (as a number for DB storage).
 * This is the primary function for converting user input to storable quantity.
 */
export const bpToBoxes = (value: string, piecesPerBox: number): number => {
  return parseBP(value, piecesPerBox).totalBoxes;
};

/**
 * Convert a box quantity number (possibly fractional) back to B.P display format.
 * e.g. 1091.25 with ppb=20 → "1091.05" (0.25 * 20 = 5 pieces)
 */
export const boxesToBP = (quantity: number, piecesPerBox: number): string => {
  const ppb = Math.max(1, Math.round(piecesPerBox));
  const totalPieces = Math.round(quantity * ppb);
  const boxes = Math.floor(totalPieces / ppb);
  const pieces = totalPieces % ppb;

  if (pieces === 0) return String(boxes);
  return `${boxes}.${String(pieces).padStart(2, '0')}`;
};

/**
 * Format a quantity for display with box/piece breakdown.
 * Returns something like "1091 صندوق و 5 قطع"
 */
export const formatBPDisplay = (
  value: string,
  piecesPerBox: number,
  boxLabel = 'صندوق',
  pieceLabel = 'قطعة',
): string => {
  const { boxes, pieces } = parseBP(value, piecesPerBox);
  if (pieces === 0) return `${boxes} ${boxLabel}`;
  if (boxes === 0) return `${pieces} ${pieceLabel}`;
  return `${boxes} ${boxLabel} و ${pieces} ${pieceLabel}`;
};

/**
 * Check if a string looks like B.P input (has a dot with piece digits).
 */
export const hasPiecePart = (value: string): boolean => {
  const dotIndex = value.indexOf('.');
  return dotIndex >= 0 && value.substring(dotIndex + 1).length > 0;
};
