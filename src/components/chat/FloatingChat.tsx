import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessageCircle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useChat, Conversation } from '@/hooks/useChat';
import { toast } from 'sonner';
import ConversationList from './ConversationList';
import ChatView from './ChatView';
import NewChatDialog from './NewChatDialog';

const FloatingChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [pendingConversation, setPendingConversation] = useState<Conversation | null>(null);
  const queryClient = useQueryClient();

  const { conversations, sendMessage, createConversation, markAsRead, uploadMedia, totalUnread } = useChat();
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
      setShowNewChat(false);
      return true;
    } catch (error) {
      console.error('فشل إنشاء المحادثة:', error);
      toast.error('تعذر بدء المحادثة، حاول مرة أخرى');
      return false;
    }
  };

  return (
    <>
      <div className="fixed bottom-20 left-4 z-50">
        <Button size="icon" className="h-14 w-14 rounded-full shadow-lg relative" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          {totalUnread > 0 && !isOpen && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-[20px] text-[10px]">{totalUnread}</Badge>
          )}
        </Button>
      </div>

      {isOpen && (
        <div className="fixed bottom-36 left-4 z-50 w-[340px] h-[480px] bg-background border rounded-2xl shadow-2xl flex overflow-hidden">
          {selectedConvId && !selectedConv ? (
            <div className="h-full w-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : selectedConv ? (
            <ChatView
              conversation={selectedConv}
              onSend={(msg) => sendMessage.mutate({ conversationId: selectedConv.id, message: msg })}
              onUpload={uploadMedia}
              onBack={() => { setSelectedConvId(null); setPendingConversation(null); }}
            />
          ) : (
            <ConversationList conversations={conversations} selectedId={null} onSelect={handleSelect} onNewChat={() => setShowNewChat(true)} />
          )}
        </div>
      )}

      <NewChatDialog open={showNewChat} onClose={() => setShowNewChat(false)} onCreate={handleNewChat} />
    </>
  );
};

export default FloatingChat;
