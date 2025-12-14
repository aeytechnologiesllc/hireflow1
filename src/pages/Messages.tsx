import { useState, useEffect, useRef } from "react";
import { useConversations, useMessages, useSendMessage, useMarkAsRead } from "@/hooks/useMessages";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Search, Send } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isYesterday } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

function formatMessageDate(date: Date) {
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

export default function Messages() {
  const { user } = useAuth();
  const { data: conversations, isLoading: isLoadingConversations } = useConversations();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const { data: messages, isLoading: isLoadingMessages } = useMessages(selectedContactId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations?.find((c) => c.contact_id === selectedContactId);

  const filteredConversations = conversations?.filter((conv) => {
    const name = conv.contact_profile?.full_name?.toLowerCase() || "";
    const email = conv.contact_profile?.email?.toLowerCase() || "";
    return name.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
  });

  // Mark messages as read when conversation is selected
  useEffect(() => {
    if (messages && selectedContactId && user) {
      const unreadMessageIds = messages
        .filter((m) => !m.is_read && m.receiver_id === user.id)
        .map((m) => m.id);
      
      if (unreadMessageIds.length > 0) {
        markAsRead.mutate(unreadMessageIds);
      }
    }
  }, [messages, selectedContactId, user]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedContactId) return;

    try {
      await sendMessage.mutateAsync({
        receiver_id: selectedContactId,
        content: newMessage.trim(),
      });
      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const getInitials = (profile: any) => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase();
    }
    return profile?.email?.[0]?.toUpperCase() || "?";
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Conversations List */}
      <Card className="w-80 flex-shrink-0 bg-card border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground mb-3">Messages</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search conversations..." 
              className="pl-10 bg-background border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          {isLoadingConversations ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : filteredConversations && filteredConversations.length > 0 ? (
            <div className="p-2">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.contact_id}
                  onClick={() => setSelectedContactId(conv.contact_id)}
                  className={cn(
                    "w-full p-3 rounded-lg flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left",
                    selectedContactId === conv.contact_id && "bg-secondary"
                  )}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {getInitials(conv.contact_profile)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-foreground truncate">
                        {conv.contact_profile?.full_name || conv.contact_profile?.email || "Unknown"}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatMessageDate(new Date(conv.last_message.created_at))}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.last_message.content}
                    </p>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5">
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No conversations yet
            </div>
          )}
        </ScrollArea>
      </Card>

      {/* Chat Area */}
      <Card className="flex-1 bg-card border-border flex flex-col">
        {selectedContactId ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {getInitials(selectedConversation?.contact_profile)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-foreground">
                  {selectedConversation?.contact_profile?.full_name || 
                   selectedConversation?.contact_profile?.email || 
                   "Unknown"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedConversation?.contact_profile?.email}
                </p>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {isLoadingMessages ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-3/4" />
                  <Skeleton className="h-12 w-1/2 ml-auto" />
                  <Skeleton className="h-12 w-2/3" />
                </div>
              ) : messages && messages.length > 0 ? (
                <div className="space-y-4">
                  {messages.map((message) => {
                    const isMine = message.sender_id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={cn("flex", isMine ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[70%] rounded-lg px-4 py-2",
                            isMine
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          )}
                        >
                          <p className="text-sm">{message.content}</p>
                          <p className={cn(
                            "text-xs mt-1",
                            isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {format(new Date(message.created_at), "h:mm a")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No messages yet. Start the conversation!
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  className="bg-background border-border"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                />
                <Button 
                  onClick={handleSend} 
                  disabled={!newMessage.trim() || sendMessage.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Select a conversation</h3>
              <p className="text-muted-foreground max-w-md">
                Choose a conversation from the list to start messaging.
              </p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
