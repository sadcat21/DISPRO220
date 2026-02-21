import React, { createContext, useContext, useState, useEffect } from 'react';

export type FontSize = 'small' | 'medium' | 'large';

interface FontSizeContextType {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  gridCols: number; // number of columns for admin home grid
}

const FontSizeContext = createContext<FontSizeContextType | null>(null);

export const useFontSize = () => {
  const context = useContext(FontSizeContext);
  if (!context) {
    throw new Error('useFontSize must be used within a FontSizeProvider');
  }
  return context;
};

const FONT_SIZE_KEY = 'laser_food_font_size';

const fontSizeMap: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
};

const gridColsMap: Record<FontSize, number> = {
  small: 4,
  medium: 3,
  large: 3,
};

export const FontSizeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fontSize, setFontSizeState] = useState<FontSize>('medium');

  useEffect(() => {
    const stored = localStorage.getItem(FONT_SIZE_KEY) as FontSize | null;
    if (stored && ['small', 'medium', 'large'].includes(stored)) {
      setFontSizeState(stored);
      applyFontSize(stored);
    } else {
      applyFontSize('medium');
    }
  }, []);

  const applyFontSize = (size: FontSize) => {
    document.documentElement.style.fontSize = fontSizeMap[size];
  };

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem(FONT_SIZE_KEY, size);
    applyFontSize(size);
  };

  const gridCols = gridColsMap[fontSize];

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize, gridCols }}>
      {children}
    </FontSizeContext.Provider>
  );
};
