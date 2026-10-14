import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useGetProperty, getGetPropertyQueryKey } from "@workspace/api-client-react";
import GuestChat, {
  type GuestChatEmbeddedDemo,
  DEMO_USER_MESSAGE_LIMIT,
} from "./guest";

/** Sent on demo chat POST; must stay compatible with API demo handling. */
const DEMO_CITY_ID = "roma" as const;

/** Shown in GuestChat header (must match listing identity). */
const DEMO_PROPERTY_DISPLAY_NAME = "La Bellezza di Roma";

function buildStaticDemoProperty(): GuestChatEmbeddedDemo["property"] {
  return {
    id: 0,
    slug: "demo",
    name: DEMO_PROPERTY_DISPLAY_NAME,
    content: `Benvenuti a ${DEMO_PROPERTY_DISPLAY_NAME}! Questa è una proprietà demo di HeyCico.`,
    whatsappNumber: "+390000000000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

type DemoPageProps = {
  /** Present only on the personalized route (/demo/:slug — see App.tsx). */
  params?: { slug?: string };
};

/**
 * /demo — always the static, generic HeyCico demo listing.
 * /demo/:slug — a personalized demo, pre-loaded with real facts about a
 * specific outreach prospect's property (see CEO panel "Demo" tab), used to
 * hook them with a curiosity question in the outreach message.
 */
export default function DemoPage({ params }: DemoPageProps) {
  const rawSlug = params?.slug?.trim() || undefined;
  // Only personalized demos ("demo-…") belong here: any other slug would load a
  // real host's property inside the demo shell (real WhatsApp number, messages
  // landing in that host's Diario) — show the "not available" view instead.
  const isValidPersonalizedSlug = Boolean(rawSlug?.startsWith("demo-"));
  const personalizedSlug = isValidPersonalizedSlug ? rawSlug : undefined;

  const {
    data: personalizedProperty,
    isLoading: isPersonalizedLoading,
    isError: isPersonalizedError,
    error: personalizedError,
    refetch: refetchPersonalized,
    isFetching: isPersonalizedFetching,
  } = useGetProperty(personalizedSlug ?? "", {
    query: {
      queryKey: getGetPropertyQueryKey(personalizedSlug ?? ""),
      enabled: Boolean(personalizedSlug),
    },
  });

  /** User messages only; synced from GuestChat (welcome bubble excluded). */
  const [demoUserMessageCount, setDemoUserMessageCount] = useState(0);
  /** True when chat is locked (demo cap, 429, or sessionStorage); shows CTA even if count is under cap. */
  const [demoFlowLocked, setDemoFlowLocked] = useState(false);

  const onDemoUserMessageCountChange = useCallback((count: number) => {
    setDemoUserMessageCount(count);
  }, []);

  const onDemoFlowLockedChange = useCallback((locked: boolean) => {
    setDemoFlowLocked(locked);
  }, []);

  const embedded: GuestChatEmbeddedDemo | undefined = useMemo(() => {
    if (personalizedSlug) {
      if (!personalizedProperty) return undefined;
      return {
        property: {
          id: personalizedProperty.id,
          slug: personalizedProperty.slug,
          name: personalizedProperty.name,
          content: personalizedProperty.content,
          whatsappNumber: personalizedProperty.whatsappNumber,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        cityId: DEMO_CITY_ID,
        parentHandlesLimitCta: true,
        onDemoUserMessageCountChange,
        onDemoFlowLockedChange,
        compactHeight: true,
      };
    }
    return {
      property: buildStaticDemoProperty(),
      cityId: DEMO_CITY_ID,
      parentHandlesLimitCta: true,
      onDemoUserMessageCountChange,
      onDemoFlowLockedChange,
      compactHeight: true,
    };
  }, [personalizedSlug, personalizedProperty, onDemoUserMessageCountChange, onDemoFlowLockedChange]);

  if (personalizedSlug && isPersonalizedLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  // Only a 404 means the demo is really gone: a cold start, a 5xx or a network
  // hiccup used to show "non più disponibile" for a demo that still exists —
  // the prospect would close the tab. Offer a retry for those instead.
  const personalizedErrorStatus =
    personalizedError && typeof personalizedError === "object"
      ? (personalizedError as { status?: number }).status
      : undefined;
  if (personalizedSlug && isPersonalizedError && personalizedErrorStatus !== 404) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-lg font-semibold">Non riesco a caricare la demo in questo momento.</p>
        <p className="text-sm text-muted-foreground">Controlla la connessione e riprova tra qualche secondo.</p>
        <button
          type="button"
          onClick={() => void refetchPersonalized()}
          disabled={isPersonalizedFetching}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isPersonalizedFetching ? "Caricamento…" : "Riprova"}
        </button>
      </div>
    );
  }

  if ((rawSlug && !isValidPersonalizedSlug) || (personalizedSlug && (isPersonalizedError || !embedded))) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-lg font-semibold">Questa demo non è più disponibile.</p>
        <Link href="/demo" className="text-blue-600 underline">
          Prova la demo generale di HeyCico →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto w-full bg-background">
      <AnimatePresence>
        {(demoUserMessageCount >= DEMO_USER_MESSAGE_LIMIT || demoFlowLocked) && (
          <motion.div
            key="demo-limit-cta"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0 mx-3 mt-3 mb-2 rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-amber-100 to-amber-50 px-5 py-4 text-amber-950 shadow-lg shadow-amber-900/15 ring-2 ring-amber-200/80"
          >
            <p className="text-base sm:text-lg font-bold leading-snug tracking-tight">
              Hai visto come funziona Cico? 🎉
            </p>
            <p className="mt-2 text-[13px] sm:text-sm font-medium leading-relaxed text-amber-950/95">
              Attiva HeyCico nella tua struttura e smetti di rispondere sempre alle stesse domande!
            </p>
            <Link
              href="/#lead-form"
              className="mt-4 inline-flex w-full sm:w-auto justify-center items-center gap-1 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-amber-700"
            >
              Inizia gratis →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 flex flex-col">
        <GuestChat key={personalizedSlug ?? "demo"} embeddedDemo={embedded} />
      </div>
    </div>
  );
}
