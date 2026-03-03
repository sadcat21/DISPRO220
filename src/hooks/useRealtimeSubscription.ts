import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribe to realtime changes on one or more tables and invalidate related query keys.
 * Includes fallback refresh to avoid stale UI when realtime misses updates.
 */
export const useRealtimeSubscription = (
  channelName: string,
  tables: { table: string; filter?: string }[],
  queryKeys: (string | undefined)[][],
  enabled: boolean = true
) => {
  const queryClient = useQueryClient();
  const tablesSignature = useMemo(() => JSON.stringify(tables), [tables]);
  const keysSignature = useMemo(() => JSON.stringify(queryKeys), [queryKeys]);

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const invalidateAll = () => {
      for (const key of queryKeys) {
        const sanitized = key.filter(Boolean) as string[];
        if (sanitized.length > 0) {
          queryClient.invalidateQueries({ queryKey: sanitized });
        }
      }
    };

    let realtimeHealthy = false;
    let channel = supabase.channel(channelName);

    for (const { table, filter } of tables) {
      const opts: { event: '*'; schema: 'public'; table: string; filter?: string } = {
        event: '*',
        schema: 'public',
        table,
      };

      if (filter) opts.filter = filter;

      channel = channel.on('postgres_changes', opts, () => {
        realtimeHealthy = true;
        invalidateAll();
      });
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        realtimeHealthy = true;
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeHealthy = false;
      }
    });

    // Safety refresh even when realtime is connected (guards against silently missed events)
    const safetyInterval = window.setInterval(() => {
      invalidateAll();
    }, 30000);

    // Faster fallback when channel health is degraded
    const fallbackInterval = window.setInterval(() => {
      if (!realtimeHealthy) {
        invalidateAll();
      }
    }, 8000);

    return () => {
      window.clearInterval(safetyInterval);
      window.clearInterval(fallbackInterval);
      supabase.removeChannel(channel);
    };
  }, [channelName, enabled, queryClient, tablesSignature, keysSignature]);
};
