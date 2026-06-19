import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Zap,
  Globe,
  LayoutDashboard,
  CheckCircle2,
  ArrowRight,
  Shield,
  Phone,
  X,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { apiUrl } from "@/lib/apiUrl";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: (i as number) * 0.1, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const FEATURES = [
  {
    icon: Zap,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "⏱️ Meno messaggi ogni giorno",
    desc: "Cico risponde automaticamente al 90% delle domande degli ospiti.",
  },
  {
    icon: Globe,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    title: "Multilingua Automatico",
    desc: "Zero stress con ospiti stranieri: risposte perfette in ogni lingua senza che tu traduca nulla.",
  },
  {
    icon: LayoutDashboard,
    color: "text-violet-600",
    bg: "bg-violet-50",
    title: "Dashboard Host",
    desc: "Tutto in un solo posto: aggiorni il regolamento in pochi secondi e recuperi ore ogni settimana.",
  },
  {
    icon: Shield,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Filtro Anti-Stress WhatsApp",
    desc: "Meno ping sul telefono: Cico gestisce in autonomia le domande di routine; per le urgenze vere, un tap diretto verso il tuo WhatsApp.",
  },
];

/* 
const REVIEWS = [
  {
    name: "Giulia R.",
    city: "Roma",
    stars: 5,
    text: "Ho eliminato il 90% delle domande ripetitive. I miei ospiti adorano Cico.",
  },
  {
    name: "Luca M.",
    city: "Milano",
    stars: 5,
    text: "Finalmente dormo la notte. Niente più messaggi alle 2 per la password del Wi-Fi.",
  },
  {
    name: "Sara T.",
    city: "Firenze",
    stars: 5,
    text: "I miei ospiti stranieri si sentono accolti come mai prima. Vale ogni centesimo.",
  },
]; 
*/

function RegistrationModal({ onClose }: { onClose: () => void }) {
  const [hostName, setHostName] = useState("");
  const [email, setEmail] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch(apiUrl("/api/leads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName, email, propertyName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Errore durante l'invio");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message ?? "Qualcosa è andato storto. Riprova.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className={`bg-white rounded-3xl shadow-2xl w-full overflow-hidden ${success ? "max-w-lg" : "max-w-md"}`}
      >
        {!success && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-[11px] font-semibold uppercase tracking-wider mb-0.5">
                Primo mese GRATIS
              </p>
              <h2 className="text-white font-extrabold text-xl">Inizia la prova gratuita</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        <div className={success ? "p-0" : "p-6"}>
          {success ? (
            <div className="bg-slate-50 p-5 sm:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="animate-in zoom-in-95 fade-in duration-700"
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute -top-1 -right-1 sm:top-2 sm:right-2 z-10 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-600 shadow-sm"
                    aria-label="Chiudi"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-9 pt-12 sm:pt-10 flex flex-col items-center text-center gap-6 border border-slate-100/80">
                    <motion.div
                      initial={{ scale: 0.75, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 18 }}
                      className="inline-flex"
                    >
                      <motion.div
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 0.55, ease: "easeOut" }}
                        className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-xl shadow-blue-500/35 ring-4 ring-blue-100/90"
                      >
                        <CheckCircle2 className="w-14 h-14 text-white" strokeWidth={2} aria-hidden />
                      </motion.div>
                    </motion.div>
                    <div className="space-y-5 w-full max-w-md mx-auto">
                      <p className="text-slate-700 text-[15px] sm:text-[16px] leading-relaxed text-center text-balance">
                        <span className="font-bold text-slate-800 text-xl sm:text-2xl block mb-4 leading-snug">
                          Ottimo lavoro! Ci siamo quasi. 🏠✨
                        </span>
                        La registrazione di{" "}
                        <span className="font-semibold text-slate-900">{propertyName}</span> è andata a buon fine.
                        Stiamo preparando con cura il tuo pannello e il QR Code. Riceverai le credenziali a{" "}
                        <strong className="font-semibold text-blue-700">{email}</strong> non appena sarà tutto pronto.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full max-w-sm px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-blue-600/20"
                    >
                      Perfetto, grazie!
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-gray-500 text-sm mb-1">
                Inserisci i tuoi dati: ti invieremo le credenziali di accesso non appena la struttura sarà pronta.
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">Il tuo Nome</label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="es. Luca Rossi"
                  required
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="marco@esempio.it"
                  required
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">Nome della Struttura</label>
                <input
                  type="text"
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                  placeholder="es. Appartamento Centrale Roma"
                  required
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Invia Richiesta <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                Nessuna carta di credito richiesta. Cancella quando vuoi.
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    q: "Devo scaricare un'app o farla scaricare agli ospiti?",
    a: "No, nessun download richiesto! I tuoi ospiti accedono a Cico semplicemente inquadrando un QR Code o cliccando un link dal loro browser.",
  },
  {
    q: "Cosa succede se l'IA non conosce la risposta?",
    a: "Nessun problema. Cico si scuserà gentilmente e mostrerà all'ospite un comodo tasto per scriverti direttamente su WhatsApp, avvisandoti in silenzio.",
  },
  {
    q: "Posso gestire più appartamenti con un solo account?",
    a: "Certamente. Dal pannello Host puoi aggiungere tutte le tue strutture. Ognuna avrà il suo regolamento dedicato e il suo QR Code specifico.",
  },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 px-5 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 mb-3">
            Domande Frequenti
          </h2>
          <p className="text-gray-400 text-base sm:text-lg">
            Hai dubbi? Ecco le risposte più comuni.
          </p>
        </motion.div>

        <div className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i * 0.4}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-[15px] text-gray-900">
                  {item.q}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-300 ${
                    openIndex === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {openIndex === i && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-5 text-[14px] text-gray-500 leading-relaxed">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("register") === "1") {
        setShowModal(true);
        params.delete("register");
        const qs = params.toString();
        const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
        window.history.replaceState(null, "", newUrl);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans antialiased text-gray-900 overflow-x-hidden">
      <AnimatePresence>
        {showModal && <RegistrationModal key="modal" onClose={() => setShowModal(false)} />}
      </AnimatePresence>

      {/* ── Nav: brand left, actions right ── */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between px-4 sm:px-6 h-14 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <img
              src="/logo.png?v=2"
              alt="HeyCico"
              className="h-7 w-7 sm:h-8 sm:w-8 object-contain object-center flex-shrink-0"
            />
            <span className="font-bold text-[14px] sm:text-[16px] tracking-tight text-slate-900 truncate">
              HeyCico
            </span>
          </div>
          <div className="flex items-center justify-end gap-1 sm:gap-3 flex-shrink-0">
            <Link
              href="/login"
              className="text-[13px] sm:text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors px-2 py-1.5"
            >
              Accedi
            </Link>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="text-[13px] sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-colors shadow-sm shadow-blue-200 whitespace-nowrap"
            >
              <span className="sm:hidden">Inizia</span>
              <span className="hidden sm:inline">Inizia gratis</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 to-white pt-8 pb-24 px-5">
        <div className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-blue-100/60 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-24 w-[320px] h-[320px] rounded-full bg-emerald-100/50 blur-3xl" />

        <div className="relative max-w-5xl mx-auto text-center px-4">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0}
            className="inline-flex items-center gap-2 bg-blue-600/10 text-blue-700 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full mb-6 tracking-wide uppercase"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            Assistente AI per B&amp;B e Appartamenti
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.15] mb-6"
          >
            Stop ai messaggi su <span className="text-blue-600">WhatsApp</span>: l&apos;AI risponde ai tuoi ospiti{" "}
            <span className="text-blue-600">al posto tuo</span>.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="text-base sm:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed mb-10"
          >
            Risparmia ore ogni settimana, elimina le domande ripetitive e offri risposte perfette in ogni lingua
            — senza fare nulla.
          </motion.p>

          <motion.div
            id="lead-form"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="flex flex-col items-center gap-2"
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <button
                onClick={() => setShowModal(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-[15px] px-8 py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all"
              >
                Inizia gratis (30 giorni)
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link
                href="/demo?city=roma"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 bg-white text-gray-700 font-semibold text-[14px] px-6 py-4 rounded-2xl transition-all"
              >
                Vedi la demo live
              </Link>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground text-center max-w-md px-2">
              Prezzo lancio a 19€/mese
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={4}
            className="mt-10 flex justify-center text-center"
          >
            <p className="text-sm text-slate-500 max-w-md px-2">
              ✨ Unisciti ai primi 50 host fondatori
            </p>
          </motion.div>
        </div>

        {/* Mock chat preview */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={5}
          className="relative max-w-sm mx-auto mt-14"
        >
          <div className="rounded-3xl border border-gray-200 shadow-2xl shadow-gray-200/80 overflow-hidden bg-white">
            <div className="bg-blue-600 px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center p-1">
                <img src="/logo.png?v=2" alt="" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-white font-semibold text-[13px]">Appartamento Centrale</p>
                <p className="text-white/70 text-[11px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Cico è online
                </p>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] text-gray-700 max-w-[85%]">
                Benvenuto! Sono Cico 👋 Come posso aiutarti?
              </div>
              <div className="bg-blue-600 rounded-2xl rounded-tr-sm px-4 py-3 text-[13px] text-white self-end max-w-[85%]">
                What&apos;s the Wi-Fi password?
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] text-gray-700 max-w-[85%]">
                The Wi-Fi network is <strong>CasaRoma</strong> and the password is <strong>Ospite2024!</strong> 🔑
              </div>
              <div className="bg-blue-600 rounded-2xl rounded-tr-sm px-4 py-3 text-[13px] text-white self-end max-w-[85%]">
                How do I check-in?
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] text-gray-700 max-w-[85%]">
                Check-in is from <strong>3:00 PM</strong>. If you arrive early, you can leave your bags in the hallway.
                Use the keypad code we sent by email 📬
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-5 bg-white">
        <div className="max-w-5xl mx-auto">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 mb-3">
              Tutto quello che ti serve
            </h2>
            <p className="text-gray-400 text-base sm:text-lg">
              Configurato in 5 minuti, operativo per&nbsp;sempre.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.5}
                className="rounded-2xl border border-gray-100 p-6 hover:shadow-lg hover:shadow-gray-100 transition-shadow"
              >
                <div className={`w-11 h-11 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="font-bold text-[16px] text-gray-900 mb-2">{f.title}</h3>
                <p className="text-[14px] text-gray-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reviews ── */}
{/* 
      <section className="py-20 px-5 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <p className="text-base sm:text-lg font-bold text-gray-900 mb-3">⭐ 4.9/5 dagli host</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 mb-3">
              Host soddisfatti
            </h2>
            <p className="text-gray-400 text-lg">Cosa dicono i nostri utenti.</p>
          </motion.div>
          <div className="grid sm:grid-cols-3 gap-5">
            {REVIEWS.map((r, i) => (
              <motion.div
                key={r.name}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.5}
                className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm"
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: r.stars }).map((_, k) => (
                    <Star key={k} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-[14px] text-gray-600 leading-relaxed mb-4">"{r.text}"</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-[12px]">
                    {r.name[0]}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">{r.name}</p>
                    <p className="text-[11px] text-gray-400">{r.city}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
*/}

      {/* ── FAQ ── */}
      <FaqSection />

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 px-5 bg-white">
        <div className="max-w-md mx-auto">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 mb-3">
              Prezzi chiari
            </h2>
            <p className="text-gray-400 text-base sm:text-lg">
              Nessuna sorpresa. Zero vincoli nascosti.
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={1}
            className="relative bg-white rounded-3xl border border-slate-200 shadow-sm p-8 sm:p-10"
          >
            <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-900 mb-6">
              ✨ Offerta Lancio • 1° Mese Gratis
            </div>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-lg text-slate-400 line-through">29,90€</span>
              <span className="text-5xl font-semibold tracking-tight text-slate-900">19,90€</span>
              <span className="text-slate-500">/mese</span>
            </div>

            <p className="mt-2 text-sm font-medium text-slate-500">
              ⏳ Solo 50 posti disponibili a questo prezzo
            </p>

            <ul className="mt-8 mb-8 space-y-4">
              {[
                "1 appartamento",
                "Assistente AI 24/7",
                "QR Code incluso",
                "Multilingua automatico",
                "Nessun contratto",
                "Cancella quando vuoi",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="text-slate-400 flex-shrink-0 select-none" aria-hidden>
                    ✔
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-[15px] py-3.5 rounded-xl shadow-sm transition-all"
            >
              Inizia gratis
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-xs text-slate-400 text-center mt-4">Nessuna carta di credito richiesta.</p>
            <p className="text-xs text-slate-400 text-center mt-4">Soddisfatto o rimborsato in 7 giorni.</p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-50 border-t border-gray-100 py-10 px-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png?v=2"
              alt="HeyCico"
              className="h-6 w-6 object-contain flex-shrink-0 rounded-md"
            />
            <span className="text-[13px] font-semibold text-gray-700">HeyCico</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5 text-[13px] text-gray-400">
            <Link href="/privacy" className="hover:text-gray-700 transition-colors">Privacy Policy</Link>
            <a href="mailto:hello.heycico@gmail.com" className="hover:text-gray-700 transition-colors">
              hello.heycico@gmail.com
            </a>
            <Link href="/login" className="hover:text-gray-700 transition-colors">
              Host Login
            </Link>
          </div>

          <p className="text-[12px] text-gray-300">
            © {new Date().getFullYear()} HeyCico. Tutti i diritti riservati.
          </p>
        </div>
      </footer>
    </div>
  );
}
