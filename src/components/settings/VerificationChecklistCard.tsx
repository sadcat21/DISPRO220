import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileCheck, Plus, Pencil, Trash2, Loader2, CheckSquare, Type, Hash, Calendar } from 'lucide-react';
import { useVerificationChecklist, VerificationChecklistItem } from '@/hooks/useVerificationChecklist';

const FIELD_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  checkbox: { label: 'تحديد (✓)', icon: CheckSquare },
  text: { label: 'نص', icon: Type },
  number: { label: 'رقم', icon: Hash },
  date: { label: 'تاريخ', icon: Calendar },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  check: 'Chèque (شيك)',
  receipt: 'Versement (وصل دفع)',
  transfer: 'Virement (تحويل)',
};

interface ItemFormData {
  label: string;
  group_title: string;
  field_type: 'checkbox' | 'text' | 'number' | 'date';
  sort_order: number;
  is_active: boolean;
}

const defaultForm: ItemFormData = {
  label: '',
  group_title: '',
  field_type: 'checkbox',
  sort_order: 0,
  is_active: true,
};

const VerificationChecklistCard: React.FC = () => {
  const { items, isLoading, addItem, updateItem, deleteItem } = useVerificationChecklist();
  const [activeTab, setActiveTab] = useState<'check' | 'receipt' | 'transfer'>('check');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VerificationChecklistItem | null>(null);
  const [form, setForm] = useState<ItemFormData>(defaultForm);

  const filteredItems = items.filter(i => i.document_type === activeTab);
  const groups = [...new Set(filteredItems.map(i => i.group_title))];

  const openAdd = () => {
    setEditingItem(null);
    const maxOrder = filteredItems.length > 0 ? Math.max(...filteredItems.map(i => i.sort_order)) : 0;
    setForm({ ...defaultForm, sort_order: maxOrder + 1 });
    setDialogOpen(true);
  };

  const openEdit = (item: VerificationChecklistItem) => {
    setEditingItem(item);
    setForm({
      label: item.label,
      group_title: item.group_title,
      field_type: item.field_type,
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.label.trim() || !form.group_title.trim()) return;

    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, ...form }, { onSuccess: () => setDialogOpen(false) });
    } else {
      addItem.mutate({
        document_type: activeTab,
        ...form,
        uses_company_info: false,
        company_info_template: null,
        branch_id: null,
      } as any, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('هل تريد حذف هذا البند؟')) {
      deleteItem.mutate(id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileCheck className="w-5 h-5" />
          إدارة بنود التحقق من المستندات
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="check">شيك</TabsTrigger>
            <TabsTrigger value="receipt">وصل دفع</TabsTrigger>
            <TabsTrigger value="transfer">تحويل</TabsTrigger>
          </TabsList>

          {['check', 'receipt', 'transfer'].map(docType => (
            <TabsContent key={docType} value={docType} className="space-y-3">
              {isLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <>
                  {groups.map(group => {
                    const groupItems = filteredItems.filter(i => i.group_title === group);
                    return (
                      <div key={group} className="space-y-1">
                        <p className="text-xs font-bold text-muted-foreground">{group}</p>
                        <div className="space-y-1 bg-muted/30 rounded-lg p-2">
                          {groupItems.map(item => {
                            const FieldIcon = FIELD_TYPE_LABELS[item.field_type]?.icon || CheckSquare;
                            return (
                              <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                                <FieldIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className={`text-sm flex-1 ${!item.is_active ? 'line-through text-muted-foreground' : ''}`}>
                                  {item.label}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                  {FIELD_TYPE_LABELS[item.field_type]?.label}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" className="w-full" onClick={openAdd}>
                    <Plus className="w-4 h-4 ms-1" />
                    إضافة بند تحقق
                  </Button>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'تعديل بند التحقق' : 'إضافة بند تحقق جديد'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>نوع المستند</Label>
                <Badge variant="secondary">{DOC_TYPE_LABELS[activeTab]}</Badge>
              </div>

              <div className="space-y-2">
                <Label>المجموعة</Label>
                <Input
                  value={form.group_title}
                  onChange={(e) => setForm(f => ({ ...f, group_title: e.target.value }))}
                  placeholder="مثال: بيانات الشيك"
                  list="group-suggestions"
                />
                <datalist id="group-suggestions">
                  {groups.map(g => <option key={g} value={g} />)}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label>عنوان البند</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="مثال: رقم الشيك"
                />
              </div>

              <div className="space-y-2">
                <Label>نوع الحقل</Label>
                <Select value={form.field_type} onValueChange={(v) => setForm(f => ({ ...f, field_type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([key, { label, icon: Icon }]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.field_type === 'checkbox' && 'خانة تحديد فقط (✓)'}
                  {form.field_type === 'text' && 'حقل لإدخال نص (مثال: رقم الشيك)'}
                  {form.field_type === 'number' && 'حقل لإدخال رقم (مثال: المبلغ)'}
                  {form.field_type === 'date' && 'أداة لاختيار تاريخ (مثال: تاريخ الاستحقاق)'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>الترتيب</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>مفعّل</Label>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
              </div>

              <Button
                className="w-full"
                onClick={handleSave}
                disabled={!form.label.trim() || !form.group_title.trim() || addItem.isPending || updateItem.isPending}
              >
                {(addItem.isPending || updateItem.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingItem ? 'حفظ التعديلات' : 'إضافة'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default VerificationChecklistCard;
