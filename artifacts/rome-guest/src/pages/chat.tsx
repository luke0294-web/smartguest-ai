import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Send, KeyRound, Home, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSendChatMessage } from "@workspace/api-client-react";
import type { ConversationMessage } from "@workspace/api-client-react/src/generated/api.schemas";

const WHATSAPP_NUMBER = "39XXXXXXXXXX";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Ciao, sono un ospite di SmartGuest AI e avrei bisogno di assistenza diretta"
);
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

const QUICK_REPLIES = [
  { label: "🔑 WiFi", question: "Qual è la password del WiFi?" },
  { label: "🚌 Centro Città", question: "Come arrivo al centro città?" },
  { label: "🗑️ Rifiuti", question: "Come funziona la raccolta differenziata?" },
  { label: "🕒 Check-out", question: "A che ora è il check-out?" },
];

export default function Chat() {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      role: "assistant",
      content:
        "Ciao! Sono Marco, il tuo assistente virtuale 👋 Come posso aiutarti? Puoi chiedermi della password WiFi, dell'orario di check-out, o qualsiasi consiglio sull'appartamento e sulla città!",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutate: sendMessage, isPending } = useSendChatMessage();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isPending]);

  const handleSend = (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || isPending) return;

    setInputValue("");

    const updatedMessages: ConversationMessage[] = [
      ...messages,
      { role: "user", content: userMsg },
    ];
    setMessages(updatedMessages);

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
              content:
                "Scusa, c'è stato un errore di connessione. Riprova tra poco.",
            },
          ]);
        },
      }
    );
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    handleSend(inputValue);
  };

  return (
    <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto md:py-6 md:px-4">
      <div className="flex flex-col h-full chat-container md:rounded-3xl overflow-hidden relative">

        {/* ── Header ── */}
        <header className="px-5 py-3.5 flex items-center justify-between chat-header border-b border-white/10 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shadow-inner">
              <Home className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-sans text-[15px] font-semibold text-white leading-none tracking-tight">
                SmartGuest AI
              </h1>
              <p className="text-[11px] text-white/70 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Marco è online
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* WhatsApp SOS */}
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all shadow-md shadow-emerald-900/30"
              title="Contatta l'host su WhatsApp"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Aiuto
            </a>

            {/* Admin access (subtle) */}
            <Link
              href="/admin"
              className="p-2 text-white/40 hover:text-white/70 transition-colors rounded-full hover:bg-white/10"
              title="Pannello Host"
            >
              <KeyRound className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* ── Messages ── */}
        <main className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0 text-[11px] font-bold text-primary">
                    M
                  </div>
                )}
                <div
                  className={`max-w-[80%] sm:max-w-[72%] px-4 py-3 text-[14.5px] leading-relaxed ${
                    msg.role === "user"
                      ? "user-bubble"
                      : "assistant-bubble"
                  }`}
                >
                  {msg.role === "assistant" && idx === 0 && (
                    <Sparkles className="w-3.5 h-3.5 text-primary mb-1.5 opacity-60" />
                  )}
                  {msg.role === "assistant" ? (
                    <div className="font-sans leading-relaxed">
                      <ReactMarkdown
                        components={{
                          strong: ({ node, children, ...props }) => (
                            <strong className="font-bold text-gray-900" {...props}>{children}</strong>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap font-sans">{msg.content}</p>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Marco sta scrivendo... */}
            {isPending && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex justify-start items-end gap-2"
              >
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-primary">
                  M
                </div>
                <div className="assistant-bubble px-4 py-3 flex items-center gap-2">
                  <span className="text-[13px] text-muted-foreground font-sans italic">
                    Marco sta scrivendo
                  </span>
                  <span className="flex gap-[3px] items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.9s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "180ms", animationDuration: "0.9s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "360ms", animationDuration: "0.9s" }} />
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} className="h-1" />
        </main>

        {/* ── Quick Replies ── */}
        <div className="px-4 pt-2 pb-1 flex gap-2 overflow-x-auto no-scrollbar">
          {QUICK_REPLIES.map((qr) => (
            <button
              key={qr.label}
              onClick={() => handleSend(qr.question)}
              disabled={isPending}
              className="quick-reply-btn flex-shrink-0 text-[13px] font-medium px-3.5 py-2 rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {qr.label}
            </button>
          ))}
        </div>

        {/* ── Input ── */}
        <div className="p-4 pt-3 chat-input-area border-t border-black/5">
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center w-full"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Scrivi la tua domanda..."
              className="chat-input w-full px-5 py-3.5 pr-14 rounded-2xl text-[14.5px] font-sans focus:outline-none transition-all"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isPending}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 send-btn rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>
          </form>
          <p className="text-center text-[10px] text-muted-foreground/50 mt-2.5 uppercase tracking-widest font-sans">
            Powered by SmartGuest AI · Marco
          </p>
        </div>
      </div>
    </div>
  );
}
