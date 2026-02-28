import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, Settings, Package, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';
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

const parseLayerBoxes = (value: string): { layers: number; boxes: number } | null => {
  if (!value || !value.includes('.')) return null;
  const [layerStr, boxStr] = value.split('.');
  const layers = parseInt(layerStr) || 0;
  const boxes = parseInt(boxStr) || 0;
  return { layers, boxes };
};

const PalletCalculatorDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { activeBranch } = useAuth();
  const branchId = activeBranch?.id || null;
  const [showSettings, setShowSettings] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [desiredBoxes, setDesiredBoxes] = useState<string>('');
  const [availableInput, setAvailableInput] = useState<string>('');

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-calculator'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name');
      return (data || []) as Product[];
    },
    enabled: open,
  });

  const { data: palletSettings = [], refetch: refetchSettings } = useQuery({
    queryKey: ['pallet-settings-calculator', branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('pallet_settings')
        .select('product_id, boxes_per_pallet, boxes_per_layer')
        .eq('branch_id', branchId!);
      return data || [];
    },
    enabled: open && !!branchId,
  });

  const currentSetting = useMemo(() => {
    if (!selectedProductId) return null;
    return palletSettings.find(s => s.product_id === selectedProductId) || null;
  }, [selectedProductId, palletSettings]);

  const boxesPerLayer = currentSetting?.boxes_per_layer || 0;

  const desiredResult = useMemo(() => {
    const total = parseInt(desiredBoxes) || 0;
    if (total <= 0 || boxesPerLayer <= 0) return null;
    const layers = Math.floor(total / boxesPerLayer);
    const remaining = total % boxesPerLayer;
    return { layers, boxes: remaining, formatted: formatLayerBoxes(layers, remaining) };
  }, [desiredBoxes, boxesPerLayer]);

  const remainderResult = useMemo(() => {
    if (!desiredResult || !availableInput) return null;
    const available = parseLayerBoxes(availableInput);
    if (!available) return null;
    const totalAvailable = available.layers * boxesPerLayer + available.boxes;
    const totalDesired = parseInt(desiredBoxes) || 0;
    const leftover = totalAvailable - totalDesired;
    if (leftover < 0) return { layers: 0, boxes: 0, formatted: 'غير كافٍ', deficit: true };
    const layers = Math.floor(leftover / boxesPerLayer);
    const boxes = leftover % boxesPerLayer;
    return { layers, boxes, formatted: formatLayerBoxes(layers, boxes), deficit: false };
  }, [availableInput, desiredResult, desiredBoxes, boxesPerLayer]);

  const configuredProducts = useMemo(() => {
    const configuredIds = new Set(palletSettings.filter(s => s.boxes_per_layer > 0).map(s => s.product_id));
    return products.filter(p => configuredIds.has(p.id));
  }, [products, palletSettings]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                حاسبة الطبقات
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSettings(true)}>
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Product Selection Grid */}
            <div>
              <Label className="text-sm font-medium mb-2 block">اختر المنتج</Label>
              {configuredProducts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm border rounded-xl border-dashed">
                  <Settings className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>لا توجد إعدادات طبقات</p>
                  <Button variant="link" size="sm" onClick={() => setShowSettings(true)}>
                    اضبط الإعدادات أولاً
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {configuredProducts.map(product => {
                    const setting = palletSettings.find(s => s.product_id === product.id);
                    const isSelected = selectedProductId === product.id;
                    return (
                      <button
                        key={product.id}
                        onClick={() => {
                          setSelectedProductId(product.id);
                          setDesiredBoxes('');
                          setAvailableInput('');
                        }}
                        className={`rounded-xl p-3 text-center transition-all border-2 ${
                          isSelected
                            ? 'border-primary bg-primary/10 shadow-md'
                            : 'border-transparent bg-muted hover:bg-accent'
                        }`}
                      >
                        <Package className={`w-5 h-5 mx-auto mb-1 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <p className="text-[11px] font-bold leading-tight truncate">{product.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {setting?.boxes_per_layer || 0} صندوق/طبقة
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Calculator Section */}
            {selectedProductId && boxesPerLayer > 0 && (
              <div className="space-y-4 bg-muted/50 rounded-xl p-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">عدد الصناديق المطلوبة</Label>
                  <Input
                    type="number"
                    min={0}
                    value={desiredBoxes}
                    onChange={e => setDesiredBoxes(e.target.value)}
                    placeholder="مثال: 50"
                    className="text-center text-lg font-bold h-12"
                  />
                </div>

                {desiredResult && (
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">يجب أن تأخذ</p>
                    <p className="text-3xl font-black text-primary">{desiredResult.formatted}</p>
                    <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {desiredResult.layers} طبقة
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {desiredResult.boxes} صندوق
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium mb-1.5 block">المتوفر (طبقات.صناديق)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={availableInput}
                    onChange={e => setAvailableInput(e.target.value)}
                    placeholder="مثال: 7.12"
                    className="text-center text-lg font-bold h-12"
                  />
                  {availableInput && parseLayerBoxes(availableInput) && (
                    <p className="text-[11px] text-muted-foreground text-center mt-1">
                      = {(parseLayerBoxes(availableInput)!.layers * boxesPerLayer) + parseLayerBoxes(availableInput)!.boxes} صندوق إجمالي
                    </p>
                  )}
                </div>

                {remainderResult && (
                  <div className={`rounded-xl p-4 text-center border ${
                    remainderResult.deficit
                      ? 'bg-destructive/10 border-destructive/20'
                      : 'bg-primary/5 border-primary/20'
                  }`}>
                    <p className="text-xs text-muted-foreground mb-1">
                      {remainderResult.deficit ? 'الكمية غير كافية!' : 'يجب أن تترك'}
                    </p>
                    {!remainderResult.deficit && (
                      <>
                        <p className="text-3xl font-black text-primary">{remainderResult.formatted}</p>
                        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {remainderResult.layers} طبقة
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {remainderResult.boxes} صندوق
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {branchId && (
        <PalletSettingsDialog
          open={showSettings}
          onOpenChange={(v) => {
            setShowSettings(v);
            if (!v) refetchSettings();
          }}
          branchId={branchId}
          products={products}
          showLayerField
        />
      )}
    </>
  );
};

export default PalletCalculatorDialog;
