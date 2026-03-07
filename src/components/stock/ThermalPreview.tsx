import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface ThermalPreviewProps {
  lines: ThermalLine[];
  showLegendToggle?: boolean;
}

export interface ThermalLine {
  text?: string;
  bold?: boolean;
  center?: boolean;
  large?: boolean;
  separator?: boolean;
  dotSeparator?: boolean;
}

const LEGEND_ITEMS = [
  { abbr: 'Prec', full: 'Précédent (السابق)' },
  { abbr: 'Charg', full: 'Chargement (المشحون)' },
  { abbr: 'Tot', full: 'Total (الكلي)' },
  { abbr: 'Cmd', full: 'Commandes (الطلبات)' },
  { abbr: 'Surp', full: 'Surplus (الفائض)' },
  { abbr: 'SC', full: 'Sans Comptabilité (بدون محاسبة)' },
  { abbr: 'Promo', full: 'Promo (عروض)' },
  { abbr: 'Ret', full: 'Retour (المُرجع)' },
  { abbr: 'Sys', full: 'Système (النظام)' },
  { abbr: 'Reel', full: 'Réel (الفعلي)' },
  { abbr: 'Diff', full: 'Différence (الفارق)' },
];

const ThermalPreview: React.FC<ThermalPreviewProps> = ({ lines, showLegendToggle = true }) => {
  const [showLegend, setShowLegend] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {showLegendToggle && (
        <div className="flex items-center gap-2 justify-end px-1">
          <Label htmlFor="legend-switch" className="text-xs text-muted-foreground cursor-pointer">
            شرح الاختصارات
          </Label>
          <Switch
            id="legend-switch"
            checked={showLegend}
            onCheckedChange={setShowLegend}
          />
        </div>
      )}

      <div className="overflow-y-auto max-h-[55vh]">
        <div className="flex justify-center py-3">
          <div
            className="bg-white text-black rounded shadow-lg border"
            style={{
              width: '190px',
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '10px',
              lineHeight: '1.4',
              padding: '10px 6px',
            }}
          >
            {lines.map((line, i) => {
              if (line.separator) {
                return (
                  <div key={i} style={{ textAlign: 'center', letterSpacing: '1px', color: '#666' }}>
                    {'─'.repeat(32)}
                  </div>
                );
              }
              if (line.dotSeparator) {
                return (
                  <div key={i} style={{ textAlign: 'center', color: '#999', letterSpacing: '1px' }}>
                    {'·'.repeat(32)}
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  style={{
                    fontWeight: line.bold ? 'bold' : 'normal',
                    textAlign: line.center ? 'center' : 'left',
                    fontSize: line.large ? '13px' : '10px',
                    whiteSpace: 'pre',
                    overflow: 'hidden',
                  }}
                >
                  {line.text || ''}
                </div>
              );
            })}

            {showLegend && (
              <>
                <div style={{ textAlign: 'center', letterSpacing: '1px', color: '#666', marginTop: '6px' }}>
                  {'─'.repeat(32)}
                </div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>
                  Légende / شرح
                </div>
                {LEGEND_ITEMS.map((item, i) => (
                  <div key={i} style={{ fontSize: '9px', whiteSpace: 'pre' }}>
                    {`${item.abbr} = ${item.full}`}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThermalPreview;
