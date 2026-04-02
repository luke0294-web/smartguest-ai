import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "wouter";
import GuestChat, {
  type GuestChatEmbeddedDemo,
  DEMO_USER_MESSAGE_LIMIT,
} from "./guest";

/** Sent on demo chat POST; must stay compatible with API demo handling. */
const DEMO_CITY_ID = "roma" as const;

/** Shown in GuestChat header (must match listing identity). */
const DEMO_PROPERTY_DISPLAY_NAME = "La Bellezza di Roma";

function buildEmbeddedProperty(): GuestChatEmbeddedDemo["property"] {
  return {
    id: 0,
    slug: "demo",
    name: DEMO_PROPERTY_DISPLAY_NAME,
    content: `Benvenuti a ${DEMO_PROPERTY_DISPLAY_NAME}! Questa è una proprietà demo di SmartGuest AI.`,
    whatsappNumber: "+390000000000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function DemoPage() {
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

  const embedded: GuestChatEmbeddedDemo = useMemo(
    () => ({
      property: buildEmbeddedProperty(),
      cityId: DEMO_CITY_ID,
      parentHandlesLimitCta: true,
      onDemoUserMessageCountChange,
      onDemoFlowLockedChange,
      compactHeight: true,
    }),
    [onDemoUserMessageCountChange, onDemoFlowLockedChange],
  );

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
              Hai visto come funziona Marco? 🎉
            </p>
            <p className="mt-2 text-[13px] sm:text-sm font-medium leading-relaxed text-amber-950/95">
              Attiva SmartGuest AI nella tua struttura e smetti di rispondere sempre alle stesse domande!
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
        <GuestChat key="demo" embeddedDemo={embedded} />
      </div>
    </div>
  );
}
