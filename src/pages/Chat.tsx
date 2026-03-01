import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChat, Conversation } from '@/hooks/useChat';
import ConversationList from '@/components/chat/ConversationList';
import ChatView from '@/components/chat/ChatView';
import NewChatDialog from '@/components/chat/NewChatDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const Chat = () => {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [pendingConversation, setPendingConversation] = useState<Conversation | null>(null);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const { conversations, sendMessage, createConversation, markAsRead, uploadMedia } = useChat();
  const selectedConv = conversations.find((c) => c.id === selectedConvId) || (pendingConversation?.id === selectedConvId ? pendingConversation : undefined);

  const handleSelect = (id: string) => {
    setPendingConversation(null);
    setSelectedConvId(id);
    markAsRead(id);
  };

  const handleNewChat = async (type: 'direct' | 'group', participantIds: string[], name?: string): Promise<boolean> => {
    try {
      const result = await createConversation.mutateAsync({ type, participantIds, name });
      if (!result) return false;

      setPendingConversation({
        id: result.id,
        type: (result.type ?? type) as 'direct' | 'group',
        name: result.name ?? name ?? null,
        created_by: result.created_by ?? '',
        branch_id: result.branch_id ?? null,
        messages: [],
        last_message_at: result.last_message_at ?? new Date().toISOString(),
        created_at: result.created_at ?? new Date().toISOString(),
        participants: [],
        unread_count: 0,
      });

      setSelectedConvId(result.id);
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      return true;
    } catch (error) {
      console.error('فشل إنشاء المحادثة:', error);
      toast.error('تعذر بدء المحادثة، حاول مرة أخرى');
      return false;
    }
  };

  if (isMobile) {
    // When a conversation is open, go full screen (hide header + nav)
    if (selectedConv) {
      return (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
          <ChatView
            conversation={selectedConv}
            onSend={(msg) => sendMessage.mutate({ conversationId: selectedConv.id, message: msg })}
            onUpload={uploadMedia}
            onBack={() => { setSelectedConvId(null); setPendingConversation(null); }}
          />
          <NewChatDialog open={showNewChat} onClose={() => setShowNewChat(false)} onCreate={handleNewChat} />
        </div>
      );
    }

    if (selectedConvId && !selectedConv) {
      return (
        <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="h-[calc(100vh-120px)]">
        <ConversationList conversations={conversations} selectedId={null} onSelect={handleSelect} onNewChat={() => setShowNewChat(true)} />
        <NewChatDialog open={showNewChat} onClose={() => setShowNewChat(false)} onCreate={handleNewChat} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex border rounded-xl overflow-hidden">
      <div className="w-80 border-l">
        <ConversationList conversations={conversations} selectedId={selectedConvId} onSelect={handleSelect} onNewChat={() => setShowNewChat(true)} />
      </div>
      <div className="flex-1">
        {selectedConvId && !selectedConv ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : selectedConv ? (
          <ChatView
            conversation={selectedConv}
            onSend={(msg) => sendMessage.mutate({ conversationId: selectedConv.id, message: msg })}
            onUpload={uploadMedia}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">اختر محادثة أو ابدأ محادثة جديدة</div>
        )}
      </div>
      <NewChatDialog open={showNewChat} onClose={() => setShowNewChat(false)} onCreate={handleNewChat} />
    </div>
  );
};

export default Chat;
