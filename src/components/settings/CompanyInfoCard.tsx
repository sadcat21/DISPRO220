import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Building2, Loader2, Save } from 'lucide-react';
import { useCompanyInfo, CompanyInfo } from '@/hooks/useCompanyInfo';

const CompanyInfoCard: React.FC = () => {
  const { companyInfo, isLoading, saveCompanyInfo, isSaving } = useCompanyInfo();
  const [form, setForm] = useState<CompanyInfo>(companyInfo);

  useEffect(() => {
    setForm(companyInfo);
  }, [companyInfo]);

  const handleChange = (key: keyof CompanyInfo, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
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
