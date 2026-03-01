import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plus, Users, User } from 'lucide-react';
import { Conversation } from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

const ConversationList = ({ conversations, selectedId, onSelect, onNewChat }: Props) => {
  const { user } = useAuth();

  const getConversationName = (conv: Conversation) => {
    if (conv.type === 'group') return conv.name || 'مجموعة';
    const other = conv.participants?.find(p => p.worker_id !== user?.id);
    return other?.worker?.full_name || 'محادثة';
  };

  const getLastMessage = (conv: Conversation) => {
    const msgs = conv.messages;
    if (!msgs.length) return 'لا توجد رسائل';
    const last = msgs[msgs.length - 1];
    if (last.type !== 'text') {
      const types: Record<string, string> = { image: '📷 صورة', video: '🎥 فيديو', audio: '🎤 صوت', file: '📎 ملف' };
      return types[last.type] || '📎 مرفق';
    }
    return last.content.length > 40 ? last.content.slice(0, 40) + '...' : last.content;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-bold text-lg">المحادثات</h3>
        <Button size="icon" variant="ghost" onClick={onNewChat}>
          <Plus className="h-5 w-5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            لا توجد محادثات بعد
          </div>
        ) : (
          conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full p-3 flex items-center gap-3 text-right hover:bg-accent/50 transition-colors border-b ${
                selectedId === conv.id ? 'bg-accent' : ''
              }`}
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {conv.type === 'group' ? <Users className="h-5 w-5" /> : <User className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">{getConversationName(conv)}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ar })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground truncate">{getLastMessage(conv)}</span>
                  {(conv.unread_count || 0) > 0 && (
                    <Badge variant="destructive" className="h-5 min-w-[20px] text-[10px] shrink-0">
                      {conv.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </ScrollArea>
    </div>
  );
};

export default ConversationList;
