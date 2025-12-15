import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Phone, PhoneOff, Loader2, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAvaVoice } from "@/hooks/useAvaVoice";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ToolAction {
  id: string;
  tool: string;
  result: any;
  timestamp: Date;
}

export default function AvaVoiceButton() {
  const { subscription, limits } = useSubscription();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<ToolAction[]>([]);
  const [textInput, setTextInput] = useState("");

  // Check if user has voice features (enterprise plan)
  const hasVoiceAccess = (subscription?.plan_type as string) === "enterprise" && subscription?.status === "active";
  const handleTranscript = useCallback((text: string, role: "user" | "assistant") => {
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      // If same role, append to existing message
      if (lastMsg && lastMsg.role === role) {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: m.content + text } : m
        );
      }
      // New message
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          role,
          content: text,
          timestamp: new Date(),
        },
      ];
    });
  }, []);

  const handleToolCall = useCallback((toolName: string, result: any) => {
    setActions((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        tool: toolName,
        result,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const {
    isConnected,
    isConnecting,
    isSpeaking,
    isListening,
    error,
    connect,
    disconnect,
    sendTextMessage,
  } = useAvaVoice({
    mode: "assistant",
    onTranscript: handleTranscript,
    onToolCall: handleToolCall,
  });

  const handleToggle = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  const handleSendText = () => {
    if (textInput.trim()) {
      sendTextMessage(textInput.trim());
      setTextInput("");
    }
  };

  // Don't render if no voice access
  if (!hasVoiceAccess) {
    return null;
  }

  return (
    <>
      {/* Floating Button */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "h-14 w-14 rounded-full shadow-lg transition-all duration-300",
            isConnected
              ? "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 shadow-emerald-500/30"
              : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-purple-500/30",
            isSpeaking && "animate-pulse"
          )}
        >
          {isConnecting ? (
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          ) : isConnected ? (
            <Mic className={cn("h-6 w-6 text-white", isListening && "animate-pulse")} />
          ) : (
            <MessageSquare className="h-6 w-6 text-white" />
          )}
        </Button>

        {/* Voice activity indicator */}
        {isConnected && (isSpeaking || isListening) && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={cn(
              "absolute -top-1 -right-1 h-4 w-4 rounded-full",
              isSpeaking ? "bg-emerald-400" : "bg-blue-400",
              "animate-pulse"
            )}
          />
        )}
      </motion.div>

      {/* Expanded Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-96 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-purple-500/10 to-pink-500/10">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    isConnected
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : "bg-gradient-to-r from-purple-500 to-pink-500"
                  )}
                >
                  <span className="text-white font-bold text-sm">AVA</span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">AVA Voice Assistant</h3>
                  <p className="text-xs text-muted-foreground">
                    {isConnected
                      ? isSpeaking
                        ? "Speaking..."
                        : isListening
                        ? "Listening..."
                        : "Connected"
                      : "Disconnected"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="h-64 p-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">
                    {isConnected
                      ? "Start speaking or type a message"
                      : "Click the button below to connect"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {/* Show actions */}
                  {actions.slice(-3).map((action) => (
                    <div
                      key={action.id}
                      className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 border border-border"
                    >
                      <span className="font-medium text-primary">{action.tool}</span>
                      {action.result?.count !== undefined && (
                        <span className="ml-1">→ {action.result.count}</span>
                      )}
                      {action.result?.success && (
                        <span className="ml-1 text-emerald-400">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-border">
              {/* Text input */}
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Type a message..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                  disabled={!isConnected}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  onClick={handleSendText}
                  disabled={!isConnected || !textInput.trim()}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </div>

              {/* Voice controls */}
              <Button
                onClick={handleToggle}
                disabled={isConnecting}
                className={cn(
                  "w-full gap-2",
                  isConnected
                    ? "bg-destructive hover:bg-destructive/90"
                    : "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500"
                )}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : isConnected ? (
                  <>
                    <PhoneOff className="h-4 w-4" />
                    End Call
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4" />
                    Start Voice Call
                  </>
                )}
              </Button>

              {error && (
                <p className="text-xs text-destructive mt-2 text-center">{error}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
