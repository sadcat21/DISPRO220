import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Upload, CheckCircle, Loader2, X, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SharedFile {
  name: string;
  type: string;
  size: number;
  file: File;
}

const ShareTarget: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, workerId } = useAuth();
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [sharedText, setSharedText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const processSharedData = async () => {
      try {
        // Check if there's cached share data from the service worker
        if ('caches' in window) {
          const cache = await caches.open('share-target');
          const requests = await cache.keys();
          
          for (const request of requests) {
            const response = await cache.match(request);
            if (response) {
              const formData = await response.formData();
              
              const title = formData.get('title') as string;
              const text = formData.get('text') as string;
              const url = formData.get('url') as string;
              
              if (title || text || url) {
                setSharedText([title, text, url].filter(Boolean).join('\n'));
              }

              const files = formData.getAll('files') as File[];
              if (files.length > 0) {
                const processedFiles: SharedFile[] = files.map(f => ({
                  name: f.name,
                  type: f.type,
                  size: f.size,
                  file: f,
                }));
                setSharedFiles(processedFiles);
              }

              // Clean up cache
              await cache.delete(request);
            }
          }
        }
      } catch (error) {
        console.error('Error processing shared data:', error);
      } finally {
        setIsProcessing(false);
      }
    };

    processSharedData();
  }, []);

  const handleUpload = async () => {
    if (!isAuthenticated || !workerId) {
      toast.error('يجب تسجيل الدخول أولاً');
      navigate('/login');
      return;
    }

    if (sharedFiles.length === 0) {
      toast.error('لا توجد ملفات للرفع');
      return;
    }

    setIsUploading(true);
    try {
      for (const sharedFile of sharedFiles) {
        const fileName = `${workerId}/${Date.now()}_${sharedFile.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('shared-invoices')
          .upload(fileName, sharedFile.file, {
            contentType: sharedFile.type,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error(`فشل رفع الملف: ${sharedFile.name}`);
          continue;
        }
      }

      setUploadComplete(true);
      toast.success(`تم رفع ${sharedFiles.length} ملف بنجاح`);
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error('حدث خطأ أثناء رفع الملفات');
    } finally {
      setIsUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">جاري معالجة الملفات المشاركة...</p>
        </div>
      </div>
    );
  }

  if (sharedFiles.length === 0 && !sharedText) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-6 space-y-4">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">لم يتم استقبال أي ملفات.</p>
            <p className="text-xs text-muted-foreground">شارك ملف PDF من واتساب أو أي تطبيق آخر ليظهر هنا.</p>
            <Button onClick={() => navigate('/')} className="w-full gap-2">
              <ArrowRight className="w-4 h-4" />
              العودة للرئيسية
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4" dir="rtl">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                ملفات مستلمة
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sharedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <FileText className="w-8 h-8 text-destructive shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(f.size)} • {f.type || 'غير معروف'}</p>
                </div>
              </div>
            ))}

            {sharedText && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">نص مشارك:</p>
                <p className="text-sm whitespace-pre-wrap">{sharedText}</p>
              </div>
            )}

            {uploadComplete ? (
              <div className="text-center space-y-3 py-2">
                <CheckCircle className="w-10 h-10 text-primary mx-auto" />
                <p className="text-sm font-medium text-primary">تم الرفع بنجاح!</p>
                <Button onClick={() => navigate('/manager-treasury')} className="w-full gap-2">
                  <ArrowRight className="w-4 h-4" />
                  الذهاب للخزينة
                </Button>
              </div>
            ) : (
              <Button onClick={handleUpload} disabled={isUploading} className="w-full gap-2">
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الرفع...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    رفع الملفات ({sharedFiles.length})
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ShareTarget;
