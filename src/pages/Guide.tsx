import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { 
  BookOpen, 
  Users, 
  ShoppingCart, 
  Package, 
  BarChart3, 
  Truck, 
  Gift, 
  Shield, 
  Building2,
  UserCheck,
  Settings,
  Tag,
  Layers,
  MapPin,
  FileSpreadsheet
} from 'lucide-react';

const Guide: React.FC = () => {
  const roleGuides = [
    {
      role: 'admin',
      title: 'مدير النظام',
      badge: 'Admin',
      badgeColor: 'bg-red-500',
      icon: Shield,
      description: 'الوصول الكامل لجميع ميزات النظام وإدارة الفروع والمستخدمين',
      features: [
        { icon: Building2, title: 'إدارة الفروع', desc: 'إنشاء وتعديل الفروع وتعيين مديريها' },
        { icon: Users, title: 'إدارة العمال', desc: 'إضافة وتعديل حسابات العمال وتحديد صلاحياتهم' },
        { icon: Package, title: 'إدارة المنتجات', desc: 'إضافة المنتجات وتحديد أسعارها ومجموعات التسعير' },
        { icon: UserCheck, title: 'إدارة العملاء', desc: 'إضافة العملاء وتحديد شارة الثقة والأسعار الخاصة' },
        { icon: BarChart3, title: 'الإحصائيات', desc: 'عرض إحصائيات المبيعات والعروض لجميع الفروع' },
        { icon: Settings, title: 'الإعدادات', desc: 'ضبط إعدادات النظام مثل سعر الطابع الجبائي' },
      ]
    },
    {
      role: 'branch_admin',
      title: 'مدير الفرع',
      badge: 'Branch Admin',
      badgeColor: 'bg-blue-500',
      icon: Building2,
      description: 'إدارة فرع محدد وعماله وعملائه',
      features: [
        { icon: Users, title: 'إدارة عمال الفرع', desc: 'إضافة وتعديل حسابات عمال الفرع فقط' },
        { icon: UserCheck, title: 'إدارة عملاء الفرع', desc: 'إدارة عملاء الفرع وتحديد شارة الثقة' },
        { icon: ShoppingCart, title: 'متابعة الطلبيات', desc: 'مراقبة وإدارة طلبيات الفرع' },
        { icon: BarChart3, title: 'إحصائيات الفرع', desc: 'عرض إحصائيات مبيعات وعروض الفرع' },
      ]
    },
    {
      role: 'supervisor',
      title: 'المشرف',
      badge: 'Supervisor',
      badgeColor: 'bg-purple-500',
      icon: Users,
      description: 'مراقبة العمليات والإحصائيات دون صلاحيات التعديل',
      features: [
        { icon: FileSpreadsheet, title: 'جدول العروض', desc: 'عرض جميع العروض المسجلة' },
        { icon: ShoppingCart, title: 'متابعة الطلبيات', desc: 'مراقبة جميع الطلبيات' },
        { icon: BarChart3, title: 'الإحصائيات', desc: 'عرض إحصائيات شاملة' },
        { icon: MapPin, title: 'البحث عن المحلات', desc: 'البحث عن العملاء القريبين على الخريطة' },
      ]
    },
    {
      role: 'worker',
      title: 'العامل',
      badge: 'Worker',
      badgeColor: 'bg-green-500',
      icon: UserCheck,
      description: 'تنفيذ المهام اليومية حسب الدور الوظيفي',
      subRoles: [
        {
          title: 'مندوب مبيعات',
          features: [
            { icon: ShoppingCart, title: 'إنشاء الطلبيات', desc: 'جمع طلبيات العملاء وإدخالها في النظام' },
            { icon: UserCheck, title: 'إضافة العملاء', desc: 'تسجيل عملاء جدد أثناء الجولة' },
          ]
        },
        {
          title: 'مندوب توصيل',
          features: [
            { icon: Truck, title: 'طلبياتي', desc: 'عرض الطلبيات المسندة للتوصيل' },
            { icon: MapPin, title: 'مواقع العملاء', desc: 'عرض مواقع العملاء على الخريطة' },
          ]
        },
        {
          title: 'مسؤول البرومو',
          features: [
            { icon: Gift, title: 'تسجيل العروض', desc: 'تسجيل عروض البرومو للعملاء' },
            { icon: FileSpreadsheet, title: 'عروضي', desc: 'عرض العروض المسجلة' },
          ]
        },
      ]
    },
  ];

  const pricingGuides = [
    {
      icon: Tag,
      title: 'الأسعار الخاصة بالعملاء',
      description: 'يمكن تخصيص سعر خاص لكل عميل على منتج معين. يتم تطبيق السعر الخاص تلقائياً عند إنشاء الطلبية.',
      steps: [
        'افتح صفحة العملاء',
        'اضغط على زر "الأسعار الخاصة" بجانب العميل',
        'أضف المنتج والسعر الخاص أو نسبة الخصم',
      ]
    },
    {
      icon: Layers,
      title: 'شرائح الأسعار بالكمية',
      description: 'تحديد أسعار تفضيلية عند شراء كميات معينة من المنتج.',
      steps: [
        'افتح صفحة المنتجات',
        'اضغط على زر "شرائح الكمية" بجانب المنتج',
        'حدد الحد الأدنى والأقصى للكمية والسعر',
      ]
    },
    {
      icon: Users,
      title: 'مجموعات التسعير',
      description: 'تجميع منتجات متعددة بنفس التسعير لتحديث أسعارها دفعة واحدة.',
      steps: [
        'افتح صفحة المنتجات ثم تبويبة "مجموعات التسعير"',
        'أنشئ مجموعة جديدة وأضف المنتجات إليها',
        'عند تعديل سعر أي منتج من المجموعة، يمكنك اختيار تحديث المجموعة كاملة',
      ]
    },
  ];

  const trustBadgeGuide = {
    icon: Shield,
    title: 'شارة الثقة (البيع بالدين)',
    description: 'تحديد العملاء الموثوقين للتعامل معهم بالبيع بالدين.',
    steps: [
      'افتح صفحة العملاء',
      'فعّل خيار "موثوق" لتفعيل شارة الثقة',
      'أضف ملاحظات حول حالة الثقة إذا لزم الأمر',
    ]
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2">دليل الاستخدام</h1>
        <p className="text-muted-foreground">
          تعرف على كيفية استخدام النظام حسب صلاحياتك ودورك الوظيفي
        </p>
      </div>

      {/* Roles Guide */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" />
          الأدوار والصلاحيات
        </h2>
        
        <Accordion type="single" collapsible className="space-y-3">
          {roleGuides.map((guide, index) => (
            <AccordionItem key={guide.role} value={guide.role} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${guide.badgeColor}/10`}>
                    <guide.icon className={`h-5 w-5 text-${guide.badgeColor.replace('bg-', '')}`} />
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{guide.title}</span>
                      <Badge variant="secondary" className={`${guide.badgeColor} text-white text-xs`}>
                        {guide.badge}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{guide.description}</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {guide.features && (
                  <div className="grid gap-3 py-3">
                    {guide.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <feature.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-medium">{feature.title}</h4>
                          <p className="text-sm text-muted-foreground">{feature.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {guide.subRoles && (
                  <div className="space-y-4 py-3">
                    {guide.subRoles.map((subRole, i) => (
                      <div key={i}>
                        <h4 className="font-medium text-primary mb-2">{subRole.title}</h4>
                        <div className="grid gap-2 pr-4">
                          {subRole.features.map((feature, j) => (
                            <div key={j} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30">
                              <feature.icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <div>
                                <span className="font-medium text-sm">{feature.title}</span>
                                <span className="text-sm text-muted-foreground"> - {feature.desc}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Pricing Guide */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Tag className="h-5 w-5" />
          نظام التسعير المتقدم
        </h2>
        
        <div className="grid gap-4">
          {pricingGuides.map((guide, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <guide.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{guide.title}</CardTitle>
                    <CardDescription>{guide.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm font-medium">الخطوات:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                    {guide.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Trust Badge */}
      <section className="mb-10">
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Shield className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-lg">{trustBadgeGuide.title}</CardTitle>
                <CardDescription>{trustBadgeGuide.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm font-medium">الخطوات:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                {trustBadgeGuide.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Quick Tips */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          نصائح سريعة
        </h2>
        
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <h4 className="font-medium mb-1">اختصار الطلبيات</h4>
            <p className="text-sm text-muted-foreground">
              يمكنك إنشاء طلبية جديدة مباشرة من صفحة العميل بالضغط على زر "طلبية جديدة"
            </p>
          </Card>
          <Card className="p-4">
            <h4 className="font-medium mb-1">تحديث الحالة</h4>
            <p className="text-sm text-muted-foreground">
              مندوب التوصيل يمكنه تحديث حالة الطلبية مباشرة من قائمة طلبياته
            </p>
          </Card>
          <Card className="p-4">
            <h4 className="font-medium mb-1">الطابع الجبائي</h4>
            <p className="text-sm text-muted-foreground">
              يتم إضافة سعر الطابع تلقائياً لطلبيات فاتورة 1 حسب الإعدادات
            </p>
          </Card>
          <Card className="p-4">
            <h4 className="font-medium mb-1">الموقع الجغرافي</h4>
            <p className="text-sm text-muted-foreground">
              يمكن تحديد موقع العميل على الخريطة لتسهيل عملية التوصيل
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Guide;
