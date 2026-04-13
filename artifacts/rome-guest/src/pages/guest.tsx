import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Send, Home, Loader2, Sparkles, AlertCircle, KeyRound } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
// Chat: use custom mutation + sendPropertyChatSse — Orval `useSendPropertyChat` does not pass onStreamDelta.
import {
  getGetPropertyQueryKey,
  useGetProperty,
  sendPropertyChatSse,
  type ChatMessageRequest,
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";

// ── Type Definitions ────────────────────────────────────────────────────────

/** When set, property comes from parent (e.g. /demo) — no GET /properties/:slug. */
export type GuestChatEmbeddedDemo = {
  property: {
    id: number | string;
    slug: string;
    name: string;
    content: string;
    whatsappNumber: string | null;
    createdAt: string;
    updatedAt: string;
  };
  /** Sent as `city` on POST /api/properties/demo/chat */
  cityId: string;
  /** Parent shows limit CTA (e.g. amber banner) instead of in-chat signup bubble */
  parentHandlesLimitCta?: boolean;
  /** Synced on every change; counts only `user` messages (excludes welcome bubble). */
  onDemoUserMessageCountChange?: (userMessageCount: number) => void;
  /** True when demo input is locked (demo message cap, 429, or sessionStorage lock). */
  onDemoFlowLockedChange?: (locked: boolean) => void;
  /** Fill parent flex column instead of fixed 100dvh */
  compactHeight?: boolean;
};

type GuestChatProps = {
  params?: { slug?: string };
  embeddedDemo?: GuestChatEmbeddedDemo;
};

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  /** Assistant message is receiving SSE deltas */
  streaming?: boolean;
  /** Limit-reached CTA (demo only): plain text + signup link in UI */
  demoCta?: boolean;
}

/** Public demo (/demo embed + /guest/demo): max user turns per session; must match API demo cap. */
export const DEMO_USER_MESSAGE_LIMIT = 12;
const DEMO_CTA_ASSISTANT_TEXT_IT =
  "Hai raggiunto il limite di messaggi per la demo. Registrati gratis per creare il tuo portiere virtuale!";

/** Demo chat: backend returns 429 when the demo message cap is hit — lock UI on any 429. */
function isDemoChat429(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { status?: number }).status === 429);
}

function marcoWelcomedStorageKey(slug: string): string {
  return `marco_welcomed_${slug}`;
}

function readMarcoWelcomed(slug: string): boolean {
  if (!slug) return false;
  try {
    return sessionStorage.getItem(marcoWelcomedStorageKey(slug)) === "1";
  } catch {
    return false;
  }
}

function persistMarcoWelcomed(slug: string): void {
  if (!slug) return;
  try {
    sessionStorage.setItem(marcoWelcomedStorageKey(slug), "1");
  } catch {
    /* ignore */
  }
}

const ASSISTANT_MARKDOWN_PLUGINS = [rehypeSanitize];

const assistantMarkdownComponents = {
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800 font-medium"
      {...props}
    >
      {children}
    </a>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-bold" {...props}>
      {children}
    </strong>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-2 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-2 space-y-1.5 pl-1 list-none" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-2 space-y-1.5 pl-4 list-decimal" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-snug pl-0" {...props}>
      {children}
    </li>
  ),
} satisfies Components;

// ── UI Localization ─────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "it", flag: "🇮🇹", native: "Italiano" },
  { code: "en", flag: "🇬🇧", native: "English" },
  { code: "de", flag: "🇩🇪", native: "Deutsch" },
  { code: "fr", flag: "🇫🇷", native: "Français" },
  { code: "es", flag: "🇪🇸", native: "Español" },
  { code: "nl", flag: "🇳🇱", native: "Nederlands" },
  { code: "zh", flag: "🇨🇳", native: "中文" },
  { code: "ja", flag: "🇯🇵", native: "日本語" },
  { code: "ko", flag: "🇰🇷", native: "한국어" },
  { code: "pt", flag: "🇧🇷", native: "Português" },
  { code: "pl", flag: "🇵🇱", native: "Polski" },
] as const;

const TRANSLATIONS = {
  it: {
    placeholder: "Scrivi la tua domanda...",
    send: "Invia",
    typing: "Cico sta scrivendo",
    onlineStatus: "Cico è online",
    loading: "Caricamento assistente...",
    notFound: "Proprietà non trovata",
    notFoundDesc: "L'appartamento che stai cercando non esiste o il link non è corretto.",
    goToPanel: "Vai al Pannello",
    welcome: (name: string) => "Benvenuti a " + name + "! Sono Cico, come posso aiutarvi oggi? 👋",
    errorMsg: "Scusa, c'è stato un errore di connessione. Riprova tra poco.",
    helpBtn: "Aiuto",
    whatsappDefault: (name: string) => `Ciao, sono un ospite di ${name} e avrei bisogno di assistenza diretta`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "Qual è la password del WiFi?" },
      { label: "🍕 Ristoranti", question: "Quali ristoranti o posti per mangiare consigli nei dintorni?" },
      { label: "🗑️ Rifiuti", question: "Come funziona la raccolta differenziata?" },
      { label: "🕒 Check-out", question: "A che ora è il check-out?" },
    ],
    arrivalTitle: "Inizia da qui",
    arrivalButtons: [
      { label: "🔑 Come entro?", question: "🔑 Come entro?" },
      { label: "📶 Password Wi-Fi", question: "📶 Password Wi-Fi" },
      { label: "📍 Posizione casa", question: "📍 Posizione casa" },
    ],
    checkoutBtn: { label: "🧳 Sto partendo", question: "voglio fare il check-out" },
  },
  en: {
    placeholder: "Type your question here...",
    send: "Send",
    typing: "Cico is typing",
    onlineStatus: "Cico is online",
    loading: "Loading assistant...",
    notFound: "Property not found",
    notFoundDesc: "The accommodation you're looking for doesn't exist or the link is incorrect.",
    goToPanel: "Go to Panel",
    welcome: (name: string) => `Welcome to ${name}! I'm Cico, how can I help you today? 👋`,
    errorMsg: "Sorry, there was a connection error. Please try again.",
    helpBtn: "Help",
    whatsappDefault: (name: string) => `Hello, I'm a guest at ${name} and I need direct assistance`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "What is the WiFi password?" },
      { label: "🍕 Restaurants", question: "What restaurants or places to eat do you recommend nearby?" },
      { label: "🗑️ Recycling", question: "How does the waste/recycling system work?" },
      { label: "🕒 Check-out", question: "What time is check-out?" },
    ],
    arrivalTitle: "Start here",
    arrivalButtons: [
      { label: "🔑 How do I get in?", question: "How do I get into the property?" },
      { label: "📶 Wi-Fi password", question: "What is the Wi-Fi password?" },
      { label: "📍 Property location", question: "What is the address or location of the property?" },
    ],
    checkoutBtn: { label: "🧳 I'm leaving", question: "I want to check out" },
  },
  de: {
    placeholder: "Ihre Frage hier eingeben...",
    send: "Senden",
    typing: "Cico schreibt",
    onlineStatus: "Cico ist online",
    loading: "Assistent wird geladen...",
    notFound: "Unterkunft nicht gefunden",
    notFoundDesc: "Die gesuchte Unterkunft existiert nicht oder der Link ist falsch.",
    goToPanel: "Zum Panel",
    welcome: (name: string) => `Willkommen in ${name}! Ich bin Cico, wie kann ich Ihnen helfen? 👋`,
    errorMsg: "Entschuldigung, es gab einen Verbindungsfehler. Bitte versuchen Sie es erneut.",
    helpBtn: "Hilfe",
    whatsappDefault: (name: string) => `Hallo, ich bin ein Gast in ${name} und benötige direkte Hilfe`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WLAN", question: "Was ist das WLAN-Passwort?" },
      { label: "🍕 Restaurants", question: "Welche Restaurants empfehlen Sie in der Nähe?" },
      { label: "🗑️ Müll", question: "Wie funktioniert die Mülltrennung?" },
      { label: "🕒 Check-out", question: "Um wie viel Uhr ist der Check-out?" },
    ],
    arrivalTitle: "Hier starten",
    arrivalButtons: [
      { label: "🔑 Wie komme ich rein?", question: "Wie komme ich in die Unterkunft?" },
      { label: "📶 WLAN-Passwort", question: "Wie lautet das WLAN-Passwort?" },
      { label: "📍 Adresse", question: "Wie lautet die Adresse oder der Standort der Unterkunft?" },
    ],
    checkoutBtn: { label: "🧳 Ich reise ab", question: "Ich möchte auschecken" },
  },
  fr: {
    placeholder: "Écrivez votre question ici...",
    send: "Envoyer",
    typing: "Cico est en train d'écrire",
    onlineStatus: "Cico est en ligne",
    loading: "Chargement de l'assistant...",
    notFound: "Propriété introuvable",
    notFoundDesc: "Le logement que vous recherchez n'existe pas ou le lien est incorrect.",
    goToPanel: "Panneau de contrôle",
    welcome: (name: string) => `Bienvenue à ${name}! Je suis Cico, comment puis-je vous aider? 👋`,
    errorMsg: "Désolé, une erreur de connexion s'est produite. Veuillez réessayer.",
    helpBtn: "Aide",
    whatsappDefault: (name: string) => `Bonjour, je suis un hôte de ${name} et j'ai besoin d'assistance directe`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "Quel est le mot de passe WiFi?" },
      { label: "🍕 Restaurants", question: "Quels restaurants recommandez-vous aux alentours ?" },
      { label: "🗑️ Déchets", question: "Comment fonctionne le tri des déchets?" },
      { label: "🕒 Check-out", question: "À quelle heure est le check-out?" },
    ],
    arrivalTitle: "Commencez ici",
    arrivalButtons: [
      { label: "🔑 Comment entrer ?", question: "Comment entrer dans le logement ?" },
      { label: "📶 Mot de passe Wi-Fi", question: "Quel est le mot de passe Wi-Fi ?" },
      { label: "📍 Adresse du logement", question: "Quelle est l'adresse ou l'emplacement du logement ?" },
    ],
    checkoutBtn: { label: "🧳 Je pars", question: "je souhaite faire le check-out" },
  },
  es: {
    placeholder: "Escribe tu pregunta aquí...",
    send: "Enviar",
    typing: "Cico está escribiendo",
    onlineStatus: "Cico está en línea",
    loading: "Cargando asistente...",
    notFound: "Propiedad no encontrada",
    notFoundDesc: "El alojamiento que buscas no existe o el enlace es incorrecto.",
    goToPanel: "Ir al Panel",
    welcome: (name: string) => `¡Bienvenido a ${name}! Soy Cico, ¿cómo puedo ayudarte hoy? 👋`,
    errorMsg: "Lo siento, hubo un error de conexión. Por favor, inténtalo de nuevo.",
    helpBtn: "Ayuda",
    whatsappDefault: (name: string) => `Hola, soy un huésped de ${name} y necesito asistencia directa`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "¿Cuál es la contraseña del WiFi?" },
      { label: "🍕 Restaurantes", question: "¿Qué restaurantes o lugares para comer recomiendas cerca?" },
      { label: "🗑️ Basura", question: "¿Cómo funciona la recogida de basura?" },
      { label: "🕒 Check-out", question: "¿A qué hora es el check-out?" },
    ],
    arrivalTitle: "Empieza aquí",
    arrivalButtons: [
      { label: "🔑 ¿Cómo entro?", question: "¿Cómo entro en el alojamiento?" },
      { label: "📶 Contraseña Wi-Fi", question: "¿Cuál es la contraseña del Wi-Fi?" },
      { label: "📍 Ubicación", question: "¿Cuál es la dirección o ubicación del alojamiento?" },
    ],
    checkoutBtn: { label: "🧳 Me voy", question: "quiero hacer el check-out" },
  },
  nl: {
    placeholder: "Typ hier uw vraag...",
    send: "Versturen",
    typing: "Cico typt",
    onlineStatus: "Cico is online",
    loading: "Assistent laden...",
    notFound: "Accommodatie niet gevonden",
    notFoundDesc: "De accommodatie die u zoekt bestaat niet of de link is onjuist.",
    goToPanel: "Naar het paneel",
    welcome: (name: string) => `Welkom bij ${name}! Ik ben Cico, hoe kan ik u vandaag helpen? 👋`,
    errorMsg: "Sorry, er is een verbindingsfout opgetreden. Probeer het opnieuw.",
    helpBtn: "Hulp",
    whatsappDefault: (name: string) => `Hallo, ik ben een gast bij ${name} en heb directe hulp nodig`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "Wat is het WiFi-wachtwoord?" },
      { label: "🍕 Restaurants", question: "Welke restaurants raad je aan in de buurt?" },
      { label: "🗑️ Afval", question: "Hoe werkt de afvalscheiding?" },
      { label: "🕒 Check-out", question: "Hoe laat is het check-out?" },
    ],
    arrivalTitle: "Begin hier",
    arrivalButtons: [
      { label: "🔑 Hoe kom ik naar binnen?", question: "Hoe kom ik de accommodatie binnen?" },
      { label: "📶 Wi-Fi-wachtwoord", question: "Wat is het Wi-Fi-wachtwoord?" },
      { label: "📍 Locatie", question: "Wat is het adres of de locatie van de accommodatie?" },
    ],
    checkoutBtn: { label: "🧳 Ik vertrek", question: "ik wil uitchecken" },
  },
  zh: {
    placeholder: "在这里输入您的问题...",
    send: "发送",
    typing: "Cico 正在输入",
    onlineStatus: "Cico 在线",
    loading: "正在加载助手...",
    notFound: "未找到房源",
    notFoundDesc: "您正在寻找的住所不存在或链接不正确。",
    goToPanel: "前往管理面板",
    welcome: (name: string) => `欢迎来到 ${name}！我是 Cico，今天有什么可以帮助您的？👋`,
    errorMsg: "抱歉，发生了连接错误，请稍后重试。",
    helpBtn: "帮助",
    whatsappDefault: (name: string) => `您好，我是 ${name} 的住客，需要直接帮助`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "WiFi密码是什么？" },
      { label: "🍕 餐厅", question: "您推荐附近有哪些餐厅？" },
      { label: "🗑️ 垃圾分类", question: "如何进行垃圾分类？" },
      { label: "🕒 退房", question: "退房时间是几点？" },
    ],
    arrivalTitle: "从这里开始",
    arrivalButtons: [
      { label: "🔑 如何进门？", question: "我如何进入房源？" },
      { label: "📶 Wi-Fi 密码", question: "Wi-Fi 密码是什么？" },
      { label: "📍 房源位置", question: "房源的地址或位置在哪里？" },
    ],
    checkoutBtn: { label: "🧳 我要退房", question: "我要办理退房" },
  },
  ja: {
    placeholder: "ご質問をここに入力してください...",
    send: "送信",
    typing: "Cicoが入力中",
    onlineStatus: "Cicoはオンライン",
    loading: "アシスタントを読み込み中...",
    notFound: "物件が見つかりません",
    notFoundDesc: "お探しの宿泊先は存在しないか、リンクが正しくありません。",
    goToPanel: "パネルへ",
    welcome: (name: string) => `${name}へようこそ！私はCicoです。本日はどのようにお手伝いできますか？👋`,
    errorMsg: "申し訳ありません、接続エラーが発生しました。もう一度お試しください。",
    helpBtn: "ヘルプ",
    whatsappDefault: (name: string) => `こんにちは、${name}のゲストです。直接サポートが必要です`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "WiFiのパスワードは何ですか？" },
      { label: "🍕 レストラン", question: "近くのおすすめのレストランはどこですか？" },
      { label: "🗑️ ゴミ分別", question: "ゴミの分別はどうすればいいですか？" },
      { label: "🕒 チェックアウト", question: "チェックアウトは何時ですか？" },
    ],
    arrivalTitle: "ここから",
    arrivalButtons: [
      { label: "🔑 入り方は？", question: "物件にどうやって入りますか？" },
      { label: "📶 Wi-Fi パスワード", question: "Wi-Fiのパスワードは何ですか？" },
      { label: "📍 住所・場所", question: "物件の住所または場所を教えてください" },
    ],
    checkoutBtn: { label: "🧳 出発します", question: "チェックアウトしたいです" },
  },
  ko: {
    placeholder: "질문을 여기에 입력하세요...",
    send: "보내기",
    typing: "Cico가 입력 중",
    onlineStatus: "Cico 온라인",
    loading: "어시스턴트 로딩 중...",
    notFound: "숙소를 찾을 수 없음",
    notFoundDesc: "찾으시는 숙소가 존재하지 않거나 링크가 올바르지 않습니다.",
    goToPanel: "패널로 이동",
    welcome: (name: string) => `${name}에 오신 것을 환영합니다! 저는 Cico입니다. 오늘 무엇을 도와드릴까요? 👋`,
    errorMsg: "죄송합니다. 연결 오류가 발생했습니다. 다시 시도해 주세요.",
    helpBtn: "도움말",
    whatsappDefault: (name: string) => `안녕하세요, 저는 ${name}의 투숙객입니다. 직접 도움이 필요합니다`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "WiFi 비밀번호가 무엇인가요?" },
      { label: "🍕 레스토랑", question: "근처에 추천할 만한 식당이 있나요?" },
      { label: "🗑️ 쓰레기 분리", question: "쓰레기 분리수거는 어떻게 하나요?" },
      { label: "🕒 체크아웃", question: "체크아웃은 몇 시인가요?" },
    ],
    arrivalTitle: "여기서 시작",
    arrivalButtons: [
      { label: "🔑 들어가는 방법", question: "숙소에 어떻게 들어가나요?" },
      { label: "📶 Wi-Fi 비밀번호", question: "Wi-Fi 비밀번호가 무엇인가요?" },
      { label: "📍 위치", question: "숙소 주소나 위치를 알려주세요" },
    ],
    checkoutBtn: { label: "🧳 체크아웃", question: "체크아웃하고 싶어요" },
  },
  pt: {
    placeholder: "Digite sua pergunta aqui...",
    send: "Enviar",
    typing: "Cico está digitando",
    onlineStatus: "Cico está online",
    loading: "Carregando assistente...",
    notFound: "Propriedade não encontrada",
    notFoundDesc: "A acomodação que você procura não existe ou o link está incorreto.",
    goToPanel: "Ir para o Painel",
    welcome: (name: string) => `Bem-vindo(a) a ${name}! Sou o Cico, como posso ajudá-lo(a) hoje? 👋`,
    errorMsg: "Desculpe, ocorreu um erro de conexão. Por favor, tente novamente.",
    helpBtn: "Ajuda",
    whatsappDefault: (name: string) => `Olá, sou hóspede em ${name} e preciso de assistência direta`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "Qual é a senha do WiFi?" },
      { label: "🍕 Restaurantes", question: "Quais restaurantes você recomenda por perto?" },
      { label: "🗑️ Lixo", question: "Como funciona a coleta seletiva de lixo?" },
      { label: "🕒 Check-out", question: "A que horas é o check-out?" },
    ],
    arrivalTitle: "Comece aqui",
    arrivalButtons: [
      { label: "🔑 Como entro?", question: "Como entro na acomodação?" },
      { label: "📶 Senha do Wi-Fi", question: "Qual é a senha do Wi-Fi?" },
      { label: "📍 Localização", question: "Qual é o endereço ou localização da acomodação?" },
    ],
    checkoutBtn: { label: "🧳 Estou saindo", question: "quero fazer o check-out" },
  },
  pl: {
    placeholder: "Wpisz swoje pytanie tutaj...",
    send: "Wyślij",
    typing: "Cico pisze",
    onlineStatus: "Cico jest online",
    loading: "Ładowanie asystenta...",
    notFound: "Nie znaleziono nieruchomości",
    notFoundDesc: "Szukane zakwaterowanie nie istnieje lub link jest nieprawidłowy.",
    goToPanel: "Przejdź do panelu",
    welcome: (name: string) => `Witamy w ${name}! Jestem Cico, jak mogę Ci dzisiaj pomóc? 👋`,
    errorMsg: "Przepraszamy, wystąpił błąd połączenia. Spróbuj ponownie.",
    helpBtn: "Pomoc",
    whatsappDefault: (name: string) => `Cześć, jestem gościem w ${name} i potrzebuję bezpośredniej pomocy`,
    powered: "Powered by HeyCico",
    quickReplies: [
      { label: "🔑 WiFi", question: "Jakie jest hasło do WiFi?" },
      { label: "🍕 Restauracje", question: "Jakie restauracje polecasz w pobliżu?" },
      { label: "🗑️ Śmieci", question: "Jak działa segregacja śmieci?" },
      { label: "🕒 Check-out", question: "O której jest check-out?" },
    ],
    arrivalTitle: "Zacznij tutaj",
    arrivalButtons: [
      { label: "🔑 Jak wejść?", question: "Jak wejść do obiektu?" },
      { label: "📶 Hasło Wi-Fi", question: "Jakie jest hasło do Wi-Fi?" },
      { label: "📍 Lokalizacja", question: "Jaki jest adres lub lokalizacja obiektu?" },
    ],
    checkoutBtn: { label: "🧳 Wyjeżdżam", question: "chcę się wymeldować" },
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

export default function GuestChat(props: GuestChatProps = {}) {
  const { params: routeParams, embeddedDemo } = props;
  const wouterParams = useParams<{ slug: string }>();
  const params = routeParams ?? wouterParams;
  const slug = embeddedDemo?.property.slug ?? params?.slug ?? "";
  const isDemo = slug === "demo";

  const {
    data: fetchedProperty,
    isLoading: fetchLoading,
    isError: fetchError,
    error: fetchPropertyError,
  } = useGetProperty(slug, {
    query: {
      queryKey: getGetPropertyQueryKey(slug),
      enabled: !embeddedDemo && Boolean(slug),
    },
  });
  const property = embeddedDemo?.property ?? fetchedProperty;
  const isPropertyLoading = embeddedDemo ? false : fetchLoading;
  const isPropertyError = embeddedDemo ? false : fetchError;

  const parentHandlesDemoLimitCta = Boolean(embeddedDemo?.parentHandlesLimitCta);

  const [lang, setLang] = useState<Lang>(resolveInitialLang);
  const t = TRANSLATIONS[lang];

  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  type GuestChatMutationVars = {
    slug: string;
    data: ChatMessageRequest;
    onStreamDelta: (text: string) => void;
  };

  const { mutate: sendMessage, isPending, reset: resetSendChatMutation } = useMutation({
    mutationKey: ["sendPropertyChat"],
    mutationFn: ({ slug: s, data, onStreamDelta }: GuestChatMutationVars) =>
      sendPropertyChatSse(s, data, onStreamDelta),
  });
  const [inputValue, setInputValue] = useState("");
  /** SSE assistant reply in flight — cursor + scroll sync; cleared on success/error (stream done). */
  const [isStreaming, setIsStreaming] = useState(false);
  const [demoChatLocked, setDemoChatLocked] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const demoStartedLoggedRef = useRef(false);
  const demoLimitReachLoggedRef = useRef(false);

  const logDemoLimitReached = useCallback(() => {
    if (demoLimitReachLoggedRef.current) return;
    demoLimitReachLoggedRef.current = true;
    console.log("demo_limit_reached");
  }, []);

  useEffect(() => {
    if (!isDemo || !property) return;
    if (demoStartedLoggedRef.current) return;
    demoStartedLoggedRef.current = true;
    console.log("demo_started");
  }, [isDemo, property]);

  // Localized welcome: when chat is empty and property is ready, inject once (messages.length === 0 guards re-runs).
  // Same for demo and real properties: t.welcome(property.name) via current lang.
  // marco_welcomed_{slug} is not used here — it only controls the large arrival UI (see showBigArrivalActions).
  useEffect(() => {
    if (!property || !slug) return;
    if (messages.length > 0) return;
    const welcomeText = TRANSLATIONS[lang].welcome(property.name);
    setMessages([{ role: "assistant", content: welcomeText }]);
  }, [property, slug, messages.length, lang]);

  const handleLangChange = (newLang: Lang) => {
    try { localStorage.setItem(STORAGE_KEY, newLang); } catch {}
    const previousLang = lang;
    setLang(newLang);
    if (property) {
      setMessages((prev) => {
        if (prev.length === 0 || prev[0].role !== "assistant") return prev;
        const hasUser = prev.some((m) => m.role === "user");
        const oldWelcome = TRANSLATIONS[previousLang].welcome(property.name);
        const firstIsLocalizedWelcome = prev[0].content === oldWelcome;
        if (!hasUser || firstIsLocalizedWelcome) {
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
  }, [messages, isPending, isStreaming]);

  const historyForApi = (msgs: ConversationMessage[]) =>
    msgs.map(({ role, content }) => ({ role, content }));

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const demoFlowLocked =
    isDemo &&
    (demoChatLocked || userMessageCount >= DEMO_USER_MESSAGE_LIMIT);

  const lastMessage = messages[messages.length - 1];
  const streamingTextStarted =
    lastMessage?.role === "assistant" &&
    Boolean(lastMessage.streaming) &&
    lastMessage.content.length > 0;
  /** Hide "Cico typing" once streamed text appears in the assistant bubble (not before first token). */
  const showSeparateTypingIndicator = isPending && !streamingTextStarted;

  useEffect(() => {
    if (!isDemo || !slug) return;
    try {
      if (sessionStorage.getItem(`demo_locked_${slug}`) === "true") {
        setDemoChatLocked(true);
      }
    } catch {}
  }, [isDemo, slug]);

  useEffect(() => {
    if (!isDemo || !slug || !demoFlowLocked) return;
    try {
      sessionStorage.setItem(`demo_locked_${slug}`, "true");
    } catch {}
  }, [isDemo, slug, demoFlowLocked]);

  const onDemoUserMessageCountChange = embeddedDemo?.onDemoUserMessageCountChange;
  useEffect(() => {
    if (!isDemo || !onDemoUserMessageCountChange) return;
    onDemoUserMessageCountChange(userMessageCount);
  }, [isDemo, onDemoUserMessageCountChange, userMessageCount]);

  const onDemoFlowLockedChange = embeddedDemo?.onDemoFlowLockedChange;
  useEffect(() => {
    if (!isDemo || !onDemoFlowLockedChange) return;
    onDemoFlowLockedChange(demoFlowLocked);
  }, [isDemo, onDemoFlowLockedChange, demoFlowLocked]);

  const handleSend = (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || isPending || !slug || demoFlowLocked) return;
    if (isDemo && userMessageCount === 0) {
      console.log("demo_first_message");
    }
    persistMarcoWelcomed(slug);
    setInputValue("");
    const updatedMessages: ConversationMessage[] = [
      ...messages,
      { role: "user", content: userMsg },
    ];
    setMessages(updatedMessages);
    const chatPayload: ChatMessageRequest = {
      message: userMsg,
      conversationHistory: historyForApi(messages),
      language: lang,
    };
    if (isDemo && embeddedDemo?.cityId) {
      chatPayload.city = embeddedDemo.cityId;
    }
    sendMessage(
      {
        slug,
        data: chatPayload,
        onStreamDelta: (text) => {
          if (!text) return;
          setIsStreaming(true);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && last.streaming) {
              next[next.length - 1] = { ...last, content: last.content + text };
            } else {
              next.push({ role: "assistant", content: text, streaming: true });
            }
            return next;
          });
        },
      },
      {
        onSuccess: (data) => {
          setIsStreaming(false);
          const clean = (data.reply ?? "").trim();
          setMessages((prev) => {
            const next: ConversationMessage[] = [...prev];
            const lastIdx = next.length - 1;
            const last = next[lastIdx];
            if (last?.role === "assistant" && last.streaming) {
              const { streaming: _st, ...rest } = last;
              next[lastIdx] = {
                ...rest,
                content: clean,
              };
            } else {
              next.push({
                role: "assistant",
                content: clean,
              });
            }
            const users = next.filter((m) => m.role === "user").length;
            if (isDemo && users >= DEMO_USER_MESSAGE_LIMIT) {
              logDemoLimitReached();
              if (!parentHandlesDemoLimitCta) {
                next.push({
                  role: "assistant",
                  content: DEMO_CTA_ASSISTANT_TEXT_IT,
                  demoCta: true,
                });
              }
            }
            return next;
          });
        },
        onError: (err: unknown) => {
          setIsStreaming(false);
          if (isDemo && isDemoChat429(err)) {
            logDemoLimitReached();
            setDemoChatLocked(true);
            try {
              sessionStorage.setItem(`demo_locked_${slug}`, "true");
            } catch {}
            resetSendChatMutation();
            setMessages((prev) => {
              const copy = [...prev];
              if (copy.length && copy[copy.length - 1]?.streaming) copy.pop();
              if (copy.length && copy[copy.length - 1]?.role === "user") copy.pop();
              if (parentHandlesDemoLimitCta) return copy;
              return [
                ...copy,
                { role: "assistant", content: DEMO_CTA_ASSISTANT_TEXT_IT, demoCta: true },
              ];
            });
            return;
          }
          const marcoMsg: string | undefined =
            err && typeof err === "object" && "data" in err
              ? (err as { data?: { reply?: string } }).data?.reply
              : undefined;
          const content = (marcoMsg ?? t.errorMsg).trim();
          setMessages((prev) => {
            const copy = [...prev];
            if (copy.length && copy[copy.length - 1]?.streaming) copy.pop();
            return [...copy, { role: "assistant", content }];
          });
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
    const detail =
      fetchPropertyError instanceof Error ? fetchPropertyError.message.trim() : "";
    return (
      <div className="flex h-[100dvh] items-center justify-center p-6">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-2">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground">{t.notFound}</h1>
          <p className="text-muted-foreground">{detail || t.notFoundDesc}</p>
          <Link href="/ceo" className="mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
            {t.goToPanel}
          </Link>
        </div>
      </div>
    );
  }

  const hasUserMessage = messages.some((m) => m.role === "user");
  const localizedWelcomeText = t.welcome(property.name);
  const hasArrivalWelcomeBubble =
    messages.length > 0 &&
    messages[0].role === "assistant" &&
    messages[0].content === localizedWelcomeText;
  const marcoWelcomedStored = readMarcoWelcomed(slug);
  /** Large 🔑📶📍 strip: only before user has chatted in this session; marco_welcomed hides it on refresh. */
  const showBigArrivalActions =
    !hasUserMessage &&
    !marcoWelcomedStored &&
    (hasArrivalWelcomeBubble || messages.length === 0);
  /** Quick replies row: after welcome exists, after first user msg, or return visit (welcomed flag). */
  const showQuickRepliesBar = messages.length > 0 || marcoWelcomedStored;

  const checkoutBtnDef = t.checkoutBtn;
  const checkoutLabel =
    typeof checkoutBtnDef === "object" && checkoutBtnDef !== null && "label" in checkoutBtnDef
      ? checkoutBtnDef.label
      : "🧳 Sto partendo";
  const checkoutQuestionText =
    typeof checkoutBtnDef === "object" && checkoutBtnDef !== null && "question" in checkoutBtnDef
      ? checkoutBtnDef.question
      : "voglio fare il check-out";

  const defaultWhatsappMessage = encodeURIComponent(t.whatsappDefault(property.name));
  const whatsappUrl = property.whatsappNumber
    ? `https://wa.me/${property.whatsappNumber.replace(/[^0-9]/g, "")}?text=${defaultWhatsappMessage}`
    : "#";

  const rootHeightClass = embeddedDemo?.compactHeight
    ? "flex-1 min-h-0 h-full"
    : "h-[100dvh]";

  return (
    <div
      className={`flex flex-col w-full max-w-2xl mx-auto overflow-x-hidden md:py-6 md:px-4 ${rootHeightClass}`}
    >
      <div className="flex flex-col h-full chat-container md:rounded-3xl overflow-hidden relative">

        {/* ── Header ── */}
        <header className="px-4 py-3 flex items-start sm:items-center justify-between gap-2 chat-header border-b border-white/10 sticky top-0 z-10">
          {/* Left: property name + status */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shadow-inner flex-shrink-0 mt-0.5 sm:mt-0">
              <Home className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-sans text-sm sm:text-base font-semibold text-white tracking-tight whitespace-normal leading-snug line-clamp-2 break-words">
                {property.name}
              </h1>
              <p className="text-[10px] sm:text-[11px] text-white/70 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {t.onlineStatus}
              </p>
              {isDemo && (
                <span className="inline-flex mt-1 text-[8px] sm:text-[9px] font-medium tracking-wide text-white/40 px-1.5 py-px rounded-md bg-white/[0.07] border border-white/10">
                  Modalità demo
                </span>
              )}
            </div>
          </div>

          {/* Right: language selector + WhatsApp + host panel */}
          <div className="flex items-center gap-1.5 flex-shrink-0">

            {/* Language selector */}
            <div className="relative">
              <select
                value={lang}
                onChange={(e) => handleLangChange(e.target.value as Lang)}
                aria-label="Select language"
                className="appearance-none bg-white/15 hover:bg-white/25 text-white text-[12px] font-semibold pl-2 pr-6 py-1.5 rounded-full cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 border border-white/20"
                style={{ backgroundImage: "none" }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} style={{ color: "#111", background: "#fff" }}>
                    {l.flag} {l.native}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/70"
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
                onClick={
                  isDemo
                    ? (e) => {
                        e.preventDefault();
                        toast({
                          title: "Contatto diretto 💬",
                          description:
                            "Nella versione reale, i tuoi ospiti ti contatteranno direttamente sul tuo numero WhatsApp con un solo clic!",
                          duration: 4000,
                          className:
                            "mx-auto w-full max-w-md [&_[toast-close]]:opacity-100 [&_[toast-close]]:pointer-events-auto",
                        });
                      }
                    : undefined
                }
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all shadow-md shadow-emerald-900/30"
                title={t.helpBtn}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t.helpBtn}
              </a>
            )}

            {/* Host panel link (hidden on public demo) */}
            {!isDemo && (
              <Link
                href={`/host/${slug}`}
                className="p-2 text-white/40 hover:text-white/70 transition-colors rounded-full hover:bg-white/10"
                title="Host Panel"
              >
                <KeyRound className="w-4 h-4" />
              </Link>
            )}
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
                    C
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
                      {msg.role === "assistant" ? (
                    <>
                      {msg.demoCta ? (
                        <div className="font-sans break-words text-sm sm:text-base space-y-3">
                          <p className="mb-0">{msg.content}</p>
                          <Link
                            href="/signup"
                            onClick={() => {
                              console.log("demo_signup_click");
                            }}
                            className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-[13px] px-4 py-2.5 shadow-md hover:opacity-95 transition-opacity"
                          >
                            Crea il tuo assistente
                          </Link>
                        </div>
                      ) : (
                        <div
                          className={[
                            "markdown-content font-sans break-words text-sm sm:text-base",
                            msg.streaming ? "markdown-streaming-container" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <ReactMarkdown
                            rehypePlugins={ASSISTANT_MARKDOWN_PLUGINS}
                            components={assistantMarkdownComponents}
                          >
                            {msg.content}
                          </ReactMarkdown>
                          {msg.streaming && isStreaming ? (
                            <span className="typing-cursor" aria-hidden />
                          ) : null}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap font-sans">{msg.content}</p>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Typing indicator (hidden while the streaming assistant bubble is visible) */}
            {showSeparateTypingIndicator && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex justify-start items-end gap-2"
              >
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-primary">
                  C
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

        {/* ── Arrival quick actions (🔑 📶 📍 only; hidden after reload once marco_welcomed_{slug}) ── */}
        <AnimatePresence>
          {showBigArrivalActions && (
            <motion.div
              key="arrival-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="px-4 pt-2 pb-2 border-t border-black/5 border-opacity-50"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center mb-2">
                {t.arrivalTitle}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {t.arrivalButtons.map((item) => (
                  <motion.button
                    key={item.label}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleSend(item.question)}
                    disabled={isPending || demoFlowLocked}
                    className="rounded-2xl bg-white/90 text-foreground border border-primary/15 shadow-sm shadow-black/5 hover:bg-white hover:border-primary/30 active:scale-[0.99] disabled:opacity-40 text-[13px] sm:text-sm font-semibold py-3 px-3 text-center transition-colors"
                  >
                    {item.label}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Quick Replies (chat state only: after welcome or return visit) ── */}
        {showQuickRepliesBar && (
          <motion.div
            key={lang}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={[
              "flex flex-row w-full max-w-full overflow-x-auto whitespace-nowrap gap-2 px-4 pt-2 pb-2 mb-2 items-center",
              "[&::-webkit-scrollbar]:hidden",
              "[-ms-overflow-style:none]",
              "[scrollbar-width:none]",
            ].join(" ")}
          >
            {t.quickReplies.map((qr) => (
              <button
                key={`${lang}-${qr.label}`}
                type="button"
                onClick={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.blur();
                  el.style.backgroundColor = "";
                  handleSend(qr.question);
                }}
                disabled={isPending || demoFlowLocked}
                className="quick-reply-btn shrink-0 whitespace-nowrap text-[13px] font-medium px-3.5 py-2 rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {qr.label}
              </button>
            ))}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.blur();
                  el.style.backgroundColor = "";
                  handleSend(checkoutQuestionText);
                }}
                disabled={isPending || demoFlowLocked}
                className="quick-reply-btn quick-reply-btn-checkout shrink-0 whitespace-nowrap text-[13px] font-medium px-3.5 py-2 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {checkoutLabel}
              </button>
            )}
          </motion.div>
        )}

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
              disabled={isPending || demoFlowLocked}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isPending || demoFlowLocked}
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
          {isDemo &&
            userMessageCount >= DEMO_USER_MESSAGE_LIMIT - 5 &&
            userMessageCount < DEMO_USER_MESSAGE_LIMIT &&
            !demoFlowLocked && (
              <p className="text-center text-[12px] text-muted-foreground mt-2 px-2">
                Messaggi rimasti nella demo:{" "}
                {DEMO_USER_MESSAGE_LIMIT - userMessageCount}/{DEMO_USER_MESSAGE_LIMIT}
              </p>
            )}
          <p className="text-center text-[10px] text-muted-foreground/50 mt-2.5 uppercase tracking-widest font-sans">
            {t.powered}
          </p>
        </div>
      </div>
    </div>
  );
}