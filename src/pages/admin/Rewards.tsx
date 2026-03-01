import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, ListTodo, AlertTriangle, Trophy } from 'lucide-react';
import RewardSettingsTab from '@/components/rewards/RewardSettingsTab';
import RewardTasksTab from '@/components/rewards/RewardTasksTab';
import RewardPenaltiesTab from '@/components/rewards/RewardPenaltiesTab';
import RewardDashboardTab from '@/components/rewards/RewardDashboardTab';

const Rewards: React.FC = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">نظام المكافآت والعقوبات</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="dashboard" className="text-xs gap-1">
            <Trophy className="w-3.5 h-3.5" />
            لوحة القيادة
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs gap-1">
            <ListTodo className="w-3.5 h-3.5" />
            المهام
          </TabsTrigger>
          <TabsTrigger value="penalties" className="text-xs gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            العقوبات
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs gap-1">
            <Settings className="w-3.5 h-3.5" />
            الإعدادات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><RewardDashboardTab /></TabsContent>
        <TabsContent value="tasks"><RewardTasksTab /></TabsContent>
        <TabsContent value="penalties"><RewardPenaltiesTab /></TabsContent>
        <TabsContent value="settings"><RewardSettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Rewards;
