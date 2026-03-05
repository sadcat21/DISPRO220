import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, FlaskConical, Copy, Trash2, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/database';

interface TestWorker {
  id: string;
  username: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  is_test: boolean;
  branch_id: string | null;
}

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'مدير النظام',
  branch_admin: 'مدير فرع',
  supervisor: 'مشرف',
  worker: 'عامل',
};

const TestWorkersTab: React.FC = () => {
  const { t } = useLanguage();
  const { activeBranch } = useAuth();
  const [testWorkers, setTestWorkers] = useState<TestWorker[]>([]);
  const [realWorkers, setRealWorkers] = useState<TestWorker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteWorker, setDeleteWorker] = useState<TestWorker | null>(null);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      const [testRes, realRes] = await Promise.all([
        supabase.from('workers').select('id, username, full_name, role, is_active, is_test, branch_id').eq('is_test', true).order('full_name'),
        supabase.from('workers').select('id, username, full_name, role, is_active, is_test, branch_id').eq('is_test', false).eq('is_active', true).order('full_name'),
      ]);
      setTestWorkers((testRes.data || []) as TestWorker[]);
      setRealWorkers((realRes.data || []) as TestWorker[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateTestWorkers = async () => {
    setIsGenerating(true);
    try {
      // Get real workers that don't already have test counterparts
      const existingTestUsernames = testWorkers.map(tw => tw.username.replace('test_', ''));
      const workersToClone = realWorkers.filter(w => !existingTestUsernames.includes(w.username));

      if (workersToClone.length === 0) {
        toast.info('جميع العمال لديهم نسخ تجريبية بالفعل');
        setIsGenerating(false);
        return;
      }

      const newTestWorkers = workersToClone.map(w => ({
        username: `test_${w.username}`,
        full_name: `Test ${w.full_name}`,
        role: w.role,
        branch_id: w.branch_id,
        is_active: true,
        is_test: true,
        password_hash: btoa(`test_${w.username}`), // password = username
      }));

      const { error } = await supabase.from('workers').insert(newTestWorkers);
      if (error) throw error;

      // Also create worker_roles for test workers
      const { data: insertedWorkers } = await supabase
        .from('workers')
        .select('id, username, role, branch_id')
        .eq('is_test', true)
        .in('username', newTestWorkers.map(w => w.username));

      if (insertedWorkers && insertedWorkers.length > 0) {
        const rolesToInsert = insertedWorkers.map(w => ({
          worker_id: w.id,
          role: w.role as AppRole,
          branch_id: w.branch_id,
        }));
        await supabase.from('worker_roles').insert(rolesToInsert);
      }

      toast.success(`تم إنشاء ${newTestWorkers.length} عامل تجريبي`);
      fetchWorkers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'فشل في إنشاء العمال التجريبيين');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTestWorkerStatus = async (worker: TestWorker) => {
    const { error } = await supabase
      .from('workers')
      .update({ is_active: !worker.is_active })
      .eq('id', worker.id);
    if (error) {
      toast.error('فشل في تحديث الحالة');
      return;
    }
    setTestWorkers(prev => prev.map(w => w.id === worker.id ? { ...w, is_active: !w.is_active } : w));
  };

  const handleDeleteTestWorker = async (worker: TestWorker) => {
    try {
      await supabase.from('worker_roles').delete().eq('worker_id', worker.id);
      const { error } = await supabase.from('workers').delete().eq('id', worker.id);
      if (error) throw error;
      toast.success(`تم حذف ${worker.full_name}`);
      setTestWorkers(prev => prev.filter(w => w.id !== worker.id));
    } catch (err: any) {
      toast.error(err.message || 'فشل في الحذف');
    }
  };

  const deleteAllTestWorkers = async () => {
    try {
      const ids = testWorkers.map(w => w.id);
      if (ids.length === 0) return;
      await supabase.from('worker_roles').delete().in('worker_id', ids);
      const { error } = await supabase.from('workers').delete().in('id', ids);
      if (error) throw error;
      toast.success('تم حذف جميع العمال التجريبيين');
      setTestWorkers([]);
    } catch (err: any) {
      toast.error(err.message || 'فشل في الحذف');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={generateTestWorkers} disabled={isGenerating} size="sm">
          {isGenerating ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Copy className="w-4 h-4 ml-2" />}
          نسخ العمال الحقيقيين تلقائياً
        </Button>
        {testWorkers.length > 0 && (
          <Button variant="destructive" size="sm" onClick={deleteAllTestWorkers}>
            <Trash2 className="w-4 h-4 ml-2" />
            حذف الكل
          </Button>
        )}
      </div>

      {/* Info */}
      <Card className="bg-secondary">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <FlaskConical className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">عمال تجريبيون</p>
            <p className="text-2xl font-bold">{testWorkers.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Info text */}
      <p className="text-xs text-muted-foreground">
        🔑 كلمة السر لكل عامل تجريبي = اسم المستخدم (مثال: test_zinou27 / test_zinou27)
      </p>

      {/* List */}
      <div className="space-y-3">
        {testWorkers.map((worker) => (
          <Card key={worker.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{worker.full_name}</p>
                  <p className="text-sm text-muted-foreground">@{worker.username}</p>
                  <Badge variant="secondary" className="mt-2">
                    <Shield className="w-3 h-3 ml-1" />
                    {ROLE_LABELS[worker.role]}
                  </Badge>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${worker.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {worker.is_active ? t('common.active') : t('common.inactive')}
                  </span>
                  <Switch
                    checked={worker.is_active}
                    onCheckedChange={() => toggleTestWorkerStatus(worker)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/30"
                    onClick={() => setDeleteWorker(worker)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {testWorkers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>لا يوجد عمال تجريبيون</p>
            <p className="text-xs mt-1">اضغط "نسخ العمال الحقيقيين" لإنشائهم تلقائياً</p>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteWorker} onOpenChange={() => setDeleteWorker(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف العامل التجريبي</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف "{deleteWorker?.full_name}"؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteWorker) handleDeleteTestWorker(deleteWorker); setDeleteWorker(null); }}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TestWorkersTab;
