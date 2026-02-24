import React, { useState } from 'react';
import { User, Loader2, Search, Eye, EyeOff, ChevronRight, Layout, MousePointer, Layers, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const CATEGORIES = [
  { key: 'pages', label: 'الصفحات', icon: Layout, type: 'page', items: UI_ELEMENTS.pages },
  { key: 'tabs', label: 'التبويبات', icon: Layers, type: 'tab', items: UI_ELEMENTS.tabs },
  { key: 'buttons', label: 'الأزرار', icon: MousePointer, type: 'button', items: UI_ELEMENTS.buttons },
  { key: 'actions', label: 'الإجراءات', icon: Zap, type: 'action', items: UI_ELEMENTS.actions },
];

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
        <Tabs defaultValue="pages" dir="rtl">
          <TabsList className="w-full grid grid-cols-4">
            {CATEGORIES.map(cat => {
              const hiddenInCat = overrides?.filter(o => o.element_type === cat.type && o.is_hidden).length || 0;
              return (
                <TabsTrigger key={cat.key} value={cat.key} className="text-xs gap-1 relative">
                  <cat.icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                  {hiddenInCat > 0 && (
                    <Badge variant="destructive" className="absolute -top-1.5 -left-1.5 h-4 min-w-4 text-[9px] p-0 flex items-center justify-center">
                      {hiddenInCat}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {CATEGORIES.map(cat => (
            <TabsContent key={cat.key} value={cat.key}>
              <ScrollArea className="h-[calc(100vh-22rem)]">
                <Card>
                  <CardContent className="p-3 space-y-1">
                    {cat.items.map(item => {
                      const hidden = isElementHidden(cat.type, item.key);
                      return (
                        <div key={item.key} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {hidden ? (
                              <EyeOff className="w-3.5 h-3.5 text-destructive shrink-0" />
                            ) : (
                              <Eye className="w-3.5 h-3.5 text-green-600 shrink-0" />
                            )}
                            <span className="text-xs truncate">{item.label}</span>
                            {item.key.startsWith('/') && (
                              <span className="text-[10px] text-muted-foreground" dir="ltr">{item.key}</span>
                            )}
                          </div>
                          <Switch
                            checked={!hidden}
                            onCheckedChange={() => handleToggle(cat.type, item.key)}
                            disabled={toggleOverride.isPending}
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};

export default WorkerUIOverridesSection;
