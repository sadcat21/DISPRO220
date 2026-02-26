import React, { createContext, useContext, useState, useCallback } from 'react';

interface SelectedWorkerState {
  workerId: string | null;
  workerName: string | null;
}

interface SelectedWorkerContextType extends SelectedWorkerState {
  setSelectedWorker: (workerId: string | null, workerName?: string | null) => void;
  clearSelectedWorker: () => void;
}

const SelectedWorkerContext = createContext<SelectedWorkerContextType | null>(null);

export const useSelectedWorker = () => {
  const context = useContext(SelectedWorkerContext);
  if (!context) {
    throw new Error('useSelectedWorker must be used within SelectedWorkerProvider');
  }
  return context;
};

export const SelectedWorkerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SelectedWorkerState>({ workerId: null, workerName: null });

  const setSelectedWorker = useCallback((workerId: string | null, workerName?: string | null) => {
    setState({ workerId, workerName: workerName || null });
  }, []);

  const clearSelectedWorker = useCallback(() => {
    setState({ workerId: null, workerName: null });
  }, []);

  return (
    <SelectedWorkerContext.Provider value={{ ...state, setSelectedWorker, clearSelectedWorker }}>
      {children}
    </SelectedWorkerContext.Provider>
  );
};
