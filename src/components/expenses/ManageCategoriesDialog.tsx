import React, { useState } from 'react';
import { useExpenseCategories } from '@/hooks/useExpenses';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, Loader2, Tag, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCategoryName } from '@/utils/categoryName';
import TranslatableInput, { autoTranslateBeforeSave } from '@/components/translation/TranslatableInput';

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ManageCategoriesDialog: React.FC<ManageCategoriesDialogProps> = ({ open, onOpenChange }) => {
  const { data: categories, isLoading } = useExpenseCategories();
  const queryClient = useQueryClient();
  const { language, t } = useLanguage();

  const [newNameAr, setNewNameAr] = useState('');
  const [newNameFr, setNewNameFr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newVisibleRoles, setNewVisibleRoles] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameAr, setEditNameAr] = useState('');
  const [editNameFr, setEditNameFr] = useState('');
  const [editNameEn, setEditNameEn] = useState('');
  const [editVisibleRoles, setEditVisibleRoles] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedRolesId, setExpandedRolesId] = useState<string | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<string[]>([]);
  const [savingRolesId, setSavingRolesId] = useState<string | null>(null);

  // Fetch custom roles
  const { data: customRoles } = useQuery({
    queryKey: ['custom-roles-for-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_roles')
        .select('id, code, name_ar')
        .order('name_ar');
      if (error) throw error;
      return data || [];
    },
  });

  // System roles that can be toggled for visibility
  const systemRoles = [
    { code: 'branch_admin', name_ar: t('workers.role_branch_admin') },
    { code: 'supervisor', name_ar: t('workers.role_supervisor') },
  ];

  // Combine system roles + custom functional roles (exclude admin - always sees everything)
  const selectableRoles = [
    ...systemRoles,
    ...(customRoles || []).filter(r => !['admin', 'branch_admin', 'supervisor'].includes(r.code)),
  ];

  const handleAdd = async () => {
    if (!newNameAr.trim() && !newNameFr.trim() && !newNameEn.trim()) return;
    setAdding(true);

    const translated = await autoTranslateBeforeSave(newNameAr, newNameFr, newNameEn);

    const { error } = await supabase.from('expense_categories').insert({
      name: translated.ar || translated.fr || translated.en,
      name_fr: translated.fr || null,
      name_en: translated.en || null,
      visible_to_roles: newVisibleRoles.length > 0 ? newVisibleRoles : null,
    });
    setAdding(false);
    if (error) {
      if (error.code === '23505') {
        toast.error(t('expenses.category_exists'));
      } else {
        toast.error(t('common.error'));
      }
      return;
    }
    toast.success(t('expenses.category_added'));
    setNewNameAr(''); setNewNameFr(''); setNewNameEn('');
    setNewVisibleRoles([]);
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
  };

  const handleUpdate = async (id: string) => {
    if (!editNameAr.trim() && !editNameFr.trim() && !editNameEn.trim()) return;

    const translated = await autoTranslateBeforeSave(editNameAr, editNameFr, editNameEn);

    const { error } = await supabase.from('expense_categories').update({
      name: translated.ar || translated.fr || translated.en,
      name_fr: translated.fr || null,
      name_en: translated.en || null,
      visible_to_roles: editVisibleRoles.length > 0 ? editVisibleRoles : null,
    }).eq('id', id);

    if (error) {
      toast.error(t('common.error'));
      return;
    }
    toast.success(t('expenses.category_updated'));
    setEditingId(null);
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from('expense_categories').update({ is_active: false }).eq('id', id);
    setDeletingId(null);
    if (error) {
      toast.error(t('common.error'));
      return;
    }
    toast.success(t('expenses.category_deleted'));
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
  };

  const handleRolesUpdate = async (catId: string, roles: string[]) => {
    // If all selectable roles are selected or none, save as null (visible to all)
    const allSelected = roles.length >= selectableRoles.length || roles.length === 0;
    const { error } = await supabase.from('expense_categories').update({
      visible_to_roles: allSelected ? null : roles,
    }).eq('id', catId);

    if (error) {
      toast.error(t('common.error'));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
  };

  const toggleRole = (roleCode: string, currentRoles: string[], setter: (r: string[]) => void) => {
    if (currentRoles.includes(roleCode)) {
      setter(currentRoles.filter(r => r !== roleCode));
    } else {
      setter([...currentRoles, roleCode]);
    }
  };

  const isDefaultCategory = (cat: any) => cat.name === 'أخرى';

  const RoleCheckboxes: React.FC<{
    selectedRoles: string[];
    onChange: (roleCode: string) => void;
  }> = ({ selectedRoles, onChange }) => (
    <div className="grid grid-cols-2 gap-1.5 mt-2">
      {selectableRoles.map(role => (
        <label key={role.code} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 rounded hover:bg-muted">
          <Checkbox
            checked={selectedRoles.length === 0 || selectedRoles.includes(role.code)}
            onCheckedChange={() => onChange(role.code)}
            className="h-3.5 w-3.5"
          />
          <span>{role.name_ar}</span>
        </label>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            {t('expenses.manage_categories')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new category */}
          <div className="space-y-2 border rounded-lg p-3">
            <TranslatableInput
              valueAr={newNameAr}
              valueFr={newNameFr}
              valueEn={newNameEn}
              onChangeAr={setNewNameAr}
              onChangeFr={setNewNameFr}
              onChangeEn={setNewNameEn}
              label={t('expenses.category_name')}
              placeholder={t('expenses.category_name')}
            />
            
            {/* Role visibility for new category */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t('expenses.visible_to_roles')}</span>
              <p className="text-xs text-muted-foreground">{t('expenses.visible_to_roles_hint')}</p>
              <RoleCheckboxes
                selectedRoles={newVisibleRoles}
                onChange={(code) => toggleRole(code, newVisibleRoles, setNewVisibleRoles)}
              />
            </div>

            <Button
              onClick={handleAdd}
              disabled={(!newNameAr.trim() && !newNameFr.trim() && !newNameEn.trim()) || adding}
              size="sm"
              className="w-full"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin me-1" /> : <Plus className="w-4 h-4 me-1" />}
              {t('common.add')}
            </Button>
          </div>

          {/* Categories list */}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {categories?.map(cat => {
                const catRoles = (cat as any).visible_to_roles as string[] | null;
                const isExpanded = expandedRolesId === cat.id;
                
                return (
                  <Card key={cat.id} className="p-3">
                    {editingId === cat.id ? (
                      <div className="space-y-2">
                        <TranslatableInput
                          valueAr={editNameAr}
                          valueFr={editNameFr}
                          valueEn={editNameEn}
                          onChangeAr={setEditNameAr}
                          onChangeFr={setEditNameFr}
                          onChangeEn={setEditNameEn}
                        />
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">{t('expenses.visible_to_roles')}</span>
                          <RoleCheckboxes
                            selectedRoles={editVisibleRoles}
                            onChange={(code) => toggleRole(code, editVisibleRoles, setEditVisibleRoles)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleUpdate(cat.id)}>
                            <Check className="w-4 h-4 text-primary" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm font-medium truncate">
                              {getCategoryName(cat as any, language)}
                            </span>
                            {isDefaultCategory(cat) && (
                              <Badge variant="outline" className="text-xs shrink-0">{t('expenses.default')}</Badge>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedRolesId(null);
                                } else {
                                  setExpandedRolesId(cat.id);
                                  setExpandedRoles(catRoles || []);
                                }
                              }}
                              className="h-7 w-7 p-0"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditingId(cat.id);
                                setEditNameAr(cat.name);
                                setEditNameFr((cat as any).name_fr || '');
                                setEditNameEn((cat as any).name_en || '');
                                setEditVisibleRoles(catRoles || []);
                              }}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            {!isDefaultCategory(cat) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleDelete(cat.id)}
                                disabled={deletingId === cat.id}
                              >
                                {deletingId === cat.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Roles visibility badges */}
                        <div className="flex flex-wrap gap-1">
                          {!catRoles || catRoles.length === 0 ? (
                            <Badge variant="secondary" className="text-xs">{t('expenses.all_roles')}</Badge>
                          ) : (
                            catRoles.map(code => {
                              const role = selectableRoles.find(r => r.code === code);
                              return role ? (
                                <Badge key={code} variant="outline" className="text-xs">{role.name_ar}</Badge>
                              ) : null;
                            })
                          )}
                        </div>

                        {/* Expandable role checkboxes for quick edit */}
                        {isExpanded && (
                          <div className="border-t pt-2 mt-1 space-y-2">
                            <span className="text-xs font-medium text-muted-foreground">{t('expenses.visible_to_roles')}</span>
                            <div className="grid grid-cols-2 gap-1.5 mt-1">
                              {selectableRoles.map(role => (
                                <label key={role.code} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 rounded hover:bg-muted">
                                  <Checkbox
                                    checked={expandedRoles.length === 0 || expandedRoles.includes(role.code)}
                                    onCheckedChange={() => {
                                      setExpandedRoles(prev => {
                                        if (prev.length === 0) {
                                          // Was "all" -> now select only the others (deselect this one)
                                          return selectableRoles.filter(r => r.code !== role.code).map(r => r.code);
                                        }
                                        return prev.includes(role.code)
                                          ? prev.filter(r => r !== role.code)
                                          : [...prev, role.code];
                                      });
                                    }}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span>{role.name_ar}</span>
                                </label>
                              ))}
                            </div>
                            <Button
                              size="sm"
                              className="w-full"
                              disabled={savingRolesId === cat.id}
                              onClick={async () => {
                                setSavingRolesId(cat.id);
                                await handleRolesUpdate(cat.id, expandedRoles);
                                setSavingRolesId(null);
                                setExpandedRolesId(null);
                                toast.success(t('expenses.category_updated'));
                              }}
                            >
                              {savingRolesId === cat.id ? (
                                <Loader2 className="w-4 h-4 animate-spin me-1" />
                              ) : (
                                <Check className="w-4 h-4 me-1" />
                              )}
                              {t('common.save')}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManageCategoriesDialog;
