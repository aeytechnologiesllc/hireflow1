import { useState, useEffect, useRef } from "react";
import { useConversations, useMessages, useSendMessage, useMarkAsRead, useMessageableEmployers, useMessageableCandidates, useDeleteConversation } from "@/hooks/useMessages";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Search, Plus, Briefcase, Trash2, EyeOff, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isYesterday } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { MessageComposer } from "@/components/messages/MessageComposer";
import { FileMessage } from "@/components/messages/FileMessage";

function formatMessageDate(date: Date) {
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

export default function Messages() {
  const { user, role, isTeamMember } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const isCandidate = role === "candidate";
  const isEmployer = role === "employer";
  const canMessageCandidates = !isTeamMember || permissions?.canMessageCandidates;
  const { data: conversations, isLoading: isLoadingConversations } = useConversations();
  const { data: messageableEmployers } = useMessageableEmployers();
  const { data: messageableCandidates } = useMessageableCandidates();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewConversation, setShowNewConversation] = useState(false);
  const { data: messages, isLoading: isLoadingMessages } = useMessages(selectedContactId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const deleteConversation = useDeleteConversation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations?.find((c) => c.contact_id === selectedContactId);
  // For new conversations, find employer info (for candidates)
  const selectedEmployer = messageableEmployers?.find((e) => e.employer_id === selectedContactId);
  // For new conversations, find candidate info (for employers)
  const selectedCandidate = messageableCandidates?.find((c) => c.candidate_id === selectedContactId);

  const filteredConversations = conversations?.filter((conv) => {
    const name = conv.contact_profile?.full_name?.toLowerCase() || "";
    const email = conv.contact_profile?.email?.toLowerCase() || "";
    return name.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
  });

  const handleDeleteConversation = async () => {
    if (!selectedContactId) return;
    try {
      await deleteConversation.mutateAsync(selectedContactId);
      setSelectedContactId(null);
      toast.success("Conversation deleted");
    } catch (error) {
      toast.error("Failed to delete conversation");
    }
  };

  // Get employers the candidate can message but hasn't yet
  const newEmployerOptions = messageableEmployers?.filter(
    (emp) => !conversations?.some((c) => c.contact_id === emp.employer_id)
  ) || [];

  // Get candidates the employer can message but hasn't yet
  const newCandidateOptions = messageableCandidates?.filter(
    (cand) => !conversations?.some((c) => c.contact_id === cand.candidate_id)
  ) || [];

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

  const handleSend = async (content: string, file?: File) => {
    if ((!content.trim() && !file) || !selectedContactId) return;

    try {
      await sendMessage.mutateAsync({
        receiver_id: selectedContactId,
        content: content.trim(),
        application_id: selectedEmployer?.application_id || selectedCandidate?.application_id,
        file,
      });
      setShowNewConversation(false);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    }
  };

  const handleStartNewConversation = (contactId: string) => {
    setSelectedContactId(contactId);
    setShowNewConversation(false);
  };

  const getInitials = (profile: any) => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase();
    }
    return profile?.email?.[0]?.toUpperCase() || "?";
  };

  const getContactName = () => {
    if (selectedConversation?.contact_profile) {
      return selectedConversation.contact_profile.full_name || selectedConversation.contact_profile.email || "Unknown";
    }
    if (selectedEmployer?.employer_profile) {
      return selectedEmployer.employer_profile.company_name || selectedEmployer.employer_profile.full_name || selectedEmployer.employer_profile.email || "Employer";
    }
    return "Unknown";
  };

  const getContactEmail = () => {
    return selectedConversation?.contact_profile?.email || selectedEmployer?.employer_profile?.email || "";
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Conversations List */}
      <Card className="w-80 flex-shrink-0 bg-card border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            {isTeamMember && !canMessageCandidates && (
              <Badge variant="outline" className="gap-1 text-muted-foreground text-xs">
                <EyeOff className="h-3 w-3" />
                Read Only
              </Badge>
            )}
            <h2 className="text-lg font-semibold text-foreground">Messages</h2>
            
            {/* Plus button for candidates */}
            {isCandidate && newEmployerOptions.length > 0 && (
              <Dialog open={showNewConversation} onOpenChange={setShowNewConversation}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Start New Conversation</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 mt-4">
                    <p className="text-sm text-muted-foreground mb-4">
                      Select an employer to message about your application:
                    </p>
                    {newEmployerOptions.map((emp) => (
                      <button
                        key={emp.employer_id}
                        onClick={() => handleStartNewConversation(emp.employer_id)}
                        className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left border border-border"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                            {getInitials(emp.employer_profile)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {emp.employer_profile?.company_name || emp.employer_profile?.full_name || emp.employer_profile?.email || "Employer"}
                          </p>
                          <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {emp.job_title}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* Plus button for employers */}
            {isEmployer && newCandidateOptions.length > 0 && (
              <Dialog open={showNewConversation} onOpenChange={setShowNewConversation}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Start New Conversation</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 mt-4 overflow-y-auto flex-1">
                    <p className="text-sm text-muted-foreground mb-4">
                      Select an applicant to message:
                    </p>
                    {newCandidateOptions.map((cand) => (
                      <button
                        key={`${cand.candidate_id}-${cand.application_id}`}
                        onClick={() => handleStartNewConversation(cand.candidate_id)}
                        className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left border border-border"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                            {getInitials(cand.candidate_profile)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {cand.candidate_profile?.full_name || cand.candidate_profile?.email || "Candidate"}
                          </p>
                          <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            Applied for: {cand.job_title}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
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
                      {conv.last_message && (
                        <span className="text-xs text-muted-foreground">
                          {formatMessageDate(new Date(conv.last_message.created_at))}
                        </span>
                      )}
                    </div>
                    {conv.last_message && (
                      <p className="text-sm text-muted-foreground truncate">
                        {conv.last_message.content}
                      </p>
                    )}
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5">
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (isCandidate && newEmployerOptions.length > 0) || (isEmployer && newCandidateOptions.length > 0) ? (
            <div className="p-8 text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">No conversations yet</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewConversation(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Start a Conversation
              </Button>
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
                  {getInitials(selectedConversation?.contact_profile || selectedEmployer?.employer_profile)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  {getContactName()}
                </p>
                <p className="text-sm text-muted-foreground">
                  {getContactEmail()}
                </p>
              </div>
              {selectedEmployer && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Briefcase className="h-4 w-4" />
                  <span>{selectedEmployer.job_title}</span>
                </div>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this entire conversation? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleDeleteConversation}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
                          {/* File attachment */}
                          {message.file_url && message.file_name && message.file_type && (
                            <div className="mb-2">
                              <FileMessage
                                fileUrl={message.file_url}
                                fileName={message.file_name}
                                fileType={message.file_type}
                                fileSize={message.file_size || undefined}
                                isMine={isMine}
                              />
                            </div>
                          )}
                          {/* Text content - only show if not just "Sent a file:" */}
                          {message.content && !message.content.startsWith("Sent a file:") && (
                            <p className="text-sm">{message.content}</p>
                          )}
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
              {isTeamMember && !canMessageCandidates ? (
                <div className="text-center py-2 text-muted-foreground text-sm">
                  You don't have permission to send messages
                </div>
              ) : (
                <MessageComposer
                  onSend={handleSend}
                  isPending={sendMessage.isPending}
                />
              )}
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
