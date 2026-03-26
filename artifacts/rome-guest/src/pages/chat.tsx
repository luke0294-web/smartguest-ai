import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Send, KeyRound, Home, Loader2, Sparkles, MapPin, Wifi, Clock } from "lucide-react";
import { useSendChatMessage } from "@workspace/api-client-react";
import type { ConversationMessage } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "@/components/ui/button";

export default function Chat() {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      role: "assistant",
      content: "Benvenuto! Sono l'assistente virtuale del tuo appartamento. Come posso aiutarti oggi? Chiedimi pure della password del Wi-Fi, come funzionano gli elettrodomestici, o qualche consiglio su cosa visitare a Roma!",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { mutate: sendMessage, isPending } = useSendChatMessage();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isPending]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isPending) return;

    const userMsg = inputValue.trim();
    setInputValue("");
    
    // Add user message to UI immediately
    const updatedMessages: ConversationMessage[] = [
      ...messages,
      { role: "user", content: userMsg },
    ];
    setMessages(updatedMessages);

    // Filter out the initial welcome message from history if preferred, or keep it.
    // Keeping it is fine as context.
    sendMessage(
      {
        data: {
          message: userMsg,
          conversationHistory: messages,
        },
      },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: data.reply },
          ]);
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Scusa, c'è stato un errore di connessione. Riprova tra poco.",
            },
          ]);
        }
      }
    );
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
  };

  return (
    <div className="flex flex-col h-[100dvh] max-w-3xl mx-auto md:py-8 md:px-4">
      {/* App Container on Desktop, Full Screen on Mobile */}
      <div className="flex flex-col h-full bg-background/60 md:glass-panel md:rounded-3xl overflow-hidden relative shadow-2xl shadow-primary/5">
        
        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between bg-card/80 backdrop-blur-md border-b border-border/50 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-semibold text-foreground leading-none">RomeGuest AI</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Online e pronto ad aiutarti
              </p>
            </div>
          </div>
          <Link href="/host" className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-full hover:bg-primary/10">
            <KeyRound className="w-5 h-5" />
            <span className="sr-only">Accesso Host</span>
          </Link>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] px-5 py-3.5 ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-2xl rounded-tr-sm shadow-md shadow-primary/15"
                      : "bg-card text-card-foreground border border-border/60 rounded-2xl rounded-tl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "assistant" && idx === 0 && (
                    <Sparkles className="w-4 h-4 text-primary mb-2 opacity-70" />
                  )}
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              </motion.div>
            ))}
            
            {/* Loading Indicator */}
            {isPending && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-card text-card-foreground border border-border/60 rounded-2xl rounded-tl-sm shadow-sm px-5 py-4 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-2 h-2 rounded-full bg-primary/80 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} className="h-1" />
        </main>

        {/* Suggestions (only show if no user messages yet) */}
        {messages.length === 1 && (
          <div className="px-4 pb-2 flex overflow-x-auto no-scrollbar gap-2 snap-x">
            <button
              onClick={() => handleSuggestionClick("Qual è la password del Wi-Fi?")}
              className="flex-shrink-0 snap-start bg-card border border-border/50 rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:border-primary/30 transition-all flex items-center gap-2 shadow-sm"
            >
              <Wifi className="w-3.5 h-3.5" /> Wi-Fi
            </button>
            <button
              onClick={() => handleSuggestionClick("A che ora è il check-out?")}
              className="flex-shrink-0 snap-start bg-card border border-border/50 rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:border-primary/30 transition-all flex items-center gap-2 shadow-sm"
            >
              <Clock className="w-3.5 h-3.5" /> Check-out
            </button>
            <button
              onClick={() => handleSuggestionClick("Mi consigli un buon ristorante qui vicino?")}
              className="flex-shrink-0 snap-start bg-card border border-border/50 rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:border-primary/30 transition-all flex items-center gap-2 shadow-sm"
            >
              <MapPin className="w-3.5 h-3.5" /> Ristoranti
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 bg-background/80 backdrop-blur-xl border-t border-border/50">
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center w-full max-w-3xl mx-auto"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Scrivi la tua domanda qui..."
              className="w-full bg-card border border-border/80 text-foreground placeholder:text-muted-foreground px-6 py-4 rounded-full pr-14 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all shadow-sm"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isPending}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4 ml-0.5" />
              )}
            </button>
          </form>
          <div className="text-center mt-3">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              Powered by RomeGuest AI
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
