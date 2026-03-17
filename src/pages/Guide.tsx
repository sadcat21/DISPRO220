import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  BookOpen, Users, ShoppingCart, Package, BarChart3, Truck, Gift, Shield,
  Building2, UserCheck, Settings, Tag, Layers, MapPin, FileSpreadsheet,
  Wallet, Warehouse, ClipboardList, Banknote, Calculator, Vault, FolderOpen,
  Scale, Trophy, CalendarDays, Navigation, Activity, Store, UserCog, Split,
  FileText, Globe, ChevronLeft, ChevronRight, ArrowRight
} from 'lucide-react';

type Lang = 'ar' | 'fr';

interface GuideStep {
  ar: string;
  fr: string;
}

interface GuideFeature {
  icon: React.ElementType;
  title: { ar: string; fr: string };
  description: { ar: string; fr: string };
  steps: GuideStep[];
  tips?: GuideStep[];
}

interface GuideSection {
  id: string;
  icon: React.ElementType;
  title: { ar: string; fr: string };
  features: GuideFeature[];
}

const guideSections: GuideSection[] = [
  {
    id: 'branches',
    icon: Building2,
    title: { ar: 'إدارة الفروع', fr: 'Gestion des succursales' },
    features: [
      {
        icon: Building2,
        title: { ar: 'إنشاء فرع جديد', fr: 'Créer une nouvelle succursale' },
        description: {
          ar: 'يمكنك إنشاء فروع متعددة للشركة وتعيين مدير لكل فرع مع تحديد الولاية والعنوان.',
          fr: 'Vous pouvez créer plusieurs succursales pour l\'entreprise et assigner un directeur à chaque succursale avec la wilaya et l\'adresse.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← الفروع', fr: 'Allez dans Menu → Succursales' },
          { ar: 'اضغط على زر "إضافة فرع"', fr: 'Cliquez sur le bouton "Ajouter une succursale"' },
          { ar: 'أدخل اسم الفرع والولاية والعنوان', fr: 'Entrez le nom, la wilaya et l\'adresse' },
          { ar: 'اختر مدير الفرع من القائمة', fr: 'Choisissez le directeur de la succursale' },
          { ar: 'اضغط "حفظ" لإنشاء الفرع', fr: 'Cliquez "Enregistrer" pour créer la succursale' },
        ],
      },
      {
        icon: Users,
        title: { ar: 'تبديل بين الفروع', fr: 'Basculer entre les succursales' },
        description: {
          ar: 'مدير النظام يمكنه التبديل بين جميع الفروع لرؤية بيانات كل فرع على حدة أو عرض بيانات جميع الفروع.',
          fr: 'L\'administrateur peut basculer entre toutes les succursales pour voir les données de chaque succursale ou afficher toutes les données.',
        },
        steps: [
          { ar: 'اضغط على اسم الفرع في أعلى الشاشة', fr: 'Cliquez sur le nom de la succursale en haut de l\'écran' },
          { ar: 'اختر "كل الفروع" لعرض البيانات الإجمالية', fr: 'Choisissez "Toutes les succursales" pour les données globales' },
          { ar: 'أو اختر فرع محدد لعرض بياناته فقط', fr: 'Ou choisissez une succursale spécifique' },
        ],
      },
    ],
  },
  {
    id: 'workers',
    icon: Users,
    title: { ar: 'إدارة العمال', fr: 'Gestion des employés' },
    features: [
      {
        icon: Users,
        title: { ar: 'إضافة عامل جديد', fr: 'Ajouter un nouvel employé' },
        description: {
          ar: 'إنشاء حسابات للعمال مع تحديد الدور (مدير فرع، مشرف، عامل) والدور الوظيفي (مندوب مبيعات، مندوب توصيل، مسؤول مستودع).',
          fr: 'Créer des comptes employés avec le rôle (admin branche, superviseur, employé) et la fonction (commercial, livreur, responsable entrepôt).',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← العمال', fr: 'Allez dans Menu → Employés' },
          { ar: 'اضغط على زر "إضافة عامل"', fr: 'Cliquez sur "Ajouter un employé"' },
          { ar: 'أدخل الاسم الكامل واسم المستخدم وكلمة المرور', fr: 'Entrez le nom complet, nom d\'utilisateur et mot de passe' },
          { ar: 'اختر الدور: عامل / مدير فرع / مشرف', fr: 'Choisissez le rôle: employé / admin branche / superviseur' },
          { ar: 'اختر الدور الوظيفي: مندوب مبيعات / مندوب توصيل / مسؤول مستودع', fr: 'Choisissez la fonction: commercial / livreur / responsable entrepôt' },
          { ar: 'حدد الفرع التابع له العامل', fr: 'Sélectionnez la succursale de l\'employé' },
        ],
        tips: [
          { ar: 'يمكنك إنشاء عمال تجريبيين لاختبار النظام دون التأثير على البيانات الحقيقية', fr: 'Vous pouvez créer des employés de test pour tester sans affecter les données réelles' },
        ],
      },
      {
        icon: Shield,
        title: { ar: 'إدارة الصلاحيات', fr: 'Gestion des permissions' },
        description: {
          ar: 'تحكم دقيق في صلاحيات كل عامل: ما يمكنه رؤيته وما يمكنه فعله.',
          fr: 'Contrôle précis des permissions de chaque employé: ce qu\'il peut voir et faire.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← الصلاحيات', fr: 'Allez dans Menu → Permissions' },
          { ar: 'اختر العامل المراد تعديل صلاحياته', fr: 'Sélectionnez l\'employé à modifier' },
          { ar: 'فعّل أو عطّل الصلاحيات المطلوبة (إنشاء طلبيات، حذف، تعديل أسعار...)', fr: 'Activez ou désactivez les permissions (créer commandes, supprimer, modifier prix...)' },
          { ar: 'يمكنك أيضاً إخفاء صفحات أو تبويبات من واجهة العامل', fr: 'Vous pouvez aussi masquer des pages ou onglets de l\'interface' },
        ],
      },
      {
        icon: MapPin,
        title: { ar: 'تتبع العمال', fr: 'Suivi des employés' },
        description: {
          ar: 'مراقبة مواقع العمال في الوقت الفعلي على الخريطة لمتابعة تحركاتهم الميدانية.',
          fr: 'Surveiller les positions des employés en temps réel sur la carte.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← تتبع العمال', fr: 'Allez dans Menu → Suivi des employés' },
          { ar: 'سترى مواقع جميع العمال النشطين على الخريطة', fr: 'Vous verrez les positions de tous les employés actifs sur la carte' },
          { ar: 'اضغط على أيقونة عامل لعرض تفاصيله', fr: 'Cliquez sur l\'icône d\'un employé pour ses détails' },
        ],
      },
    ],
  },
  {
    id: 'products',
    icon: Package,
    title: { ar: 'إدارة المنتجات', fr: 'Gestion des produits' },
    features: [
      {
        icon: Package,
        title: { ar: 'إضافة وتعديل المنتجات', fr: 'Ajouter et modifier les produits' },
        description: {
          ar: 'إدارة كاملة للمنتجات: الاسم، الفئة، السعر، الصورة، والحالة (نشط/غير نشط).',
          fr: 'Gestion complète des produits: nom, catégorie, prix, image et statut (actif/inactif).',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← المنتجات', fr: 'Allez dans Menu → Produits' },
          { ar: 'اضغط "إضافة منتج" لمنتج جديد أو اضغط على منتج لتعديله', fr: 'Cliquez "Ajouter" pour un nouveau ou cliquez sur un produit pour le modifier' },
          { ar: 'أدخل اسم المنتج بالعربية والفرنسية', fr: 'Entrez le nom du produit en arabe et en français' },
          { ar: 'حدد الفئة والسعر والنوع الفرعي للتسعير', fr: 'Définissez la catégorie, le prix et le sous-type de tarification' },
        ],
      },
      {
        icon: Layers,
        title: { ar: 'مجموعات التسعير', fr: 'Groupes de tarification' },
        description: {
          ar: 'تجميع منتجات متعددة بنفس التسعير لتحديث أسعارها دفعة واحدة.',
          fr: 'Regrouper plusieurs produits avec la même tarification pour les mettre à jour en lot.',
        },
        steps: [
          { ar: 'اذهب إلى المنتجات ← تبويبة "مجموعات التسعير"', fr: 'Allez dans Produits → onglet "Groupes de tarification"' },
          { ar: 'أنشئ مجموعة جديدة', fr: 'Créez un nouveau groupe' },
          { ar: 'أضف المنتجات المطلوبة للمجموعة', fr: 'Ajoutez les produits souhaités au groupe' },
          { ar: 'عند تعديل سعر منتج من المجموعة، يمكنك تطبيق التغيير على كامل المجموعة', fr: 'Lors de la modification du prix, vous pouvez appliquer le changement à tout le groupe' },
        ],
      },
      {
        icon: Tag,
        title: { ar: 'شرائح الأسعار بالكمية', fr: 'Paliers de prix par quantité' },
        description: {
          ar: 'تحديد أسعار تفضيلية تلقائية عند شراء كميات محددة.',
          fr: 'Définir des prix préférentiels automatiques pour des quantités spécifiques.',
        },
        steps: [
          { ar: 'افتح صفحة المنتجات', fr: 'Ouvrez la page Produits' },
          { ar: 'اضغط على زر "شرائح الكمية" بجانب المنتج', fr: 'Cliquez sur "Paliers de quantité" à côté du produit' },
          { ar: 'حدد الحد الأدنى والأقصى للكمية والسعر المقابل', fr: 'Définissez la quantité min/max et le prix correspondant' },
        ],
      },
      {
        icon: Gift,
        title: { ar: 'العروض الترويجية', fr: 'Offres promotionnelles' },
        description: {
          ar: 'إنشاء عروض ترويجية على المنتجات مع تحديد شروط الاستفادة.',
          fr: 'Créer des offres promotionnelles avec des conditions d\'éligibilité.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← العروض الترويجية', fr: 'Allez dans Menu → Offres promotionnelles' },
          { ar: 'اضغط "إضافة عرض"', fr: 'Cliquez "Ajouter une offre"' },
          { ar: 'حدد المنتج وشروط العرض (شراء X والحصول على Y)', fr: 'Définissez le produit et les conditions (acheter X, obtenir Y)' },
          { ar: 'حدد تاريخ البداية والنهاية', fr: 'Définissez les dates de début et de fin' },
        ],
      },
    ],
  },
  {
    id: 'customers',
    icon: UserCheck,
    title: { ar: 'إدارة العملاء', fr: 'Gestion des clients' },
    features: [
      {
        icon: UserCheck,
        title: { ar: 'إضافة وتعديل العملاء', fr: 'Ajouter et modifier les clients' },
        description: {
          ar: 'إدارة بيانات العملاء: الاسم، الهاتف، العنوان، الولاية، نوع العميل، والموقع الجغرافي.',
          fr: 'Gérer les données clients: nom, téléphone, adresse, wilaya, type et géolocalisation.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← العملاء', fr: 'Allez dans Menu → Clients' },
          { ar: 'اضغط "إضافة عميل" أو اختر عميل للتعديل', fr: 'Cliquez "Ajouter" ou sélectionnez un client à modifier' },
          { ar: 'أدخل البيانات المطلوبة', fr: 'Entrez les données requises' },
          { ar: 'حدد القطاع التابع له العميل', fr: 'Définissez le secteur du client' },
          { ar: 'حدد موقعه على الخريطة (اختياري)', fr: 'Définissez sa position sur la carte (optionnel)' },
        ],
      },
      {
        icon: Shield,
        title: { ar: 'شارة الثقة (البيع بالدين)', fr: 'Badge de confiance (vente à crédit)' },
        description: {
          ar: 'تحديد العملاء الموثوقين الذين يمكن البيع لهم بالدين.',
          fr: 'Identifier les clients fiables qui peuvent acheter à crédit.',
        },
        steps: [
          { ar: 'افتح ملف العميل', fr: 'Ouvrez le profil du client' },
          { ar: 'فعّل خيار "موثوق"', fr: 'Activez l\'option "Fiable"' },
          { ar: 'أضف ملاحظات الثقة إن لزم', fr: 'Ajoutez des notes de confiance si nécessaire' },
        ],
        tips: [
          { ar: 'فقط العملاء الموثوقون يمكن البيع لهم بالدين عند إنشاء الطلبيات', fr: 'Seuls les clients fiables peuvent acheter à crédit lors de la création de commandes' },
        ],
      },
      {
        icon: Tag,
        title: { ar: 'الأسعار الخاصة بالعملاء', fr: 'Prix spéciaux par client' },
        description: {
          ar: 'تخصيص سعر خاص لمنتج محدد لعميل معين. يُطبق تلقائياً عند إنشاء الطلبية.',
          fr: 'Attribuer un prix spécial pour un produit spécifique à un client. Appliqué automatiquement.',
        },
        steps: [
          { ar: 'افتح ملف العميل', fr: 'Ouvrez le profil du client' },
          { ar: 'اضغط "الأسعار الخاصة"', fr: 'Cliquez "Prix spéciaux"' },
          { ar: 'أضف المنتج وحدد السعر الخاص أو نسبة الخصم', fr: 'Ajoutez le produit et définissez le prix spécial ou le pourcentage de remise' },
        ],
      },
    ],
  },
  {
    id: 'orders',
    icon: ShoppingCart,
    title: { ar: 'الطلبيات والمبيعات', fr: 'Commandes et ventes' },
    features: [
      {
        icon: ShoppingCart,
        title: { ar: 'إنشاء طلبية جديدة', fr: 'Créer une nouvelle commande' },
        description: {
          ar: 'إنشاء طلبيات للعملاء مع اختيار المنتجات والكميات وطريقة الدفع.',
          fr: 'Créer des commandes clients avec sélection de produits, quantités et mode de paiement.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← الطلبيات', fr: 'Allez dans Menu → Commandes' },
          { ar: 'اضغط "طلبية جديدة"', fr: 'Cliquez "Nouvelle commande"' },
          { ar: 'اختر العميل من القائمة', fr: 'Sélectionnez le client' },
          { ar: 'أضف المنتجات والكميات', fr: 'Ajoutez les produits et quantités' },
          { ar: 'اختر طريقة الدفع (نقدي، شيك، بالدين...)', fr: 'Choisissez le mode de paiement (espèces, chèque, crédit...)' },
          { ar: 'اضغط "حفظ" لتأكيد الطلبية', fr: 'Cliquez "Enregistrer" pour confirmer' },
        ],
      },
      {
        icon: Truck,
        title: { ar: 'إسناد الطلبيات لمندوب التوصيل', fr: 'Assigner les commandes au livreur' },
        description: {
          ar: 'توزيع الطلبيات على مندوبي التوصيل لتسليمها للعملاء.',
          fr: 'Distribuer les commandes aux livreurs pour livraison.',
        },
        steps: [
          { ar: 'افتح الطلبية', fr: 'Ouvrez la commande' },
          { ar: 'اضغط "إسناد لعامل"', fr: 'Cliquez "Assigner à un employé"' },
          { ar: 'اختر مندوب التوصيل', fr: 'Sélectionnez le livreur' },
          { ar: 'سيظهر الطلب في قائمة طلبيات مندوب التوصيل', fr: 'La commande apparaîtra dans la liste du livreur' },
        ],
      },
      {
        icon: FileText,
        title: { ar: 'الإيصالات اليومية', fr: 'Reçus journaliers' },
        description: {
          ar: 'عرض ملخص المبيعات اليومية مع تفاصيل الدفع وإمكانية الطباعة.',
          fr: 'Afficher le résumé des ventes journalières avec détails de paiement et impression.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← الإيصالات اليومية', fr: 'Allez dans Menu → Reçus journaliers' },
          { ar: 'اختر التاريخ والعامل', fr: 'Sélectionnez la date et l\'employé' },
          { ar: 'اعرض تفاصيل المبيعات حسب طريقة الدفع', fr: 'Consultez les détails par mode de paiement' },
        ],
      },
    ],
  },
  {
    id: 'stock',
    icon: Warehouse,
    title: { ar: 'المخزون والتحميل', fr: 'Stock et chargement' },
    features: [
      {
        icon: Warehouse,
        title: { ar: 'مخزون المستودع', fr: 'Stock de l\'entrepôt' },
        description: {
          ar: 'متابعة كميات المنتجات في المستودع الرئيسي مع التنبيهات عند انخفاض المخزون.',
          fr: 'Suivi des quantités en entrepôt principal avec alertes de stock bas.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← مخزون المستودع', fr: 'Allez dans Menu → Stock entrepôt' },
          { ar: 'اعرض الكميات الحالية لكل منتج', fr: 'Consultez les quantités actuelles par produit' },
          { ar: 'استخدم البحث للعثور على منتج محدد', fr: 'Utilisez la recherche pour trouver un produit' },
        ],
      },
      {
        icon: Truck,
        title: { ar: 'تحميل البضاعة للعامل', fr: 'Chargement de marchandise' },
        description: {
          ar: 'تحميل المنتجات من المستودع إلى شاحنة العامل مع توثيق الكميات.',
          fr: 'Charger les produits de l\'entrepôt vers le véhicule de l\'employé.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← تحميل البضاعة', fr: 'Allez dans Menu → Chargement' },
          { ar: 'اختر العامل المراد تحميله', fr: 'Sélectionnez l\'employé à charger' },
          { ar: 'حدد المنتجات والكميات', fr: 'Définissez les produits et quantités' },
          { ar: 'اضغط "تأكيد التحميل"', fr: 'Cliquez "Confirmer le chargement"' },
        ],
      },
      {
        icon: ClipboardList,
        title: { ar: 'إيصالات المخزون', fr: 'Reçus de stock' },
        description: {
          ar: 'توثيق عمليات استلام البضاعة من المصنع أو المورد.',
          fr: 'Documenter les réceptions de marchandise du fournisseur.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← إيصالات المخزون', fr: 'Allez dans Menu → Reçus de stock' },
          { ar: 'اضغط "إيصال جديد"', fr: 'Cliquez "Nouveau reçu"' },
          { ar: 'أدخل المنتجات والكميات المستلمة', fr: 'Entrez les produits et quantités reçues' },
        ],
      },
    ],
  },
  {
    id: 'finance',
    icon: Banknote,
    title: { ar: 'المالية والديون', fr: 'Finances et dettes' },
    features: [
      {
        icon: Banknote,
        title: { ar: 'إدارة ديون العملاء', fr: 'Gestion des dettes clients' },
        description: {
          ar: 'متابعة الديون المستحقة على العملاء وجدولة التحصيل.',
          fr: 'Suivi des dettes clients et planification du recouvrement.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← ديون العملاء', fr: 'Allez dans Menu → Dettes clients' },
          { ar: 'اعرض قائمة الديون حسب العميل أو العامل', fr: 'Consultez la liste par client ou employé' },
          { ar: 'اضغط على دين لعرض التفاصيل وسجل الدفعات', fr: 'Cliquez sur une dette pour les détails et l\'historique' },
          { ar: 'سجّل دفعات التحصيل عند استلام المبالغ', fr: 'Enregistrez les paiements lors de la réception' },
        ],
      },
      {
        icon: Wallet,
        title: { ar: 'إدارة المصاريف', fr: 'Gestion des dépenses' },
        description: {
          ar: 'متابعة مصاريف العمال والموافقة عليها أو رفضها.',
          fr: 'Suivi des dépenses des employés, approbation ou rejet.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← إدارة المصاريف', fr: 'Allez dans Menu → Gestion des dépenses' },
          { ar: 'اعرض المصاريف المعلقة', fr: 'Consultez les dépenses en attente' },
          { ar: 'اضغط على مصروف لمراجعته', fr: 'Cliquez sur une dépense pour la réviser' },
          { ar: 'وافق أو ارفض مع إضافة ملاحظة', fr: 'Approuvez ou rejetez avec une note' },
        ],
      },
      {
        icon: Vault,
        title: { ar: 'خزينة المدير', fr: 'Trésorerie du directeur' },
        description: {
          ar: 'إدارة التسليمات المالية بين العمال والمدير وتوثيق طرق الدفع.',
          fr: 'Gérer les remises financières entre employés et directeur.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← خزينة المدير', fr: 'Allez dans Menu → Trésorerie du directeur' },
          { ar: 'اعرض التسليمات المعلقة والمكتملة', fr: 'Consultez les remises en attente et complétées' },
          { ar: 'سجّل استلام المبالغ من العمال', fr: 'Enregistrez la réception des montants' },
        ],
      },
      {
        icon: Calculator,
        title: { ar: 'المحاسبة', fr: 'Comptabilité' },
        description: {
          ar: 'إنشاء جلسات محاسبة دورية لمراجعة حسابات العمال وتوثيق الفوارق.',
          fr: 'Créer des sessions comptables périodiques pour réviser les comptes.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← المحاسبة', fr: 'Allez dans Menu → Comptabilité' },
          { ar: 'اضغط "جلسة جديدة"', fr: 'Cliquez "Nouvelle session"' },
          { ar: 'اختر العامل والفترة الزمنية', fr: 'Sélectionnez l\'employé et la période' },
          { ar: 'راجع البنود: النقدية، الشيكات، الديون، المخزون...', fr: 'Révisez les éléments: espèces, chèques, dettes, stock...' },
          { ar: 'وثّق الفوارق وأضف ملاحظات', fr: 'Documentez les écarts et ajoutez des notes' },
        ],
      },
      {
        icon: Scale,
        title: { ar: 'خزينة الفائض والعجز', fr: 'Trésorerie surplus et déficit' },
        description: {
          ar: 'تتبع فوائض وعجوز العمال المالية عبر الزمن.',
          fr: 'Suivi des surplus et déficits financiers des employés.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← خزينة الفائض والعجز', fr: 'Allez dans Menu → Trésorerie surplus et déficit' },
          { ar: 'اعرض ملخص الفوائض والعجوز لكل عامل', fr: 'Consultez le résumé par employé' },
        ],
      },
    ],
  },
  {
    id: 'promo',
    icon: FileSpreadsheet,
    title: { ar: 'العروض الترويجية (البرومو)', fr: 'Promotions (Promo)' },
    features: [
      {
        icon: FileSpreadsheet,
        title: { ar: 'جدول العروض', fr: 'Tableau des promotions' },
        description: {
          ar: 'عرض جميع العروض الترويجية المسجلة من قبل العمال في جدول شامل مع إمكانية الفلترة.',
          fr: 'Afficher toutes les promotions enregistrées dans un tableau complet avec filtres.',
        },
        steps: [
          { ar: 'اذهب إلى جدول العروض من الشريط السفلي', fr: 'Allez dans Tableau des promotions depuis la barre inférieure' },
          { ar: 'استخدم الفلاتر للبحث حسب التاريخ أو العامل أو المنتج', fr: 'Utilisez les filtres par date, employé ou produit' },
          { ar: 'اضغط على عرض لعرض تفاصيله', fr: 'Cliquez sur une promotion pour ses détails' },
        ],
      },
      {
        icon: Split,
        title: { ar: 'تجزئة العروض', fr: 'Répartition des promotions' },
        description: {
          ar: 'تقسيم كميات العروض الكبيرة على عدة عمال.',
          fr: 'Répartir les grandes quantités promotionnelles entre plusieurs employés.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← تجزئة العروض', fr: 'Allez dans Menu → Répartition des promotions' },
          { ar: 'اضغط "تجزئة جديدة"', fr: 'Cliquez "Nouvelle répartition"' },
          { ar: 'اختر المنتج وحدد الكمية الإجمالية', fr: 'Choisissez le produit et la quantité totale' },
          { ar: 'وزّع الكميات على العمال', fr: 'Répartissez les quantités entre les employés' },
        ],
      },
    ],
  },
  {
    id: 'rewards',
    icon: Trophy,
    title: { ar: 'المكافآت والعقوبات', fr: 'Récompenses et pénalités' },
    features: [
      {
        icon: Trophy,
        title: { ar: 'نظام النقاط والمكافآت', fr: 'Système de points et récompenses' },
        description: {
          ar: 'نظام تحفيز للعمال يعتمد على النقاط: مكافآت على الإنجازات وعقوبات على المخالفات.',
          fr: 'Système de motivation basé sur les points: récompenses et pénalités.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← المكافآت والعقوبات', fr: 'Allez dans Menu → Récompenses et pénalités' },
          { ar: 'أنشئ مهام مكافآت (مثال: بيع 10 طلبيات = 5 نقاط)', fr: 'Créez des tâches de récompense (ex: 10 commandes = 5 points)' },
          { ar: 'أنشئ عقوبات تلقائية أو يدوية', fr: 'Créez des pénalités automatiques ou manuelles' },
          { ar: 'تابع لوحة قيادة النقاط لكل عامل', fr: 'Suivez le tableau de bord des points par employé' },
        ],
      },
    ],
  },
  {
    id: 'attendance',
    icon: CalendarDays,
    title: { ar: 'المداومة والحضور', fr: 'Présence et pointage' },
    features: [
      {
        icon: CalendarDays,
        title: { ar: 'متابعة حضور العمال', fr: 'Suivi de présence des employés' },
        description: {
          ar: 'تسجيل دخول وخروج العمال مع التحقق من الموقع الجغرافي.',
          fr: 'Enregistrer les entrées/sorties avec vérification de géolocalisation.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← المداومة', fr: 'Allez dans Menu → Présence' },
          { ar: 'اعرض سجلات الحضور حسب التاريخ', fr: 'Consultez les registres par date' },
          { ar: 'تحقق من مواقع التسجيل على الخريطة', fr: 'Vérifiez les positions sur la carte' },
        ],
      },
    ],
  },
  {
    id: 'stats',
    icon: BarChart3,
    title: { ar: 'الإحصائيات والتقارير', fr: 'Statistiques et rapports' },
    features: [
      {
        icon: BarChart3,
        title: { ar: 'إحصائيات شاملة', fr: 'Statistiques complètes' },
        description: {
          ar: 'رسوم بيانية وتقارير عن المبيعات والعملاء والمنتجات والعروض.',
          fr: 'Graphiques et rapports sur les ventes, clients, produits et promotions.',
        },
        steps: [
          { ar: 'اذهب إلى الإحصائيات من الشريط السفلي', fr: 'Allez dans Statistiques depuis la barre inférieure' },
          { ar: 'اختر نوع الإحصائيات: مبيعات / عملاء / منتجات / عروض', fr: 'Choisissez le type: ventes / clients / produits / promotions' },
          { ar: 'حدد الفترة الزمنية والفرع', fr: 'Définissez la période et la succursale' },
          { ar: 'اعرض الرسوم البيانية والأرقام', fr: 'Consultez les graphiques et chiffres' },
        ],
      },
      {
        icon: Activity,
        title: { ar: 'سجل النشاطات', fr: 'Journal d\'activités' },
        description: {
          ar: 'سجل تفصيلي لجميع العمليات التي يقوم بها المستخدمون في النظام.',
          fr: 'Journal détaillé de toutes les opérations effectuées dans le système.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← سجل النشاطات', fr: 'Allez dans Menu → Journal d\'activités' },
          { ar: 'فلتر حسب العامل أو نوع العملية أو التاريخ', fr: 'Filtrez par employé, type d\'opération ou date' },
        ],
      },
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    title: { ar: 'الإعدادات', fr: 'Paramètres' },
    features: [
      {
        icon: Settings,
        title: { ar: 'إعدادات النظام', fr: 'Paramètres du système' },
        description: {
          ar: 'ضبط إعدادات الشركة، الطباعة، الرسائل القصيرة، تحديث التطبيق، والمزيد.',
          fr: 'Configurer les paramètres de l\'entreprise, impression, SMS, mise à jour, etc.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← الإعدادات', fr: 'Allez dans Menu → Paramètres' },
          { ar: 'معلومات الشركة: الاسم، الهاتف، العنوان، الشعار', fr: 'Info entreprise: nom, téléphone, adresse, logo' },
          { ar: 'إعدادات الطباعة: حجم الإيصال، البيانات المعروضة', fr: 'Paramètres impression: taille du reçu, données affichées' },
          { ar: 'إعدادات الرسائل القصيرة للتواصل مع العملاء', fr: 'Paramètres SMS pour communication avec les clients' },
          { ar: 'إعدادات التحقق والموقع الجغرافي', fr: 'Paramètres de vérification et géolocalisation' },
        ],
      },
      {
        icon: Navigation,
        title: { ar: 'العمليات الجغرافية', fr: 'Opérations géographiques' },
        description: {
          ar: 'إدارة القطاعات والمناطق وجدولة زيارات العملاء.',
          fr: 'Gérer les secteurs, zones et planification des visites clients.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← العمليات الجغرافية', fr: 'Allez dans Menu → Opérations géographiques' },
          { ar: 'أنشئ قطاعات وحدد المناطق الجغرافية', fr: 'Créez des secteurs et définissez les zones' },
          { ar: 'جدوِل زيارات العملاء حسب القطاع واليوم', fr: 'Planifiez les visites par secteur et jour' },
        ],
      },
      {
        icon: Store,
        title: { ar: 'البحث عن المحلات القريبة', fr: 'Recherche de magasins proches' },
        description: {
          ar: 'البحث عن محلات تجارية قريبة على الخريطة لإضافتها كعملاء جدد.',
          fr: 'Rechercher des magasins proches sur la carte pour les ajouter comme clients.',
        },
        steps: [
          { ar: 'اذهب إلى القائمة ← البحث عن المحلات', fr: 'Allez dans Menu → Recherche de magasins' },
          { ar: 'حدد موقعك على الخريطة', fr: 'Définissez votre position sur la carte' },
          { ar: 'اعرض المحلات القريبة وأضفها كعملاء', fr: 'Affichez les magasins proches et ajoutez-les comme clients' },
        ],
      },
    ],
  },
];

const FeatureCard: React.FC<{ feature: GuideFeature; lang: Lang }> = ({ feature, lang }) => (
  <Card className="overflow-hidden">
    <CardHeader className="pb-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
          <feature.icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <CardTitle className="text-base">{feature.title[lang]}</CardTitle>
          <CardDescription className="text-sm mt-1">{feature.description[lang]}</CardDescription>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <div>
        <p className="text-sm font-semibold mb-2 flex items-center gap-1">
          <ArrowRight className="h-4 w-4 text-primary" />
          {lang === 'ar' ? 'الخطوات:' : 'Étapes :'}
        </p>
        <ol className="space-y-1.5 list-none">
          {feature.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="shrink-0 h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full">
                {i + 1}
              </Badge>
              <span>{step[lang]}</span>
            </li>
          ))}
        </ol>
      </div>
      {feature.tips && feature.tips.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
            {lang === 'ar' ? '💡 نصيحة' : '💡 Conseil'}
          </p>
          {feature.tips.map((tip, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-300">{tip[lang]}</p>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

const Guide: React.FC = () => {
  const { dir } = useLanguage();
  const [lang, setLang] = useState<Lang>('ar');

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2">
          {lang === 'ar' ? 'دليل مدير النظام' : 'Guide de l\'administrateur'}
        </h1>
        <p className="text-muted-foreground mb-4">
          {lang === 'ar'
            ? 'شرح تفصيلي لجميع الميزات والإعدادات المتاحة لمدير النظام'
            : 'Explication détaillée de toutes les fonctionnalités disponibles pour l\'administrateur'}
        </p>
        {/* Language Toggle */}
        <div className="inline-flex items-center gap-2 bg-muted rounded-lg p-1">
          <Button
            variant={lang === 'ar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setLang('ar')}
            className="gap-1"
          >
            <Globe className="h-4 w-4" />
            العربية
          </Button>
          <Button
            variant={lang === 'fr' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setLang('fr')}
            className="gap-1"
          >
            <Globe className="h-4 w-4" />
            Français
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="branches" className="w-full">
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-2 mb-6">
          {guideSections.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="gap-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <section.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{section.title[lang]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {guideSections.map((section) => (
          <TabsContent key={section.id} value={section.id} className="space-y-4 mt-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <section.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{section.title[lang]}</h2>
                <p className="text-sm text-muted-foreground">
                  {lang === 'ar'
                    ? `${section.features.length} ميزة في هذا القسم`
                    : `${section.features.length} fonctionnalité(s) dans cette section`}
                </p>
              </div>
            </div>
            <div className="grid gap-4">
              {section.features.map((feature, i) => (
                <FeatureCard key={i} feature={feature} lang={lang} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Guide;
