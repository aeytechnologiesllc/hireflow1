import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Phone, PhoneOff, Loader2, X, MessageSquare, Lock, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAvaVoice } from "@/hooks/useAvaVoice";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const { subscription, limits, usage, getVoiceAccessState, getVoiceMinutesRemaining, createCheckoutSession } = useSubscription();
  const pricing = usePricing();
  const [isOpen, setIsOpen] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<ToolAction[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isUpgrading, setIsUpgrading] = useState(false);

  const voiceAccessState = getVoiceAccessState();
  const voiceMinutesRemaining = getVoiceMinutesRemaining();

  const handleTranscript = useCallback((text: string, role: "user" | "assistant") => {
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === role) {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: m.content + text } : m
        );
      }
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

  const handleButtonClick = () => {
    if (voiceAccessState === 'locked' || voiceAccessState === 'exhausted' || voiceAccessState === 'expired') {
      setShowUpgradeDialog(true);
    } else {
      setIsOpen(!isOpen);
    }
  };

  const handleToggle = () => {
    if (isConnected) {
      disconnect();
    } else {
      if (voiceAccessState === 'trial') {
        toast.info(`Voice trial active - ${formatMinutes(voiceMinutesRemaining)} remaining`);
      }
      connect();
    }
  };

  const handleSendText = () => {
    if (textInput.trim()) {
      sendTextMessage(textInput.trim());
      setTextInput("");
    }
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const result = await createCheckoutSession.mutateAsync({
        planType: 'enterprise',
        countryCode: pricing.countryCode,
        interval: 'monthly',
      });
      if (result?.url) {
        window.open(result.url, '_blank');
      }
    } catch (err) {
      toast.error('Failed to start checkout');
    } finally {
      setIsUpgrading(false);
      setShowUpgradeDialog(false);
    }
  };

  const formatMinutes = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get button styling based on access state
  const getButtonStyles = () => {
    switch (voiceAccessState) {
      case 'full':
        return isConnected
          ? "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 shadow-emerald-500/30"
          : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-purple-500/30";
      case 'trial':
        return isConnected
          ? "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 shadow-emerald-500/30"
          : "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-blue-500/30";
      case 'exhausted':
        return "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/30";
      case 'locked':
      case 'expired':
      default:
        return "bg-muted/80 hover:bg-muted text-muted-foreground shadow-none";
    }
  };

  const getButtonIcon = () => {
    if (voiceAccessState === 'locked' || voiceAccessState === 'expired') {
      return <Lock className="h-6 w-6" />;
    }
    if (voiceAccessState === 'exhausted') {
      return <Clock className="h-6 w-6" />;
    }
    if (isConnecting) {
      return <Loader2 className="h-6 w-6 animate-spin text-white" />;
    }
    if (isConnected) {
      return <Mic className={cn("h-6 w-6 text-white", isListening && "animate-pulse")} />;
    }
    return <MessageSquare className="h-6 w-6 text-white" />;
  };

  const enterprisePrice = pricing.enterprise.monthlyFormatted;

  return (
    <>
      {/* Floating Button */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Button
          onClick={handleButtonClick}
          className={cn(
            "h-14 w-14 rounded-full shadow-lg transition-all duration-300 relative",
            getButtonStyles(),
            isSpeaking && voiceAccessState !== 'locked' && "animate-pulse"
          )}
        >
          {getButtonIcon()}
        </Button>

        {/* Trial minutes remaining badge */}
        {voiceAccessState === 'trial' && !isConnected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg"
          >
            {formatMinutes(voiceMinutesRemaining)}
          </motion.div>
        )}

        {/* Exhausted badge */}
        {voiceAccessState === 'exhausted' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg"
          >
            0:00
          </motion.div>
        )}

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

      {/* Expanded Panel - Only show for users with access */}
      <AnimatePresence>
        {isOpen && (voiceAccessState === 'full' || voiceAccessState === 'trial') && (
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
                      : voiceAccessState === 'trial'
                      ? "bg-gradient-to-r from-blue-500 to-cyan-500"
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
                      : voiceAccessState === 'trial'
                      ? `Trial: ${formatMinutes(voiceMinutesRemaining)} left`
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

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {voiceAccessState === 'exhausted' ? (
                <>
                  <Clock className="h-5 w-5 text-amber-500" />
                  Voice Trial Minutes Exhausted
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  Unlock AVA Voice Assistant
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {voiceAccessState === 'exhausted'
                ? "Your 5-minute voice trial has ended. Upgrade to Enterprise for 500 voice minutes per month."
                : "Get access to AVA Voice Assistant with the Enterprise plan."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <h4 className="font-semibold text-lg mb-2">Enterprise Plan</h4>
              <p className="text-2xl font-bold text-primary mb-3">
                {enterprisePrice}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  500 Voice Minutes/month
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  AVA Voice Assistant for hiring queries
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Voice Interviews with candidates
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  All Business features included
                </li>
              </ul>
            </div>

            <Button
              onClick={handleUpgrade}
              disabled={isUpgrading}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {isUpgrading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                "Upgrade to Enterprise"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
