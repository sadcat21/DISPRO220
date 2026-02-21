import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { Building2, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Branch } from '@/types/database';

interface BranchSelectionDialogProps {
  open: boolean;
  onSelectBranch: (branch: Branch | null) => void;
  showAllOption?: boolean;
}

const BranchSelectionDialog: React.FC<BranchSelectionDialogProps> = ({
  open,
  onSelectBranch,
  showAllOption = true,
}) => {
  const { t, dir } = useLanguage();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchBranches();
    }
  }, [open]);

  const fetchBranches = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setBranches(data);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" dir={dir} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center text-xl">{t('branch_selection.title')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('branch_selection.description')}
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-3 py-4 max-h-[60vh] overflow-y-auto">
            {showAllOption && (
              <Button
                variant="outline"
                className="h-auto p-4 flex items-center gap-4 justify-start border-2 border-primary/30 bg-primary/5 hover:bg-primary/10"
                onClick={() => onSelectBranch(null)}
              >
                <Building2 className="w-6 h-6 text-primary" />
                <div className="text-start">
                  <div className="font-bold text-base">{t('branch_selection.all_branches')}</div>
                  <div className="text-sm text-muted-foreground">
                    {t('branch_selection.all_branches_desc')}
                  </div>
                </div>
              </Button>
            )}
            
            {branches.map((branch) => (
              <Button
                key={branch.id}
                variant="outline"
                className="h-auto p-4 flex items-start gap-4 justify-start border-2 hover:scale-[1.02] transition-all"
                onClick={() => onSelectBranch(branch)}
              >
                <Building2 className="w-6 h-6 text-muted-foreground shrink-0 mt-1" />
                <div className="text-start">
                  <div className="font-bold text-base">{branch.name}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {branch.wilaya}
                    {branch.address && ` - ${branch.address}`}
                  </div>
                </div>
              </Button>
            ))}
            
            {branches.length === 0 && (
              <div className="text-center text-muted-foreground py-4">
                {t('branch_selection.no_branches')}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BranchSelectionDialog;
