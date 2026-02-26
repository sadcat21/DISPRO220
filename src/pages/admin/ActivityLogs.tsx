import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { Worker } from '@/types/database';
import { ACTION_TYPES, ENTITY_TYPES } from '@/types/activityLog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, Loader2, User, Calendar, Filter, X,
  Plus, Pencil, Trash2, LogIn, LogOut, UserCheck, RefreshCw
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useActivityLogs } from '@/hooks/useActivityLogs';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';

const getDateLocale = (language: string) => {
  switch (language) {
    case 'fr': return fr;
    case 'en': return enUS;
    default: return ar;
  }
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  login: LogIn,
  logout: LogOut,
  assign: UserCheck,
  status_change: RefreshCw,
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  login: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  logout: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  assign: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  status_change: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const ActivityLogs: React.FC = () => {
  const { activeBranch } = useAuth();
  const { t, language } = useLanguage();
  const { workerId: contextWorkerId } = useSelectedWorker();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters
  const [selectedWorker, setSelectedWorker] = useState<string>(() => contextWorkerId || 'all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const filters = {
    workerId: selectedWorker !== 'all' ? selectedWorker : undefined,
    actionType: selectedAction !== 'all' ? selectedAction : undefined,
    entityType: selectedEntity !== 'all' ? selectedEntity : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };

  const { data: logs, isLoading, refetch } = useActivityLogs(filters);

  useEffect(() => {
    fetchWorkers();
  }, [activeBranch]);

  const fetchWorkers = async () => {
    const query = supabase.from('workers').select('*').eq('is_active', true).order('full_name');
    
    if (activeBranch) {
      query.eq('branch_id', activeBranch.id);
    }
    
    const { data } = await query;
    if (data) setWorkers(data);
  };

  const clearFilters = () => {
    setSelectedWorker('all');
    setSelectedAction('all');
    setSelectedEntity('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = selectedWorker !== 'all' || selectedAction !== 'all' || 
                           selectedEntity !== 'all' || startDate || endDate;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('activity.title')}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 ml-1" />
            {t('common.filter')}
            {hasActiveFilters && (
              <Badge variant="secondary" className="mr-1 h-5 w-5 p-0 flex items-center justify-center">
                !
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="font-bold">{t('common.filter_results')}</Label>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 ml-1" />
                  {t('common.clear_filters')}
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm">{t('activity.worker')}</Label>
                <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {workers.map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">{t('activity.action_type')}</Label>
                <Select value={selectedAction} onValueChange={setSelectedAction}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {Object.entries(ACTION_TYPES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">{t('activity.entity_type')}</Label>
                <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {Object.entries(ENTITY_TYPES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">{t('activity.from_date')}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="col-span-2 space-y-2">
                <Label className="text-sm">{t('activity.to_date')}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <Card className="bg-primary/10">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('activity.total_events')}</p>
            <p className="text-2xl font-bold">{logs?.length || 0}</p>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <ScrollArea className="h-[calc(100vh-350px)]">
        <div className="space-y-3">
          {logs?.map((log) => {
            const ActionIcon = ACTION_ICONS[log.action_type] || Activity;
            const actionColor = ACTION_COLORS[log.action_type] || 'bg-gray-100 text-gray-800';
            
            return (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${actionColor}`}>
                      <ActionIcon className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={actionColor}>
                          {ACTION_TYPES[log.action_type] || log.action_type}
                        </Badge>
                        <Badge variant="outline">
                          {ENTITY_TYPES[log.entity_type] || log.entity_type}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{log.worker?.full_name || t('common.unknown')}</span>
                      </div>
                      
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 text-sm bg-muted/50 rounded p-2">
                          {Object.entries(log.details).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2">
                              <span className="text-muted-foreground">{key}:</span>
                              <span>{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(log.created_at), 'dd MMMM yyyy - HH:mm', { locale: getDateLocale(language) })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {(!logs || logs.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('activity.no_logs')}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ActivityLogs;
