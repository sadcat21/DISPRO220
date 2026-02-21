import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import WorkerHome from './WorkerHome';
import AdminHome from './AdminHome';

const Index: React.FC = () => {
  const { role } = useAuth();

  // Admin and branch_admin see navigation grid, worker sees product grid
  if (role === 'admin' || role === 'branch_admin') {
    return <AdminHome />;
  }

  return <WorkerHome />;
};

export default Index;
