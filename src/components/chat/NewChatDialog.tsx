import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { User, Users, Search, MessageSquarePlus } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (type: 'direct' | 'group', participantIds: string[], name?: string) => void;
}

interface WorkerItem {
  id: string;
  full_name: string;
  username: string;
}

const NewChatDialog = ({ open, onClose, onCreate }: Props) => {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [tab, setTab] = useState<'direct' | 'group'>('direct');

  useEffect(() => {
    if (!open) return;
    const fetchWorkers = async () => {
      const { data } = await supabase
        .from('workers')
        .select('id, full_name, username')
        .eq('is_active', true)
        .neq('id', user?.id || '')
        .order('full_name');
      setWorkers(data || []);
    };
    fetchWorkers();
    setSelected([]);
    setGroupName('');
    setSearch('');
  }, [open, user?.id]);

  const filtered = workers.filter(w =>
    w.full_name.includes(search) || w.username.includes(search)
  );

  const handleCreate = () => {
    if (selected.length === 0) return;
    if (tab === 'direct') {
      onCreate('direct', [selected[0]]);
    } else {
      onCreate('group', selected, groupName || undefined);
    }
    onClose();
  };

  const toggleWorker = (id: string) => {
    if (tab === 'direct') {
      setSelected([id]);
      return;
    }
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>محادثة جديدة</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setSelected([]); }}>
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1 gap-1">
              <User className="h-4 w-4" /> فردية
            </TabsTrigger>
            <TabsTrigger value="group" className="flex-1 gap-1">
              <Users className="h-4 w-4" /> مجموعة
            </TabsTrigger>
          </TabsList>

          {tab === 'group' && (
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="اسم المجموعة (اختياري)"
              className="mt-2"
            />
          )}

          <div className="relative mt-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث عن مستخدم..."
              className="pr-9"
            />
          </div>

          <ScrollArea className="h-60 mt-2 border rounded-md">
            {filtered.map(w => (
              <button
                key={w.id}
                onClick={() => toggleWorker(w.id)}
                className={`w-full p-3 flex items-center gap-3 text-right hover:bg-accent/50 transition-colors border-b ${
                  selected.includes(w.id) ? 'bg-accent' : ''
                }`}
              >
                {tab === 'group' && (
                  <Checkbox checked={selected.includes(w.id)} className="shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{w.full_name}</p>
                  <p className="text-xs text-muted-foreground">@{w.username}</p>
                </div>
                {tab === 'direct' && selected.includes(w.id) && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </ScrollArea>
        </Tabs>

        <Button onClick={handleCreate} disabled={selected.length === 0} className="w-full gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          {tab === 'direct' ? 'بدء المحادثة' : `إنشاء مجموعة (${selected.length})`}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default NewChatDialog;
