import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Search, Trash2, Edit2, Users, Package, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePromoSplits, PromoSplitWithDetails } from '@/hooks/usePromoSplits';
import CreatePromoSplitDialog from '@/components/promo/CreatePromoSplitDialog';
import PromoSplitDetailsDialog from '@/components/promo/PromoSplitDetailsDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'نشط', variant: 'default' },
  completed: { label: 'مكتمل', variant: 'secondary' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

const PromoSplits: React.FC = () => {
  const navigate = useNavigate();
  const { dir } = useLanguage();
  const { splits, isLoading, deleteSplit } = usePromoSplits();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editSplit, setEditSplit] = useState<PromoSplitWithDetails | null>(null);
  const [viewSplit, setViewSplit] = useState<PromoSplitWithDetails | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = splits.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.product?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const getTotalDelivered = (s: PromoSplitWithDetails) =>
    s.customers?.reduce((sum, c) => sum + Number(c.delivered_quantity || 0), 0) || 0;

  return (
    <div className="p-4 space-y-4" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">تجزئة العروض</h1>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" />
          إنشاء تجزئة
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pr-9"
          placeholder="بحث..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">لا توجد تجزئات</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(split => {
            const st = statusLabels[split.status] || statusLabels.active;
            const totalDelivered = getTotalDelivered(split);
            const targetQuantity = Number(split.target_quantity || 0);
            const progressRaw = targetQuantity > 0 ? (totalDelivered / targetQuantity) * 100 : 0;
            const progressBar = Math.min(100, progressRaw);
            const effectiveGift = Number(split.adjusted_gift_quantity ?? split.gift_quantity);

            const isGrouped = split.split_type === 'customer_group';
            const completedGroups = isGrouped && targetQuantity > 0 ? Math.floor(totalDelivered / targetQuantity) : 0;
            const remainder = isGrouped && targetQuantity > 0 ? (totalDelivered % targetQuantity) : 0;
            const remainingToNextGroup = isGrouped && targetQuantity > 0
              ? (remainder === 0 ? 0 : targetQuantity - remainder)
              : 0;
            const totalEligiblePromo = isGrouped ? completedGroups * effectiveGift : effectiveGift;

            return (
              <Card key={split.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{split.name}</span>
                        <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Package className="w-3 h-3" />
                        <span>{split.product?.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />
                        <span>{split.customers?.length || 0} عميل</span>
                        <span>•</span>
                        <span>{split.split_type === 'quantity_accumulation' ? 'تجميع كميات' : 'تجميع عملاء'}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewSplit(split)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditSplit(split)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(split.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>التقدم: {totalDelivered} / {targetQuantity} {split.target_quantity_unit === 'box' ? 'صندوق' : 'قطعة'}</span>
                      <span>{progressRaw.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${progressBar}%` }}
                      />
                    </div>
                    {isGrouped ? (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>العرض لكل مجموعة: {effectiveGift} {split.gift_quantity_unit === 'box' ? 'صندوق' : 'قطعة'}</div>
                        <div>المجموعات المكتملة: {completedGroups} • العرض المستحق: {totalEligiblePromo}</div>
                        {targetQuantity > 0 && remainingToNextGroup > 0 && (
                          <div>المتبقي للمجموعة التالية: {remainingToNextGroup} {split.target_quantity_unit === 'box' ? 'صندوق' : 'قطعة'}</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        العرض: {effectiveGift} {split.gift_quantity_unit === 'box' ? 'صندوق' : 'قطعة'}
                        {split.adjusted_gift_quantity !== null && split.adjusted_gift_quantity !== split.gift_quantity && (
                          <span className="mr-1">(معدلة من {Number(split.gift_quantity)})</span>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreatePromoSplitDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        editSplit={null}
      />

      {editSplit && (
        <CreatePromoSplitDialog
          open={!!editSplit}
          onOpenChange={open => !open && setEditSplit(null)}
          editSplit={editSplit}
        />
      )}

      {viewSplit && (
        <PromoSplitDetailsDialog
          open={!!viewSplit}
          onOpenChange={open => !open && setViewSplit(null)}
          split={viewSplit}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التجزئة</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذه التجزئة؟ سيتم حذف جميع البيانات المرتبطة بها.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteSplit(deleteId); setDeleteId(null); }}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PromoSplits;
