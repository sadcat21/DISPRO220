import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { parseBP, boxesToBP } from '@/utils/boxPieceInput';

interface BoxPieceInputProps {
  /** Current value in boxes (fractional, e.g. 5.25 = 5 boxes + 5/20 pieces) */
  value: number;
  /** Called with new box value (fractional) */
  onChange: (boxValue: number) => void;
  /** Pieces per box for this product */
  piecesPerBox: number;
  /** Additional className */
  className?: string;
  /** Min value (default 0) */
  min?: number;
  /** Max value */
  max?: number;
  /** Placeholder */
  placeholder?: string;
  /** Show hint below input */
  showHint?: boolean;
  /** Disable input */
  disabled?: boolean;
  /** onFocus handler */
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * Reusable Box.Piece input component.
 * Accepts input like "5.03" meaning 5 boxes + 3 pieces.
 * Auto-normalizes on blur (e.g., 0.25 with ppb=20 → 1.05).
 */
const BoxPieceInput: React.FC<BoxPieceInputProps> = ({
  value,
  onChange,
  piecesPerBox,
  className = '',
  min = 0,
  max,
  placeholder = '0.00',
  showHint = true,
  disabled = false,
  onFocus,
}) => {
  const ppb = Math.max(1, Math.round(piecesPerBox));
  const [rawInput, setRawInput] = useState(() => boxesToBP(value, ppb));

  // Sync when external value changes
  useEffect(() => {
    setRawInput(boxesToBP(value, ppb));
  }, [value, ppb]);

  const parsed = useMemo(() => parseBP(rawInput, ppb), [rawInput, ppb]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
    setRawInput(cleaned);
    // Emit parsed value immediately for reactive updates
    const p = parseBP(cleaned, ppb);
    const newVal = p.totalBoxes;
    if (max !== undefined && newVal > max) return;
    onChange(newVal);
  };

  const handleBlur = () => {
    // Normalize display on blur
    const normalized = parsed.display || '0';
    setRawInput(normalized);
    const newVal = Math.max(min, parsed.totalBoxes);
    if (max !== undefined) {
      onChange(Math.min(max, newVal));
    } else {
      onChange(newVal);
    }
  };

  return (
    <div className="inline-flex flex-col items-center">
      <Input
        type="text"
        inputMode="decimal"
        value={rawInput}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={onFocus}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
      />
      {showHint && parsed.pieces > 0 && (
        <span className="text-[9px] text-muted-foreground mt-0.5 leading-none">
          {parsed.boxes}ص + {parsed.pieces}ق
        </span>
      )}
    </div>
  );
};

export default BoxPieceInput;
