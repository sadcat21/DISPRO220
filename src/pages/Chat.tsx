import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChat } from '@/hooks/useChat';
import ConversationList from '@/components/chat/ConversationList';
import ChatView from '@/components/chat/ChatView';
import NewChatDialog from '@/components/chat/NewChatDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2 } from 'lucide-react';

const Chat = () => {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const { conversations, sendMessage, createConversation, markAsRead, uploadMedia } = useChat();
  const selectedConv = conversations.find(c => c.id === selectedConvId);

  const handleSelect = (id: string) => {
    setSelectedConvId(id);
    markAsRead(id);
  };

  const handleNewChat = async (type: 'direct' | 'group', participantIds: string[], name?: string) => {
    const result = await createConversation.mutateAsync({ type, participantIds, name });
    if (result) {
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedConvId(result.id);
    }
  };

  // Mobile: show either list or chat
  if (isMobile) {
    return (
      <div className="h-[calc(100vh-120px)]">
        {selectedConvId && !selectedConv ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : selectedConv ? (
          <ChatView
            conversation={selectedConv}
            onSend={(msg) => sendMessage.mutate({ conversationId: selectedConv.id, message: msg })}
            onUpload={uploadMedia}
            onBack={() => setSelectedConvId(null)}
          />
        ) : (
          <ConversationList
            conversations={conversations}
            selectedId={null}
            onSelect={handleSelect}
            onNewChat={() => setShowNewChat(true)}
          />
        )}
        <NewChatDialog open={showNewChat} onClose={() => setShowNewChat(false)} onCreate={handleNewChat} />
      </div>
    );
  }

  // Desktop: side-by-side
  return (
    <div className="h-[calc(100vh-120px)] flex border rounded-xl overflow-hidden">
      <div className="w-80 border-l">
        <ConversationList
          conversations={conversations}
          selectedId={selectedConvId}
          onSelect={handleSelect}
          onNewChat={() => setShowNewChat(true)}
        />
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
          <div className="h-full flex items-center justify-center text-muted-foreground">
            اختر محادثة أو ابدأ محادثة جديدة
          </div>
        )}
      </div>
      <NewChatDialog open={showNewChat} onClose={() => setShowNewChat(false)} onCreate={handleNewChat} />
    </div>
  );
};

export default Chat;
