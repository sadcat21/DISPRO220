import React, { useState, useMemo } from 'react';
import { User, Loader2, Search, Eye, EyeOff, ChevronRight, Layout, MousePointer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useWorkerUIOverrides, useToggleUIOverride, UI_ELEMENTS } from '@/hooks/useUIOverrides';
import { useQuery } from '@tanstack/react-query';

interface WorkerBasic {
  id: string;
  full_name: string;
  username: string;
  role: string;
  is_active: boolean;
}

const WorkerUIOverridesSection: React.FC = () => {
  const toggleOverride = useToggleUIOverride();
  const [search, setSearch] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const { data: workers, isLoading: workersLoading } = useQuery({
    queryKey: ['workers-basic'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, username, role, is_active')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data as WorkerBasic[];
    },
  });

  const { data: overrides, isLoading: overridesLoading } = useWorkerUIOverrides(selectedWorkerId);

  // Count hidden elements per worker
  const { data: allOverrides } = useQuery({
    queryKey: ['all-ui-overrides-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_ui_overrides')
        .select('worker_id, element_type')
        .eq('is_hidden', true);
      if (error) throw error;
      return data as { worker_id: string; element_type: string }[];
    },
  });

  const filteredWorkers = workers?.filter(w =>
    w.full_name.includes(search) || w.username.includes(search)
  ) || [];

  const selectedWorker = workers?.find(w => w.id === selectedWorkerId);

  const isElementHidden = (elementType: string, elementKey: string): boolean => {
    return overrides?.some(o => o.element_type === elementType && o.element_key === elementKey && o.is_hidden) ?? false;
  };

  const handleToggle = async (elementType: string, elementKey: string) => {
    if (!selectedWorkerId) return;
    const currentlyHidden = isElementHidden(elementType, elementKey);
    await toggleOverride.mutateAsync({
      workerId: selectedWorkerId,
      elementType,
      elementKey,
      isHidden: !currentlyHidden,
    });
  };

  if (workersLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Worker selection view
  if (!selectedWorkerId) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث عن عامل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filteredWorkers.map(worker => {
            const hiddenCount = allOverrides?.filter(o => o.worker_id === worker.id).length || 0;
            return (
              <Card
                key={worker.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedWorkerId(worker.id)}
              >
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                      <User className="w-4.5 h-4.5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{worker.full_name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">@{worker.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hiddenCount > 0 && (
                      <Badge variant="destructive" className="text-xs">{hiddenCount} مخفي</Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filteredWorkers.length === 0 && (
            <div className="col-span-full p-6 text-center text-sm text-muted-foreground">
              لا يوجد عمال
            </div>
          )}
        </div>
      </div>
    );
  }

  // Override details view for selected worker
  return (
    <div className="space-y-4">
      {/* Back button + worker info */}
      <Card
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => setSelectedWorkerId(null)}
      >
        <CardContent className="flex items-center gap-2.5 p-3">
          <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-0 rotate-180" />
          <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
            <User className="w-4.5 h-4.5 text-orange-600" />
          </div>
          <div>
            <p className="text-sm font-medium">{selectedWorker?.full_name}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">@{selectedWorker?.username}</p>
          </div>
        </CardContent>
      </Card>

      {overridesLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-20rem)]">
          <div className="space-y-4 pb-4">
            {/* Pages section */}
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Layout className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">الصفحات والتبويبات</span>
                </div>
                <p className="text-xs text-muted-foreground">قم بتعطيل المفتاح لإخفاء الصفحة من قائمة التنقل لهذا العامل</p>
                {UI_ELEMENTS.pages.map(page => {
                  const hidden = isElementHidden('page', page.key);
                  return (
                    <div key={page.key} className="flex items-center justify-between gap-2 py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {hidden ? (
                          <EyeOff className="w-3.5 h-3.5 text-destructive shrink-0" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        )}
                        <span className="text-xs truncate">{page.label}</span>
                        <span className="text-[10px] text-muted-foreground" dir="ltr">{page.key}</span>
                      </div>
                      <Switch
                        checked={!hidden}
                        onCheckedChange={() => handleToggle('page', page.key)}
                        disabled={toggleOverride.isPending}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Buttons section */}
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <MousePointer className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">الأزرار والإجراءات</span>
                </div>
                <p className="text-xs text-muted-foreground">قم بتعطيل المفتاح لإخفاء الزر من واجهة هذا العامل</p>
                {UI_ELEMENTS.buttons.map(button => {
                  const hidden = isElementHidden('button', button.key);
                  return (
                    <div key={button.key} className="flex items-center justify-between gap-2 py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {hidden ? (
                          <EyeOff className="w-3.5 h-3.5 text-destructive shrink-0" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        )}
                        <span className="text-xs truncate">{button.label}</span>
                      </div>
                      <Switch
                        checked={!hidden}
                        onCheckedChange={() => handleToggle('button', button.key)}
                        disabled={toggleOverride.isPending}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default WorkerUIOverridesSection;
