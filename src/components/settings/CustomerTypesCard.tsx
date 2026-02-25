import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Store, Loader2 } from 'lucide-react';
import { useCustomerTypes } from '@/hooks/useCustomerTypes';
import { toast } from 'sonner';

const CustomerTypesCard: React.FC = () => {
  const { customerTypes, isLoading, updateTypes } = useCustomerTypes();
  const [newType, setNewType] = useState('');

  const handleAdd = async () => {
    const trimmed = newType.trim();
    if (!trimmed) return;
    if (customerTypes.includes(trimmed)) {
      toast.error('هذا النوع موجود بالفعل');
      return;
    }
    try {
      await updateTypes.mutateAsync([...customerTypes, trimmed]);
      setNewType('');
      toast.success('تم إضافة النوع بنجاح');
    } catch {
      toast.error('فشل في الإضافة');
    }
  };

  const handleRemove = async (type: string) => {
    try {
      await updateTypes.mutateAsync(customerTypes.filter(t => t !== type));
      toast.success('تم حذف النوع');
    } catch {
      toast.error('فشل في الحذف');
    }
  };

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
        <div className="flex flex-wrap gap-2">
          {customerTypes.map((type) => (
            <Badge key={type} variant="secondary" className="text-sm px-3 py-1.5 gap-1.5">
              {type}
              <button
                onClick={() => handleRemove(type)}
                className="hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="نوع جديد..."
            className="text-right flex-1"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!newType.trim() || updateTypes.isPending}
          >
            {updateTypes.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          هذه الأنواع تظهر كأزرار سريعة عند إضافة أو تعديل العملاء
        </p>
      </CardContent>
    </Card>
  );
};

export default CustomerTypesCard;
