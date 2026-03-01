import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Image, Mic, Paperclip, ArrowRight, Play, Pause } from 'lucide-react';
import { Conversation, ChatMessage } from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Props {
  conversation: Conversation;
  onSend: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  onUpload: (file: File) => Promise<string>;
  onBack?: () => void;
}

const ChatView = ({ conversation, onSend, onUpload, onBack }: Props) => {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.messages]);

  const getConversationName = () => {
    if (conversation.type === 'group') return conversation.name || 'مجموعة';
    const other = conversation.participants?.find(p => p.worker_id !== user?.id);
    return other?.worker?.full_name || 'محادثة';
  };

  const handleSendText = () => {
    if (!text.trim() || !user) return;
    onSend({ sender_id: user.id, sender_name: user.full_name, content: text.trim(), type: 'text' });
    setText('');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsSending(true);
    try {
      const url = await onUpload(file);
      let type: ChatMessage['type'] = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';
      
      onSend({ sender_id: user.id, sender_name: user.full_name, content: file.name, type, media_url: url, media_name: file.name });
    } finally {
      setIsSending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        setIsSending(true);
        try {
          const url = await onUpload(file);
          if (user) {
            onSend({ sender_id: user.id, sender_name: user.full_name, content: 'رسالة صوتية', type: 'audio', media_url: url });
          }
        } finally {
          setIsSending(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      console.error('Microphone access denied');
    }
  };

  const renderMessage = (msg: ChatMessage) => {
    const isMine = msg.sender_id === user?.id;

    return (
      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
        <div className={`max-w-[80%] ${isMine ? 'order-1' : 'order-2'}`}>
          {!isMine && (
            <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.sender_name}</p>
          )}
          <div className={`rounded-2xl px-3 py-2 ${
            isMine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'
          }`}>
            {msg.type === 'text' && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
            {msg.type === 'image' && (
              <img src={msg.media_url} alt="" className="rounded-lg max-w-full max-h-60 cursor-pointer" onClick={() => window.open(msg.media_url, '_blank')} />
            )}
            {msg.type === 'video' && (
              <video src={msg.media_url} controls className="rounded-lg max-w-full max-h-60" />
            )}
            {msg.type === 'audio' && (
              <audio src={msg.media_url} controls className="max-w-full" />
            )}
            {msg.type === 'file' && (
              <a href={msg.media_url} target="_blank" rel="noopener" className="flex items-center gap-2 text-sm underline">
                <Paperclip className="h-4 w-4" /> {msg.media_name || msg.content}
              </a>
            )}
          </div>
          <p className={`text-[9px] text-muted-foreground mt-0.5 px-1 ${isMine ? 'text-left' : 'text-right'}`}>
            {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true, locale: ar })}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-2">
        {onBack && (
          <Button size="icon" variant="ghost" onClick={onBack} className="shrink-0">
            <ArrowRight className="h-5 w-5" />
          </Button>
        )}
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {getConversationName().charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-sm">{getConversationName()}</p>
          {conversation.type === 'group' && (
            <p className="text-[10px] text-muted-foreground">
              {conversation.participants?.length} عضو
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3">
        {conversation.messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-10">ابدأ المحادثة الآن</div>
        ) : (
          conversation.messages.map(renderMessage)
        )}
        <div ref={scrollRef} />
      </ScrollArea>

      {/* Input */}
      <div className="p-2 border-t flex items-center gap-1">
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" />
        <Button size="icon" variant="ghost" onClick={() => fileRef.current?.click()} disabled={isSending} className="shrink-0">
          <Image className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant={isRecording ? 'destructive' : 'ghost'}
          onClick={toggleRecording}
          disabled={isSending}
          className="shrink-0"
        >
          <Mic className="h-5 w-5" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendText()}
          placeholder="اكتب رسالة..."
          className="flex-1 text-sm"
          disabled={isSending || isRecording}
        />
        <Button size="icon" onClick={handleSendText} disabled={!text.trim() || isSending} className="shrink-0">
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default ChatView;
