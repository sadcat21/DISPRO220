import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, ListTodo, AlertTriangle, Trophy, MessageSquare, FileText, Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import RewardSettingsTab from '@/components/rewards/RewardSettingsTab';
import RewardTasksTab from '@/components/rewards/RewardTasksTab';
import RewardPenaltiesTab from '@/components/rewards/RewardPenaltiesTab';
import RewardDashboardTab from '@/components/rewards/RewardDashboardTab';
import RewardDisputesTab from '@/components/rewards/RewardDisputesTab';
import RewardReportsTab from '@/components/rewards/RewardReportsTab';
import RewardNotificationsTab from '@/components/rewards/RewardNotificationsTab';
import { useAllDisputes } from '@/hooks/useRewardDisputes';

const Rewards: React.FC = () => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');
  const { data: disputes } = useAllDisputes();
  const pendingCount = disputes?.length || 0;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">{t('rewards.title')}</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="dashboard" className="text-xs gap-1">
            <Trophy className="w-3.5 h-3.5" />
            {t('rewards.dashboard')}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs gap-1">
            <ListTodo className="w-3.5 h-3.5" />
            {t('rewards.tasks')}
          </TabsTrigger>
          <TabsTrigger value="penalties" className="text-xs gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t('rewards.penalties')}
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs gap-1">
            <Settings className="w-3.5 h-3.5" />
            {t('settings.title')}
          </TabsTrigger>
        </TabsList>

        {/* Second row of tabs */}
        <TabsList className="grid grid-cols-3 w-full mt-1">
          <TabsTrigger value="disputes" className="text-xs gap-1 relative">
            <MessageSquare className="w-3.5 h-3.5" />
            {t('rewards.disputes')}
            {pendingCount > 0 && <Badge variant="destructive" className="text-[9px] h-4 px-1 absolute -top-1 -left-1">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-xs gap-1">
            <FileText className="w-3.5 h-3.5" />
            {t('rewards.reports')}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs gap-1">
            <Bell className="w-3.5 h-3.5" />
            {t('rewards.notifications')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><RewardDashboardTab /></TabsContent>
        <TabsContent value="tasks"><RewardTasksTab /></TabsContent>
        <TabsContent value="penalties"><RewardPenaltiesTab /></TabsContent>
        <TabsContent value="settings"><RewardSettingsTab /></TabsContent>
        <TabsContent value="disputes"><RewardDisputesTab /></TabsContent>
        <TabsContent value="reports"><RewardReportsTab /></TabsContent>
        <TabsContent value="notifications"><RewardNotificationsTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Rewards;
