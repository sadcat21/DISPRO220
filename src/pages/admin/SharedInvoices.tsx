import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Trash2, Download, Search, Loader2, FolderOpen, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { isAdminRole } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  metadata: Record<string, any> | null;
}

const SharedInvoices: React.FC = () => {
  const { workerId, role } = useAuth();
  const { t, dir } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isAdmin = isAdminRole(role);

  // List files from storage
  const { data: files, isLoading } = useQuery({
    queryKey: ['shared-invoices', workerId],
    queryFn: async () => {
      // Admin sees all folders, worker sees own folder
      if (isAdmin) {
        // List all worker folders
        const { data: folders, error: foldersErr } = await supabase.storage
          .from('shared-invoices')
          .list('', { limit: 100 });
        if (foldersErr) throw foldersErr;

        const allFiles: (StorageFile & { folder: string })[] = [];
        for (const folder of folders || []) {
          if (!folder.id && folder.name) {
            // It's a folder, list its contents
            const { data: folderFiles } = await supabase.storage
              .from('shared-invoices')
              .list(folder.name, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
            if (folderFiles) {
              for (const f of folderFiles) {
                if (f.id) {
                  allFiles.push({ ...f, folder: folder.name } as any);
                }
              }
            }
          }
        }
        return allFiles;
      } else {
        // Worker: list own folder
        const { data, error } = await supabase.storage
          .from('shared-invoices')
          .list(workerId || '', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
        if (error) throw error;
        return (data || []).filter(f => f.id).map(f => ({ ...f, folder: workerId || '' }));
      }
    },
    enabled: !!workerId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const { error } = await supabase.storage.from('shared-invoices').remove([filePath]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('تم حذف الملف');
      queryClient.invalidateQueries({ queryKey: ['shared-invoices'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('فشل حذف الملف'),
  });

  const handleDownload = async (folder: string, name: string) => {
    const { data } = supabase.storage.from('shared-invoices').getPublicUrl(`${folder}/${name}`);
    // Since bucket is private, create a signed URL
    const { data: signedData, error } = await supabase.storage
      .from('shared-invoices')
      .createSignedUrl(`${folder}/${name}`, 300);
    if (error || !signedData?.signedUrl) {
      toast.error('فشل تحميل الملف');
      return;
    }
    window.open(signedData.signedUrl, '_blank');
  };

  const handlePreview = async (folder: string, name: string) => {
    const { data, error } = await supabase.storage
      .from('shared-invoices')
      .createSignedUrl(`${folder}/${name}`, 300);
    if (error || !data?.signedUrl) {
      toast.error('فشل معاينة الملف');
      return;
    }
    try {
      const response = await fetch(data.signedUrl);
      const blob = await response.blob();
      // Revoke previous blob URL if any
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      toast.error('فشل تحميل الملف للمعاينة');
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ar-DZ', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return dateStr; }
  };

  const filtered = (files || []).filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 space-y-4" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <FolderOpen className="w-6 h-6 text-primary" />
        <h1 className="text-lg font-bold">الفواتير المشاركة</h1>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {filtered.length}
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالاسم..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      {/* Files List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">لا توجد فواتير مشاركة بعد</p>
            <p className="text-xs text-muted-foreground mt-1">شارك ملف PDF من واتساب ليظهر هنا</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <Card key={`${f.folder}/${f.name}`} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-destructive shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(f.metadata?.size || 0)} • {formatDate(f.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePreview(f.folder, f.name)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(f.folder, f.name)}>
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(`${f.folder}/${f.name}`)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الملف؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف هذا الملف نهائياً ولا يمكن استرجاعه.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)} className="bg-destructive text-destructive-foreground">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Dialog */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-2" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>
          <div className="bg-background rounded-lg w-full max-w-2xl flex flex-col" style={{ height: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b shrink-0">
              <span className="text-sm font-medium">معاينة الملف</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(previewUrl, '_blank')}>
                  <Download className="w-4 h-4 me-1" />
                  فتح
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>✕</Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <iframe src={previewUrl + '#toolbar=1&navpanes=0'} className="w-full h-full border-0" title="معاينة PDF" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedInvoices;
