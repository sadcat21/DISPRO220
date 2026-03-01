import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file';
  media_url?: string;
  media_name?: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_by: string;
  branch_id: string | null;
  messages: ChatMessage[];
  last_message_at: string;
  created_at: string;
  participants?: { worker_id: string; last_read_at?: string | null; worker?: { id: string; full_name: string; username: string } }[];
  unread_count?: number;
}

export const useChat = () => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isAdminOrBranchAdmin = role === 'admin' || role === 'branch_admin';

  useRealtimeSubscription(
    'chat-realtime',
    [
      { table: 'conversations' },
      { table: 'conversation_participants' },
    ],
    [['conversations'], ['conversations']],
    !!user
  );

  // Fetch all conversations for current user (or ALL for admin/branch_admin)
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations', isAdminOrBranchAdmin],
    queryFn: async () => {
      if (!user) return [];

      let convIds: string[] = [];

      if (isAdminOrBranchAdmin) {
        // Admin/branch_admin can see ALL conversations
        let query = supabase.from('conversations').select('*').order('last_message_at', { ascending: false });
        if (role === 'branch_admin' && user.branch_id) {
          query = query.eq('branch_id', user.branch_id);
        }
        const { data: convs } = await query;
        if (!convs?.length) return [];
        convIds = convs.map(c => c.id);

        // Fetch participants for all conversations
        const { data: allParticipants } = await supabase
          .from('conversation_participants')
          .select('conversation_id, worker_id, last_read_at')
          .in('conversation_id', convIds);

        const workerIds = [...new Set(allParticipants?.map(p => p.worker_id) || [])];
        const { data: workers } = await supabase
          .from('workers')
          .select('id, full_name, username')
          .in('id', workerIds);

        const workersMap = new Map(workers?.map(w => [w.id, w]) || []);

        // Check if admin is participant for unread counts
        const myParticipantMap = new Map(
          allParticipants?.filter(p => p.worker_id === user.id).map(p => [p.conversation_id, p.last_read_at]) || []
        );

        return convs.map(conv => {
          const msgs = (Array.isArray(conv.messages) ? conv.messages : []) as unknown as ChatMessage[];
          const participants = allParticipants
            ?.filter(p => p.conversation_id === conv.id)
            .map(p => ({ worker_id: p.worker_id, last_read_at: p.last_read_at, worker: workersMap.get(p.worker_id) })) || [];

          const lastRead = myParticipantMap.get(conv.id);
          const unreadCount = lastRead
            ? msgs.filter(m => m.timestamp > lastRead && m.sender_id !== user.id).length
            : 0;

          return {
            ...conv,
            messages: msgs,
            participants,
            unread_count: unreadCount,
          } as Conversation;
        });
      }

      // Regular worker: only conversations they participate in
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('worker_id', user.id);

      if (!participations?.length) return [];

      convIds = participations.map(p => p.conversation_id);
      
      const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .in('id', convIds)
        .order('last_message_at', { ascending: false });

      if (!convs) return [];

      // Fetch participants for all conversations
      const { data: allParticipants } = await supabase
        .from('conversation_participants')
        .select('conversation_id, worker_id, last_read_at')
        .in('conversation_id', convIds);

      // Fetch worker names
      const workerIds = [...new Set(allParticipants?.map(p => p.worker_id) || [])];
      const { data: workers } = await supabase
        .from('workers')
        .select('id, full_name, username')
        .in('id', workerIds);

      const workersMap = new Map(workers?.map(w => [w.id, w]) || []);

      // Get user's last_read_at for unread counts
      const { data: myParticipations } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('worker_id', user.id)
        .in('conversation_id', convIds);

      const lastReadMap = new Map(myParticipations?.map(p => [p.conversation_id, p.last_read_at]) || []);

      return convs.map(conv => {
        const msgs = (Array.isArray(conv.messages) ? conv.messages : []) as unknown as ChatMessage[];
        const participants = allParticipants
          ?.filter(p => p.conversation_id === conv.id)
          .map(p => ({ worker_id: p.worker_id, last_read_at: p.last_read_at, worker: workersMap.get(p.worker_id) })) || [];

        const lastRead = lastReadMap.get(conv.id);
        const unreadCount = lastRead
          ? msgs.filter(m => m.timestamp > lastRead && m.sender_id !== user.id).length
          : 0;

        return {
          ...conv,
          messages: msgs,
          participants,
          unread_count: unreadCount,
        } as Conversation;
      });
    },
    enabled: !!user,
  });

  // Send message
  const sendMessage = useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId: string; message: Omit<ChatMessage, 'id' | 'timestamp'> }) => {
      // Get current messages
      const { data: conv } = await supabase
        .from('conversations')
        .select('messages')
        .eq('id', conversationId)
        .single();

      const currentMessages = (Array.isArray(conv?.messages) ? conv.messages : []) as unknown as ChatMessage[];
      
      const newMessage: ChatMessage = {
        ...message,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...currentMessages, newMessage];

      const { error } = await supabase
        .from('conversations')
        .update({
          messages: updatedMessages as any,
          last_message_at: newMessage.timestamp,
        })
        .eq('id', conversationId);

      if (error) throw error;

      // Auto-add admin as participant if not already
      const { data: existingPart } = await supabase
        .from('conversation_participants')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('worker_id', message.sender_id)
        .maybeSingle();

      if (!existingPart) {
        await supabase
          .from('conversation_participants')
          .insert({ conversation_id: conversationId, worker_id: message.sender_id });
      }

      // Update last_read_at
      await supabase
        .from('conversation_participants')
        .update({ last_read_at: newMessage.timestamp })
        .eq('conversation_id', conversationId)
        .eq('worker_id', message.sender_id);

      return newMessage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Create conversation
  const createConversation = useMutation({
    mutationFn: async ({ type, name, participantIds }: { type: 'direct' | 'group'; name?: string; participantIds: string[] }) => {
      if (!user) throw new Error('Not authenticated');

      // For direct chats, check if conversation already exists
      if (type === 'direct' && participantIds.length === 1) {
        const otherId = participantIds[0];
        const existing = conversations.find(c =>
          c.type === 'direct' &&
          c.participants?.length === 2 &&
          c.participants.some(p => p.worker_id === otherId)
        );
        if (existing) return existing;
      }

      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({
          type,
          name: name || null,
          created_by: user.id,
          branch_id: user.branch_id || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add all participants including the creator
      const allParticipants = [...new Set([user.id, ...participantIds])];
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(allParticipants.map(wid => ({
          conversation_id: conv.id,
          worker_id: wid,
        })));

      if (partError) throw partError;

      return conv;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Mark conversation as read
  const markAsRead = useCallback(async (conversationId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('worker_id', user.id);

      if (error) {
        console.error('markAsRead error:', error);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error) {
      console.error('markAsRead unexpected error:', error);
    }
  }, [user, queryClient]);

  // Upload media
  const uploadMedia = useCallback(async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = `${user?.id}/${fileName}`;

    const { error } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file);

    if (error) throw error;

    const { data } = supabase.storage
      .from('chat-media')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }, [user]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return {
    conversations,
    isLoading,
    sendMessage,
    createConversation,
    markAsRead,
    uploadMedia,
    totalUnread,
  };
};
