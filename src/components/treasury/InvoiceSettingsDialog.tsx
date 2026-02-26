import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, MessageCircle, Route, GripVertical, Check, X, Pencil, Phone, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useSectors } from '@/hooks/useSectors';
import { getLocalizedName } from '@/utils/sectorName';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InvoiceSettingsDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { language, dir } = useLanguage();
  const { workerId, activeBranch } = useAuth();
  const queryClient = useQueryClient();
  const { sectors } = useSectors();

  const [activeTab, setActiveTab] = useState('whatsapp');

  // WhatsApp state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Route state
  const [newRouteName, setNewRouteName] = useState('');
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editRouteName, setEditRouteName] = useState('');
  const [addingSectorsToRoute, setAddingSectorsToRoute] = useState<string | null>(null);
  const [sectorSearch, setSectorSearch] = useState('');

  // Fetch WhatsApp contacts
  const { data: contacts } = useQuery({
    queryKey: ['treasury-whatsapp-contacts', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('treasury_contacts').select('*').eq('contact_type', 'whatsapp').eq('is_active', true).order('name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch delivery routes with sectors
  const { data: routes } = useQuery({
    queryKey: ['delivery-routes', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('delivery_routes').select('*, delivery_route_sectors(*, sectors(*))').order('name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      // Sort sectors within each route
      return (data || []).map((r: any) => ({
        ...r,
        delivery_route_sectors: (r.delivery_route_sectors || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      }));
    },
    enabled: open,
  });

  // WhatsApp mutations
  const addContact = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error('الاسم مطلوب');
      const { error } = await supabase.from('treasury_contacts').insert({
        branch_id: activeBranch?.id || null,
        contact_type: 'whatsapp',
        name: newName.trim(),
        phone: newPhone.trim() || null,
        created_by: workerId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName(''); setNewPhone('');
      queryClient.invalidateQueries({ queryKey: ['treasury-whatsapp-contacts'] });
      toast.success('تم الحفظ');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('treasury_contacts').update({
        name: editName.trim(), phone: editPhone.trim() || null,
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['treasury-whatsapp-contacts'] });
      toast.success('تم التحديث');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('treasury_contacts').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-whatsapp-contacts'] });
      toast.success('تم الحذف');
    },
  });

  // Route mutations
  const addRoute = useMutation({
    mutationFn: async () => {
      if (!newRouteName.trim()) throw new Error('اسم المسار مطلوب');
      const { error } = await supabase.from('delivery_routes').insert({
        name: newRouteName.trim(),
        branch_id: activeBranch?.id || null,
        created_by: workerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewRouteName('');
      queryClient.invalidateQueries({ queryKey: ['delivery-routes'] });
      toast.success('تم إنشاء المسار');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRoute = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_routes').update({ name: editRouteName.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingRouteId(null);
      queryClient.invalidateQueries({ queryKey: ['delivery-routes'] });
      toast.success('تم التحديث');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRoute = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_routes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-routes'] });
      toast.success('تم حذف المسار');
    },
  });

  const addSectorToRoute = useMutation({
    mutationFn: async ({ routeId, sectorId }: { routeId: string; sectorId: string }) => {
      const route = (routes || []).find((r: any) => r.id === routeId);
      const maxOrder = route?.delivery_route_sectors?.length || 0;
      const { error } = await supabase.from('delivery_route_sectors').insert({
        route_id: routeId,
        sector_id: sectorId,
        sort_order: maxOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-routes'] });
    },
  });

  const removeSectorFromRoute = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_route_sectors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-routes'] });
    },
  });

  const moveSector = useMutation({
    mutationFn: async ({ routeId, sectorEntryId, direction }: { routeId: string; sectorEntryId: string; direction: 'up' | 'down' }) => {
      const route = (routes || []).find((r: any) => r.id === routeId);
      if (!route) return;
      const entries = [...route.delivery_route_sectors];
      const idx = entries.findIndex((e: any) => e.id === sectorEntryId);
      if (idx < 0) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= entries.length) return;

      // Swap sort_order
      const { error: e1 } = await supabase.from('delivery_route_sectors').update({ sort_order: entries[swapIdx].sort_order }).eq('id', entries[idx].id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('delivery_route_sectors').update({ sort_order: entries[idx].sort_order }).eq('id', entries[swapIdx].id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-routes'] });
    },
  });

  const routeSectorIds = useMemo(() => {
    if (!addingSectorsToRoute || !routes) return new Set<string>();
    const route = routes.find((r: any) => r.id === addingSectorsToRoute);
    return new Set((route?.delivery_route_sectors || []).map((rs: any) => rs.sector_id));
  }, [addingSectorsToRoute, routes]);

  const filteredSectors = useMemo(() => {
    if (!sectorSearch) return sectors;
    return sectors.filter(s =>
      s.name?.includes(sectorSearch) || s.name_fr?.toLowerCase().includes(sectorSearch.toLowerCase())
    );
  }, [sectors, sectorSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-h-[85vh] overflow-hidden max-w-md p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-base">⚙️ إعدادات طلب الفاتورة</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} dir={dir} className="flex flex-col">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="whatsapp" className="flex-1 gap-1 text-xs">
              <MessageCircle className="w-3.5 h-3.5" /> واتساب
            </TabsTrigger>
            <TabsTrigger value="routes" className="flex-1 gap-1 text-xs">
              <Route className="w-3.5 h-3.5" /> المسارات
            </TabsTrigger>
          </TabsList>

          {/* WhatsApp Tab */}
          <TabsContent value="whatsapp" className="p-4 space-y-3 mt-0">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="اسم جهة الاتصال" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addContact.mutate()} />
                <Button size="sm" onClick={() => addContact.mutate()} disabled={addContact.isPending}><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="flex gap-2 items-center">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Input placeholder="رقم الهاتف" value={newPhone} onChange={e => setNewPhone(e.target.value)} type="tel" dir="ltr" onKeyDown={e => e.key === 'Enter' && addContact.mutate()} />
              </div>
            </div>
            <ScrollArea className="h-[40vh]">
              <div className="space-y-1.5">
                {(contacts || []).map((c: any) => (
                  <div key={c.id} className="bg-muted/50 rounded-lg px-3 py-2">
                    {editingId === c.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm" autoFocus />
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary" onClick={() => updateContact.mutate(c.id)}><Check className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                        </div>
                        <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} type="tel" dir="ltr" className="h-8 text-sm" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block">{c.name}</span>
                          {c.phone && <span className="text-[11px] text-muted-foreground" dir="ltr">{c.phone}</span>}
                        </div>
                        <div className="flex gap-0.5">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingId(c.id); setEditName(c.name); setEditPhone(c.phone || ''); }}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteContact.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {(contacts || []).length === 0 && <p className="text-center text-muted-foreground text-sm py-4">لا توجد أرقام واتساب</p>}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Routes Tab */}
          <TabsContent value="routes" className="p-4 space-y-3 mt-0">
            {/* Add route */}
            <div className="flex gap-2">
              <Input placeholder="اسم المسار (مثلاً: مسار بوقيرات)" value={newRouteName} onChange={e => setNewRouteName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRoute.mutate()} />
              <Button size="sm" onClick={() => addRoute.mutate()} disabled={addRoute.isPending}><Plus className="w-4 h-4" /></Button>
            </div>

            <ScrollArea className="h-[45vh]">
              <div className="space-y-3">
                {(routes || []).map((route: any) => (
                  <div key={route.id} className="border rounded-lg p-3 space-y-2">
                    {/* Route header */}
                    <div className="flex items-center justify-between">
                      {editingRouteId === route.id ? (
                        <div className="flex gap-2 flex-1">
                          <Input value={editRouteName} onChange={e => setEditRouteName(e.target.value)} className="h-8 text-sm" autoFocus />
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary" onClick={() => updateRoute.mutate(route.id)}><Check className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingRouteId(null)}><X className="w-4 h-4" /></Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <Route className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold">{route.name}</span>
                            <Badge variant="secondary" className="text-[10px]">{route.delivery_route_sectors?.length || 0} سكتور</Badge>
                          </div>
                          <div className="flex gap-0.5">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingRouteId(route.id); setEditRouteName(route.name); }}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteRoute.mutate(route.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Sectors in route */}
                    <div className="space-y-1">
                      {(route.delivery_route_sectors || []).map((rs: any, idx: number) => (
                        <div key={rs.id} className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5 text-xs">
                          <Badge variant="outline" className="text-[10px] h-5 w-5 p-0 flex items-center justify-center shrink-0">{idx + 1}</Badge>
                          <MapPin className="w-3 h-3 text-primary shrink-0" />
                          <span className="flex-1 truncate">{rs.sectors ? getLocalizedName(rs.sectors, language) : '—'}</span>
                          <div className="flex gap-0.5">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={idx === 0} onClick={() => moveSector.mutate({ routeId: route.id, sectorEntryId: rs.id, direction: 'up' })}>↑</Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={idx === route.delivery_route_sectors.length - 1} onClick={() => moveSector.mutate({ routeId: route.id, sectorEntryId: rs.id, direction: 'down' })}>↓</Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeSectorFromRoute.mutate(rs.id)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add sector to route */}
                    {addingSectorsToRoute === route.id ? (
                      <div className="space-y-2 border-t pt-2">
                        <div className="flex items-center gap-2">
                          <Input placeholder="بحث عن سكتور..." value={sectorSearch} onChange={e => setSectorSearch(e.target.value)} className="h-8 text-xs" />
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setAddingSectorsToRoute(null); setSectorSearch(''); }}>إغلاق</Button>
                        </div>
                        <ScrollArea className="h-[20vh]">
                          <div className="space-y-1">
                            {filteredSectors.map(s => {
                              const alreadyAdded = routeSectorIds.has(s.id);
                              return (
                                <Button
                                  key={s.id}
                                  variant="ghost"
                                  size="sm"
                                  className={`w-full justify-start h-8 text-xs gap-2 ${alreadyAdded ? 'opacity-40' : ''}`}
                                  disabled={alreadyAdded}
                                  onClick={() => addSectorToRoute.mutate({ routeId: route.id, sectorId: s.id })}
                                >
                                  <MapPin className="w-3 h-3 text-primary" />
                                  {getLocalizedName(s, language)}
                                  {alreadyAdded && <Check className="w-3 h-3 mr-auto" />}
                                </Button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1" onClick={() => setAddingSectorsToRoute(route.id)}>
                        <Plus className="w-3 h-3" /> إضافة سكتور
                      </Button>
                    )}
                  </div>
                ))}
                {(routes || []).length === 0 && <p className="text-center text-muted-foreground text-sm py-8">لا توجد مسارات. أنشئ مساراً جديداً لترتيب السكتورات.</p>}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceSettingsDialog;
