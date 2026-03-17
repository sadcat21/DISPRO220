import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/utils';
import WorkerHome from './WorkerHome';
import AdminHome from './AdminHome';

const Index: React.FC = () => {
  const { role } = useAuth();

  if (isAdminRole(role)) {
    return <AdminHome />;
  }

  return <WorkerHome />;
};

export default Index;
