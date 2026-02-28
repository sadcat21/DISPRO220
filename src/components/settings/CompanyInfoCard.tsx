import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Building2, Loader2, Save, Upload, X, Image } from 'lucide-react';
import { useCompanyInfo, CompanyInfo } from '@/hooks/useCompanyInfo';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CompanyInfoCard: React.FC = () => {
  const { companyInfo, isLoading, saveCompanyInfo, isSaving } = useCompanyInfo();
  const [form, setForm] = useState<CompanyInfo>(companyInfo);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(companyInfo);
  }, [companyInfo]);

  const handleChange = (key: keyof CompanyInfo, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleImageUpload = async (file: File, type: 'logo' | 'icon') => {
    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingIcon;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `company/${type}_${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      const key = type === 'logo' ? 'company_logo' : 'company_icon';
      setForm(prev => ({ ...prev, [key]: publicUrl }));
      toast.success(type === 'logo' ? 'تم رفع اللوجو' : 'تم رفع الأيقونة');
    } catch (err) {
      toast.error('فشل رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const fields: { key: keyof CompanyInfo; label: string; placeholder: string }[] = [
    { key: 'company_name', label: 'اسم الشركة', placeholder: 'مثال: SARL LASER FOOD' },
    { key: 'company_activity', label: 'النشاط التجاري', placeholder: 'مثال: Commerce de gros' },
    { key: 'company_address', label: 'العنوان', placeholder: 'العنوان الكامل' },
    { key: 'company_phone', label: 'الهاتف الثابت', placeholder: 'رقم الهاتف' },
    { key: 'company_mobile', label: 'الهاتف النقال', placeholder: 'رقم الهاتف النقال' },
    { key: 'company_rc', label: 'السجل التجاري (RC)', placeholder: 'مثال: 19B1123057-00/31' },
    { key: 'company_nif', label: 'الرقم الجبائي (NIF)', placeholder: 'مثال: 001931112305729' },
    { key: 'company_ai', label: 'المادة الضريبية (AI)', placeholder: 'مثال: 31034409244' },
    { key: 'company_nis', label: 'رقم التعريف الإحصائي (NIS)', placeholder: 'مثال: 001931030056846' },
    { key: 'company_bank', label: 'البنك', placeholder: 'مثال: BNA' },
    { key: 'company_rib', label: 'رقم الحساب البنكي (RIB)', placeholder: 'مثال: 00100957030000149786' },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="w-5 h-5" />
          معلومات الشركة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Logo & Icon uploads */}
        <div className="grid grid-cols-2 gap-3">
          {/* Logo */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">لوجو الشركة</Label>
            <div className="border border-border rounded-lg p-2 flex flex-col items-center gap-2 bg-muted/30">
              {form.company_logo ? (
                <div className="relative w-full">
                  <img src={form.company_logo} alt="لوجو" className="w-full h-20 object-contain rounded" />
                  <button
                    type="button"
                    onClick={() => handleChange('company_logo', '')}
                    className="absolute top-0 end-0 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-full h-20 flex items-center justify-center text-muted-foreground">
                  <Image className="w-8 h-8" />
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'logo');
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                {uploadingLogo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 me-1" />}
                رفع اللوجو
              </Button>
            </div>
          </div>

          {/* Icon */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">أيقونة الشركة</Label>
            <div className="border border-border rounded-lg p-2 flex flex-col items-center gap-2 bg-muted/30">
              {form.company_icon ? (
                <div className="relative w-full">
                  <img src={form.company_icon} alt="أيقونة" className="w-full h-20 object-contain rounded" />
                  <button
                    type="button"
                    onClick={() => handleChange('company_icon', '')}
                    className="absolute top-0 end-0 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-full h-20 flex items-center justify-center text-muted-foreground">
                  <Image className="w-8 h-8" />
                </div>
              )}
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'icon');
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => iconInputRef.current?.click()}
                disabled={uploadingIcon}
              >
                {uploadingIcon ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 me-1" />}
                رفع الأيقونة
              </Button>
            </div>
          </div>
        </div>

        {fields.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Input
              value={form[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={placeholder}
              className="h-9 text-sm"
              dir="auto"
            />
          </div>
        ))}
        <Button
          className="w-full mt-2"
          onClick={() => saveCompanyInfo(form)}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 ms-2" />}
          حفظ معلومات الشركة
        </Button>
      </CardContent>
    </Card>
  );
};

export default CompanyInfoCard;
