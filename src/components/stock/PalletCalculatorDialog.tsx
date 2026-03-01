import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calculator, Settings, Layers, Delete } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import PalletSettingsDialog from './PalletSettingsDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatLayerBoxes = (layers: number, boxes: number): string => {
  const boxStr = boxes < 10 ? `0${boxes}` : `${boxes}`;
  return `${layers}.${boxStr}`;
};

const parseLayerBoxes = (value: string, bpl: number): number | null => {
  if (!value || !value.includes('.')) return null;
  const [l, b] = value.split('.');
  return (parseInt(l) || 0) * bpl + (parseInt(b) || 0);
};

type ActiveField = 'desired' | 'available';
const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

const PalletCalculatorDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { activeBranch } = useAuth();
  const branchId = activeBranch?.id || null;
  const [showSettings, setShowSettings] = useState(false);
  const [selectedSettingId, setSelectedSettingId] = useState<string>('');
  const [desiredBoxes, setDesiredBoxes] = useState<string>('');
  const [availableInput, setAvailableInput] = useState<string>('');
  const [activeField, setActiveField] = useState<ActiveField>('desired');

  const { data: palletSettings = [], refetch: refetchSettings } = useQuery({
    queryKey: ['pallet-settings-calculator', branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('pallet_settings')
        .select('id, name, boxes_per_pallet, boxes_per_layer')
        .eq('branch_id', branchId!);
      return data || [];
    },
    enabled: open && !!branchId,
  });

  const configuredTypes = useMemo(() => palletSettings.filter(s => (s.boxes_per_layer ?? 0) > 0 && s.name), [palletSettings]);

  // Auto-select first type
  useEffect(() => {
    if (open && configuredTypes.length > 0 && !selectedSettingId) {
      setSelectedSettingId(configuredTypes[0].id);
    }
  }, [open, configuredTypes, selectedSettingId]);

  const currentSetting = useMemo(() => palletSettings.find(s => s.id === selectedSettingId) || null, [selectedSettingId, palletSettings]);
  const boxesPerLayer = currentSetting?.boxes_per_layer || 0;

  const handleNumpad = useCallback((key: string) => {
    const setter = activeField === 'desired' ? setDesiredBoxes : setAvailableInput;
    if (key === 'del') {
      setter(prev => prev.slice(0, -1));
    } else if (key === '.') {
      if (activeField === 'desired') return;
      setter(prev => prev.includes('.') ? prev : prev + '.');
    } else {
      setter(prev => prev + key);
    }
  }, [activeField]);

  const selectType = (id: string) => {
    setSelectedSettingId(id);
    setDesiredBoxes('');
    setAvailableInput('');
    setActiveField('desired');
  };

  const desiredResult = useMemo(() => {
    const total = parseInt(desiredBoxes) || 0;
    if (total <= 0 || boxesPerLayer <= 0) return null;
    return { layers: Math.floor(total / boxesPerLayer), boxes: total % boxesPerLayer, formatted: formatLayerBoxes(Math.floor(total / boxesPerLayer), total % boxesPerLayer) };
  }, [desiredBoxes, boxesPerLayer]);

  const remainderResult = useMemo(() => {
    if (!desiredResult || !availableInput || boxesPerLayer <= 0) return null;
    const totalAvailable = parseLayerBoxes(availableInput, boxesPerLayer);
    if (totalAvailable === null) return null;
    const leftover = totalAvailable - (parseInt(desiredBoxes) || 0);
    if (leftover < 0) return { formatted: 'غير كافٍ', deficit: true, layers: 0, boxes: 0 };
    return { layers: Math.floor(leftover / boxesPerLayer), boxes: leftover % boxesPerLayer, formatted: formatLayerBoxes(Math.floor(leftover / boxesPerLayer), leftover % boxesPerLayer), deficit: false };
  }, [availableInput, desiredResult, desiredBoxes, boxesPerLayer]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm p-3" dir="rtl">
          <DialogHeader className="pb-1">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-primary" />
                <span className="text-sm">حاسبة الطبقات</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettings(true)}>
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {/* Type selector tabs */}
            {configuredTypes.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {configuredTypes.map(item => (
                  <button
                    key={item.id}
                    onClick={() => selectType(item.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-all border-2 ${
                      selectedSettingId === item.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-transparent bg-muted text-foreground hover:bg-accent'
                    }`}
                  >
                    {item.name}
                    <span className="text-[9px] font-normal mr-1" dir="ltr">
                      {item.boxes_per_layer} B/C
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-foreground text-xs border rounded-lg border-dashed">
                <p>لا توجد أنواع تغليف</p>
                <Button variant="link" size="sm" className="text-xs h-6" onClick={() => setShowSettings(true)}>
                  اضبط الإعدادات
                </Button>
              </div>
            )}

            {boxesPerLayer > 0 && (
              <>
                {/* Results area */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveField('desired')}
                    className={`rounded-lg p-2 text-center border-2 transition-colors ${
                      activeField === 'desired' ? 'border-primary bg-primary/5' : 'border-transparent bg-muted'
                    }`}
                  >
                    <p className="text-[10px] text-foreground font-medium mb-0.5">الصناديق المطلوبة</p>
                    <p className={`text-xl font-black min-h-[1.75rem] text-foreground`}>
                      {desiredBoxes || '0'}
                    </p>
                  </button>
                  <div className={`rounded-lg p-2 text-center flex flex-col justify-center ${desiredResult ? 'bg-primary/10 border border-primary/20' : 'bg-muted'}`}>
                    <p className="text-[10px] text-foreground font-medium">يجب أن تأخذ</p>
                    <p dir="ltr" className={`text-xl font-black ${desiredResult ? 'text-primary' : 'text-foreground/30'}`}>
                      {desiredResult ? desiredResult.formatted : '—'}
                    </p>
                    {desiredResult && (
                      <div className="text-[10px] text-foreground" dir="ltr">
                        <p>{desiredResult.layers} C · {desiredResult.boxes} B</p>
                        {desiredResult.boxes > 0 && (
                          <p className="text-primary/80 font-medium mt-0.5">
                            {desiredResult.layers + 1} C - {boxesPerLayer - desiredResult.boxes} B
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveField('available')}
                    className={`rounded-lg p-2 text-center border-2 transition-colors ${
                      activeField === 'available' ? 'border-primary bg-primary/5' : 'border-transparent bg-muted'
                    }`}
                  >
                    <p className="text-[10px] text-foreground font-medium mb-0.5">المتوفر <span dir="ltr">(C.B)</span></p>
                    <p dir="ltr" className={`text-xl font-black min-h-[1.75rem] text-foreground`}>
                      {availableInput || '0.00'}
                    </p>
                    {availableInput && parseLayerBoxes(availableInput, boxesPerLayer) !== null && (
                      <p dir="ltr" className="text-[10px] text-foreground">= {parseLayerBoxes(availableInput, boxesPerLayer)} B</p>
                    )}
                  </button>
                  <div className={`rounded-lg p-2 text-center flex flex-col justify-center border ${
                    remainderResult ? (remainderResult.deficit ? 'bg-destructive/10 border-destructive/20' : 'bg-primary/5 border-primary/20') : 'bg-muted border-transparent'
                  }`}>
                    <p className="text-[10px] text-foreground font-medium">{remainderResult?.deficit ? 'غير كافٍ!' : 'يجب أن تترك'}</p>
                    <p dir="ltr" className={`text-xl font-black ${remainderResult ? (remainderResult.deficit ? 'text-destructive' : 'text-primary') : 'text-foreground/30'}`}>
                      {remainderResult ? (remainderResult.deficit ? '✕' : remainderResult.formatted) : '—'}
                    </p>
                    {remainderResult && !remainderResult.deficit && (
                      <div className="text-[10px] text-foreground" dir="ltr">
                        <p>{remainderResult.layers} C · {remainderResult.boxes} B</p>
                        {remainderResult.boxes > 0 && (
                          <p className="text-primary/80 font-medium mt-0.5">
                            {remainderResult.layers + 1} C - {boxesPerLayer - remainderResult.boxes} B
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  {NUMPAD_KEYS.map(key => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleNumpad(key)}
                      disabled={key === '.' && activeField === 'desired'}
                      className={`h-11 rounded-lg font-bold text-lg transition-all active:scale-95 ${
                        key === 'del'
                          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center'
                          : key === '.' && activeField === 'desired'
                            ? 'bg-muted text-foreground/30 cursor-not-allowed'
                            : 'bg-muted text-foreground hover:bg-accent'
                      }`}
                    >
                      {key === 'del' ? <Delete className="w-5 h-5" /> : key}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {branchId && (
        <PalletSettingsDialog
          open={showSettings}
          onOpenChange={(v) => { setShowSettings(v); if (!v) refetchSettings(); }}
          branchId={branchId}
          showLayerField
        />
      )}
    </>
  );
};

export default PalletCalculatorDialog;
