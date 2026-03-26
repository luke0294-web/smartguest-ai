import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Home, Loader2, Sparkles, AlertCircle, KeyRound } from "lucide-react";
import { useGetProperty, useSendPropertyChat } from "@workspace/api-client-react";
import type { ConversationMessage } from "@workspace/api-client-react/src/generated/api.schemas";

// ── UI Localization ─────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "it", flag: "🇮🇹", label: "IT" },
  { code: "en", flag: "🇬🇧", label: "EN" },
  { code: "fr", flag: "🇫🇷", label: "FR" },
  { code: "es", flag: "🇪🇸", label: "ES" },
  { code: "de", flag: "🇩🇪", label: "DE" },
  { code: "zh", flag: "🇨🇳", label: "ZH" },
] as const;

const TRANSLATIONS = {
  it: {
    placeholder: "Scrivi la tua domanda...",
    send: "Invia",
    typing: "Marco sta scrivendo",
    onlineStatus: "Marco è online",
    loading: "Caricamento assistente...",
    notFound: "Proprietà non trovata",
    notFoundDesc: "L'appartamento che stai cercando non esiste o il link non è corretto.",
    goToPanel: "Vai al Pannello",
    welcome: (name: string) => `Benvenuto a ${name}! Sono Marco, come posso aiutarti oggi? 👋`,
    errorMsg: "Scusa, c'è stato un errore di connessione. Riprova tra poco.",
    helpBtn: "Aiuto",
    whatsappDefault: (name: string) => `Ciao, sono un ospite di ${name} e avrei bisogno di assistenza diretta`,
    powered: "Powered by SmartGuest AI · Marco",
    quickReplies: [
      { label: "🔑 WiFi", question: "Qual è la password del WiFi?" },
      { label: "🚌 Centro Città", question: "Come arrivo al centro città?" },
      { label: "🗑️ Rifiuti", question: "Come funziona la raccolta differenziata?" },
      { label: "🕒 Check-out", question: "A che ora è il check-out?" },
    ],
  },
  en: {
    placeholder: "Type your question here...",
    send: "Send",
    typing: "Marco is typing",
    onlineStatus: "Marco is online",
    loading: "Loading assistant...",
    notFound: "Property not found",
    notFoundDesc: "The accommodation you're looking for doesn't exist or the link is incorrect.",
    goToPanel: "Go to Panel",
    welcome: (name: string) => `Welcome to ${name}! I'm Marco, how can I help you today? 👋`,
    errorMsg: "Sorry, there was a connection error. Please try again.",
    helpBtn: "Help",
    whatsappDefault: (name: string) => `Hello, I'm a guest at ${name} and I need direct assistance`,
    powered: "Powered by SmartGuest AI · Marco",
    quickReplies: [
      { label: "🔑 WiFi", question: "What is the WiFi password?" },
      { label: "🚌 City Centre", question: "How do I get to the city centre?" },
      { label: "🗑️ Recycling", question: "How does the waste/recycling system work?" },
      { label: "🕒 Check-out", question: "What time is check-out?" },
    ],
  },
  fr: {
    placeholder: "Écrivez votre question ici...",
    send: "Envoyer",
    typing: "Marco est en train d'écrire",
    onlineStatus: "Marco est en ligne",
    loading: "Chargement de l'assistant...",
    notFound: "Propriété introuvable",
    notFoundDesc: "Le logement que vous recherchez n'existe pas ou le lien est incorrect.",
    goToPanel: "Panneau de contrôle",
    welcome: (name: string) => `Bienvenue à ${name}! Je suis Marco, comment puis-je vous aider? 👋`,
    errorMsg: "Désolé, une erreur de connexion s'est produite. Veuillez réessayer.",
    helpBtn: "Aide",
    whatsappDefault: (name: string) => `Bonjour, je suis un hôte de ${name} et j'ai besoin d'assistance directe`,
    powered: "Powered by SmartGuest AI · Marco",
    quickReplies: [
      { label: "🔑 WiFi", question: "Quel est le mot de passe WiFi?" },
      { label: "🚌 Centre-ville", question: "Comment rejoindre le centre-ville?" },
      { label: "🗑️ Déchets", question: "Comment fonctionne le tri des déchets?" },
      { label: "🕒 Check-out", question: "À quelle heure est le check-out?" },
    ],
  },
  es: {
    placeholder: "Escribe tu pregunta aquí...",
    send: "Enviar",
    typing: "Marco está escribiendo",
    onlineStatus: "Marco está en línea",
    loading: "Cargando asistente...",
    notFound: "Propiedad no encontrada",
    notFoundDesc: "El alojamiento que buscas no existe o el enlace es incorrecto.",
    goToPanel: "Ir al Panel",
    welcome: (name: string) => `¡Bienvenido a ${name}! Soy Marco, ¿cómo puedo ayudarte hoy? 👋`,
    errorMsg: "Lo siento, hubo un error de conexión. Por favor, inténtalo de nuevo.",
    helpBtn: "Ayuda",
    whatsappDefault: (name: string) => `Hola, soy un huésped de ${name} y necesito asistencia directa`,
    powered: "Powered by SmartGuest AI · Marco",
    quickReplies: [
      { label: "🔑 WiFi", question: "¿Cuál es la contraseña del WiFi?" },
      { label: "🚌 Centro", question: "¿Cómo llego al centro de la ciudad?" },
      { label: "🗑️ Basura", question: "¿Cómo funciona la recogida de basura?" },
      { label: "🕒 Check-out", question: "¿A qué hora es el check-out?" },
    ],
  },
  de: {
    placeholder: "Ihre Frage hier eingeben...",
    send: "Senden",
    typing: "Marco schreibt",
    onlineStatus: "Marco ist online",
    loading: "Assistent wird geladen...",
    notFound: "Unterkunft nicht gefunden",
    notFoundDesc: "Die gesuchte Unterkunft existiert nicht oder der Link ist falsch.",
    goToPanel: "Zum Panel",
    welcome: (name: string) => `Willkommen in ${name}! Ich bin Marco, wie kann ich Ihnen helfen? 👋`,
    errorMsg: "Entschuldigung, es gab einen Verbindungsfehler. Bitte versuchen Sie es erneut.",
    helpBtn: "Hilfe",
    whatsappDefault: (name: string) => `Hallo, ich bin ein Gast in ${name} und benötige direkte Hilfe`,
    powered: "Powered by SmartGuest AI · Marco",
    quickReplies: [
      { label: "🔑 WLAN", question: "Was ist das WLAN-Passwort?" },
      { label: "🚌 Innenstadt", question: "Wie komme ich ins Stadtzentrum?" },
      { label: "🗑️ Müll", question: "Wie funktioniert die Mülltrennung?" },
      { label: "🕒 Check-out", question: "Um wie viel Uhr ist der Check-out?" },
    ],
  },
  zh: {
    placeholder: "在这里输入您的问题...",
    send: "发送",
    typing: "Marco 正在输入",
    onlineStatus: "Marco 在线",
    loading: "正在加载助手...",
    notFound: "未找到房源",
    notFoundDesc: "您正在寻找的住所不存在或链接不正确。",
    goToPanel: "前往管理面板",
    welcome: (name: string) => `欢迎来到 ${name}！我是 Marco，今天有什么可以帮助您的？👋`,
    errorMsg: "抱歉，发生了连接错误，请稍后重试。",
    helpBtn: "帮助",
    whatsappDefault: (name: string) => `您好，我是 ${name} 的住客，需要直接帮助`,
    powered: "Powered by SmartGuest AI · Marco",
    quickReplies: [
      { label: "🔑 WiFi", question: "WiFi密码是什么？" },
      { label: "🚌 市中心", question: "如何前往市中心？" },
      { label: "🗑️ 垃圾分类", question: "如何进行垃圾分类？" },
      { label: "🕒 退房", question: "退房时间是几点？" },
    ],
  },
} as const;

type Lang = keyof typeof TRANSLATIONS;
const STORAGE_KEY = "sg_guest_lang";

function resolveInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && saved in TRANSLATIONS) return saved;
  } catch {}
  const raw = (navigator.language || "en").slice(0, 2).toLowerCase();
  return (raw in TRANSLATIONS ? raw : "en") as Lang;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function GuestChat() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";

  const { data: property, isLoading: isPropertyLoading, isError: isPropertyError } = useGetProperty(slug);
  const { mutate: sendMessage, isPending } = useSendPropertyChat();

  const [lang, setLang] = useState<Lang>(resolveInitialLang);
  const t = TRANSLATIONS[lang];

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize welcome message when property loads
  useEffect(() => {
    if (property && messages.length === 0) {
      setMessages([{ role: "assistant", content: t.welcome(property.name) }]);
    }
  }, [property, messages.length, t]);

  // Persist language choice and update welcome message instantly
  const handleLangChange = (newLang: Lang) => {
    try { localStorage.setItem(STORAGE_KEY, newLang); } catch {}
    setLang(newLang);
    if (property) {
      setMessages((prev) => {
        if (prev.length > 0 && prev[0].role === "assistant") {
          return [
            { role: "assistant", content: TRANSLATIONS[newLang].welcome(property.name) },
            ...prev.slice(1),
          ];
        }
        return prev;
      });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isPending]);

  const handleSend = (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || isPending || !slug) return;
    setInputValue("");
    const updatedMessages: ConversationMessage[] = [
      ...messages,
      { role: "user", content: userMsg },
    ];
    setMessages(updatedMessages);
    sendMessage(
      { slug, data: { message: userMsg, conversationHistory: messages } },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
        },
        onError: () => {
          setMessages((prev) => [...prev, { role: "assistant", content: t.errorMsg }]);
        },
      }
    );
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    handleSend(inputValue);
  };

  if (isPropertyLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="font-medium animate-pulse">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (isPropertyError || !property) {
    return (
      <div className="flex h-[100dvh] items-center justify-center p-6">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-2">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground">{t.notFound}</h1>
          <p className="text-muted-foreground">{t.notFoundDesc}</p>
          <Link href="/ceo" className="mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
            {t.goToPanel}
          </Link>
        </div>
      </div>
    );
  }

  const defaultWhatsappMessage = encodeURIComponent(t.whatsappDefault(property.name));
  const whatsappUrl = property.whatsappNumber
    ? `https://wa.me/${property.whatsappNumber.replace(/[^0-9]/g, "")}?text=${defaultWhatsappMessage}`
    : "#";

  const currentLangMeta = LANGUAGES.find((l) => l.code === lang)!;

  return (
    <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto md:py-6 md:px-4">
      <div className="flex flex-col h-full chat-container md:rounded-3xl overflow-hidden relative">

        {/* ── Header ── */}
        <header className="px-4 py-3 flex items-center justify-between chat-header border-b border-white/10 sticky top-0 z-10">
          {/* Left: property name + status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shadow-inner flex-shrink-0">
              <Home className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-sans text-[15px] font-semibold text-white leading-none tracking-tight truncate max-w-[120px] sm:max-w-[180px]">
                {property.name}
              </h1>
              <p className="text-[11px] text-white/70 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {t.onlineStatus}
              </p>
            </div>
          </div>

          {/* Right: actions + lang selector */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Language selector */}
            <div className="relative">
              <select
                value={lang}
                onChange={(e) => handleLangChange(e.target.value as Lang)}
                aria-label="Select language"
                className="appearance-none bg-white/15 hover:bg-white/25 text-white text-[12px] font-semibold pl-2 pr-5 py-1.5 rounded-full cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 border border-white/20"
                style={{ backgroundImage: "none" }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} style={{ color: "#111", background: "#fff" }}>
                    {l.flag} {l.label}
                  </option>
                ))}
              </select>
              {/* Chevron icon */}
              <svg
                className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/70"
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>

            {/* WhatsApp button */}
            {property.whatsappNumber && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all shadow-md shadow-emerald-900/30"
                title={t.helpBtn}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t.helpBtn}
              </a>
            )}

            {/* Host panel link */}
            <Link
              href={`/host/${slug}`}
              className="p-2 text-white/40 hover:text-white/70 transition-colors rounded-full hover:bg-white/10"
              title="Host Panel"
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
                    msg.role === "user" ? "user-bubble" : "assistant-bubble"
                  }`}
                >
                  {msg.role === "assistant" && idx === 0 && (
                    <Sparkles className="w-3.5 h-3.5 text-primary mb-1.5 opacity-60" />
                  )}
                  <p className="whitespace-pre-wrap font-sans">{msg.content}</p>
                </div>
              </motion.div>
            ))}

            {/* Typing indicator */}
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
                    {t.typing}
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
          {t.quickReplies.map((qr) => (
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
          <form onSubmit={handleSubmit} className="relative flex items-center w-full">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t.placeholder}
              className="chat-input w-full px-5 py-3.5 pr-14 rounded-2xl text-[14.5px] font-sans focus:outline-none transition-all"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isPending}
              aria-label={t.send}
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
            {t.powered}
          </p>
        </div>
      </div>
    </div>
  );
}
