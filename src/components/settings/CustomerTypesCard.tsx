import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Store, Loader2, GripVertical, Pencil, Check, X, Info, Palette } from 'lucide-react';
import { useCustomerTypes, CustomerTypeEntry, getCustomerTypeColor } from '@/hooks/useCustomerTypes';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EditFormState {
  ar: string;
  fr: string;
  en: string;
  short: string;
  description: string;
  bg_color: string;
  text_color: string;
}

const CustomerTypesCard: React.FC = () => {
  const { customerTypes, isLoading, updateTypes } = useCustomerTypes();
  const { language } = useLanguage();
  const [newType, setNewType] = useState('');
  const [newShort, setNewShort] = useState('');
  const [newBgColor, setNewBgColor] = useState('#1d4ed8');
  const [newTextColor, setNewTextColor] = useState('#ffffff');
  const [isTranslating, setIsTranslating] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ ar: '', fr: '', en: '', short: '', description: '', bg_color: '#1d4ed8', text_color: '#ffffff' });
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleAdd = async () => {
    const trimmed = newType.trim();
    if (!trimmed) return;
    if (customerTypes.some(t => t.ar === trimmed || t.fr === trimmed || t.en === trimmed)) {
      toast.error('هذا النوع موجود بالفعل');
      return;
    }

    setIsTranslating(true);
    try {
      const sourceLang = language;
      const targetLangs = (['ar', 'fr', 'en'] as const).filter(l => l !== sourceLang);

      const { data: translateData, error: translateError } = await supabase.functions.invoke('translate-text', {
        body: { text: trimmed, sourceLang, targetLangs, mode: 'translate' },
      });

      let entry: CustomerTypeEntry;
      if (translateError || !translateData?.translations) {
        entry = { ar: trimmed, fr: trimmed, en: trimmed, short: newShort.trim() || '', description: '', bg_color: newBgColor, text_color: newTextColor };
      } else {
        entry = {
          ar: sourceLang === 'ar' ? trimmed : (translateData.translations.ar || trimmed),
          fr: sourceLang === 'fr' ? trimmed : (translateData.translations.fr || trimmed),
          en: sourceLang === 'en' ? trimmed : (translateData.translations.en || trimmed),
          short: newShort.trim() || '',
          description: '',
          bg_color: newBgColor,
          text_color: newTextColor,
        };
      }

      await updateTypes.mutateAsync([...customerTypes, entry]);
      setNewType('');
      setNewShort('');
      toast.success('تم إضافة النوع بنجاح');
    } catch {
      toast.error('فشل في الإضافة');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRemove = async (entry: CustomerTypeEntry) => {
    try {
      await updateTypes.mutateAsync(customerTypes.filter(t => t.ar !== entry.ar));
      toast.success('تم حذف النوع');
    } catch {
      toast.error('فشل في الحذف');
    }
  };

  const handleEditStart = (index: number) => {
    const t = customerTypes[index];
    setEditingIndex(index);
    setEditForm({ ar: t.ar, fr: t.fr, en: t.en, short: t.short || '', description: t.description || '', bg_color: t.bg_color || '#1d4ed8', text_color: t.text_color || '#ffffff' });
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditForm({ ar: '', fr: '', en: '', short: '', description: '', bg_color: '#1d4ed8', text_color: '#ffffff' });
  };

  const handleEditSave = async () => {
    if (editingIndex === null) return;
    if (!editForm.ar.trim() && !editForm.fr.trim() && !editForm.en.trim()) {
      toast.error('يجب ملء حقل واحد على الأقل');
      return;
    }
    try {
      const updated = [...customerTypes];
      updated[editingIndex] = {
        ar: editForm.ar.trim(),
        fr: editForm.fr.trim(),
        en: editForm.en.trim(),
        short: editForm.short.trim(),
        description: editForm.description.trim(),
        bg_color: editForm.bg_color,
        text_color: editForm.text_color,
      };
      await updateTypes.mutateAsync(updated);
      setEditingIndex(null);
      toast.success('تم تحديث النوع بنجاح');
    } catch {
      toast.error('فشل في التحديث');
    }
  };

  const handleDragStart = (index: number) => { dragItem.current = index; };
  const handleDragEnter = (index: number) => { dragOverItem.current = index; };

  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    const reordered = [...customerTypes];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    dragItem.current = null;
    dragOverItem.current = null;
    try {
      await updateTypes.mutateAsync(reordered);
    } catch {
      toast.error('فشل في تغيير الترتيب');
    }
  };

  const touchStartY = useRef<number>(0);
  const touchItemIndex = useRef<number | null>(null);

  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    touchItemIndex.current = index;
    touchStartY.current = e.touches[0].clientY;
    dragItem.current = index;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchItemIndex.current === null) return;
    const touch = e.touches[0];
    const elements = document.querySelectorAll('[data-type-index]');
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        const idx = parseInt(el.getAttribute('data-type-index') || '0');
        dragOverItem.current = idx;
      }
    });
  };

  const handleTouchEnd = () => {
    touchItemIndex.current = null;
    handleDragEnd();
  };

  const isPending = updateTypes.isPending || isTranslating;

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Store className="w-5 h-5" />
          أنواع العملاء
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sortable list */}
        <div className="space-y-1">
          {customerTypes.map((entry, index) => (
            <div
              key={entry.ar + index}
              data-type-index={index}
              draggable={editingIndex !== index}
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              onTouchStart={(e) => editingIndex !== index && handleTouchStart(index, e)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="rounded-lg border bg-card transition-colors"
            >
              {editingIndex === index ? (
                /* Edit mode */
                <div className="p-3 space-y-2">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 shrink-0">🇩🇿</span>
                      <Input
                        value={editForm.ar}
                        onChange={(e) => setEditForm({ ...editForm, ar: e.target.value })}
                        placeholder="عربي"
                        dir="rtl"
                        className="flex-1 h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 shrink-0">🇫🇷</span>
                      <Input
                        value={editForm.fr}
                        onChange={(e) => setEditForm({ ...editForm, fr: e.target.value })}
                        placeholder="Français"
                        dir="ltr"
                        className="flex-1 h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 shrink-0">🇺🇸</span>
                      <Input
                        value={editForm.en}
                        onChange={(e) => setEditForm({ ...editForm, en: e.target.value })}
                        placeholder="English"
                        dir="ltr"
                        className="flex-1 h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 shrink-0 font-bold">🔤</span>
                      <Input
                        value={editForm.short}
                        onChange={(e) => setEditForm({ ...editForm, short: e.target.value })}
                        placeholder="الاختصار (مثال: sup)"
                        dir="ltr"
                        className="flex-1 h-8 text-sm"
                        maxLength={10}
                      />
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground w-6 shrink-0 mt-2">📝</span>
                      <Textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="وصف النوع (مثال: محل متوسط في الحي يبيع تشكيلة متنوعة...)"
                        dir="rtl"
                        className="flex-1 text-sm min-h-[60px]"
                        rows={2}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Palette className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">لون الزر</label>
                        <input
                          type="color"
                          value={editForm.bg_color}
                          onChange={(e) => setEditForm({ ...editForm, bg_color: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">لون الكتابة</label>
                        <input
                          type="color"
                          value={editForm.text_color}
                          onChange={(e) => setEditForm({ ...editForm, text_color: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                        />
                      </div>
                      <div
                        className="px-3 py-1 rounded text-xs font-mono uppercase"
                        style={{ backgroundColor: editForm.bg_color, color: editForm.text_color }}
                      >
                        {editForm.short || 'معاينة'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={handleEditCancel} disabled={isPending}>
                      <X className="w-3.5 h-3.5 me-1" />
                      إلغاء
                    </Button>
                    <Button size="sm" onClick={handleEditSave} disabled={isPending}>
                      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : <Check className="w-3.5 h-3.5 me-1" />}
                      حفظ
                    </Button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div>
                  <div className="flex items-center gap-2 p-2.5 hover:bg-accent/50 cursor-grab active:cursor-grabbing group">
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    
                    <div className="flex-1 min-w-0" onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{(entry as any)[language] || entry.ar}</span>
                        {entry.short && (() => {
                          const colors = getCustomerTypeColor(entry.short, index, entry);
                          return (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase"
                              style={{ backgroundColor: colors.bg, color: colors.text }}
                            >
                              {entry.short}
                            </span>
                          );
                        })()}
                        {entry.description && (
                          <Info className="w-3 h-3 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span>🇩🇿 {entry.ar}</span>
                        <span>🇫🇷 {entry.fr}</span>
                        <span>🇺🇸 {entry.en}</span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100"
                      onClick={() => handleEditStart(index)}
                      disabled={isPending}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100 hover:text-destructive"
                      onClick={() => handleRemove(entry)}
                      disabled={isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {/* Description expanded */}
                  {expandedIndex === index && entry.description && (
                    <div className="px-10 pb-2.5 text-xs text-muted-foreground border-t border-dashed mx-2.5 pt-2">
                      📝 {entry.description}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new type */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex gap-2">
            <Input
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="نوع جديد..."
              className="text-right flex-1"
              disabled={isPending}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            />
            <Input
              value={newShort}
              onChange={(e) => setNewShort(e.target.value)}
              placeholder="اختصار"
              className="w-20 text-center font-mono"
              disabled={isPending}
              maxLength={10}
              dir="ltr"
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newType.trim() || isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Palette className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">لون الزر</label>
              <input
                type="color"
                value={newBgColor}
                onChange={(e) => setNewBgColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">لون الكتابة</label>
              <input
                type="color"
                value={newTextColor}
                onChange={(e) => setNewTextColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0"
              />
            </div>
            <div
              className="px-3 py-1 rounded text-xs font-mono uppercase"
              style={{ backgroundColor: newBgColor, color: newTextColor }}
            >
              {newShort || 'معاينة'}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          اضغط على النوع لعرض الوصف — اضغط القلم للتعديل — اسحب للترتيب — يتم ترجمة الأنواع الجديدة تلقائياً
        </p>
      </CardContent>
    </Card>
  );
};

export default CustomerTypesCard;
