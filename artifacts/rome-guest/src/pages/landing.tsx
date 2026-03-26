import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Globe,
  LayoutDashboard,
  Star,
  CheckCircle2,
  ArrowRight,
  MessageSquare,
  Shield,
  X,
  Loader2,
  PartyPopper,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const FEATURES = [
  {
    icon: Zap,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Risposte Istantanee",
    desc: "Mai più ospiti in attesa per informazioni banali. Marco risponde in secondi, 24 ore su 24, 7 giorni su 7.",
  },
  {
    icon: Globe,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    title: "Multilingua Automatico",
    desc: "L'IA parla inglese, spagnolo, francese e altre 50 lingue perfettamente. Nessuna configurazione richiesta.",
  },
  {
    icon: LayoutDashboard,
    color: "text-violet-600",
    bg: "bg-violet-50",
    title: "Dashboard Host",
    desc: "Gestisci tutti i tuoi appartamenti da un unico pannello super-admin. Aggiorna le info in pochi secondi.",
  },
];

const REVIEWS = [
  {
    name: "Giulia R.",
    city: "Roma",
    stars: 5,
    text: "Ho eliminato il 90% delle domande ripetitive. I miei ospiti adorano Marco.",
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

function RegistrationModal({ onClose }: { onClose: () => void }) {
  const [hostName, setHostName] = useState("");
  const [email, setEmail] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch(`${baseUrl}/api/leads`, {
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
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-[11px] font-semibold uppercase tracking-wider mb-0.5">
              Primo mese GRATIS
            </p>
            <h2 className="text-white font-extrabold text-xl">Inizia la prova gratuita</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center gap-4 py-4"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <PartyPopper className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-gray-900 mb-2">Grazie, {hostName}!</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed">
                  Riceverai le credenziali di accesso e il tuo{" "}
                  <strong className="text-gray-700">QR Code personalizzato</strong> entro{" "}
                  <strong className="text-gray-700">5 minuti</strong> via email all'indirizzo{" "}
                  <span className="text-blue-600">{email}</span>.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition-colors w-full"
              >
                Perfetto, grazie!
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-gray-500 text-sm mb-1">
                Inserisci i tuoi dati. Ti contattiamo entro 5 minuti con le credenziali.
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">Il tuo Nome</label>
                <input
                  type="text"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="es. Marco Rossi"
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

export default function Landing() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans antialiased text-gray-900 overflow-x-hidden">
      <AnimatePresence>
        {showModal && <RegistrationModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-[15px] tracking-tight">SmartGuest AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden sm:inline text-sm text-gray-500 hover:text-gray-800 transition-colors px-3 py-1.5"
            >
              Accedi
            </Link>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors shadow-sm shadow-blue-200"
            >
              Inizia gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 to-white pt-20 pb-24 px-5">
        <div className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-blue-100/60 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-24 w-[320px] h-[320px] rounded-full bg-emerald-100/50 blur-3xl" />

        <div className="relative max-w-3xl mx-auto text-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0}
            className="inline-flex items-center gap-2 bg-blue-600/10 text-blue-700 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full mb-6 tracking-wide uppercase"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            Assistente AI per B&amp;B, Airbnb e Appartamenti
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="text-4xl sm:text-5xl md:text-[3.5rem] font-extrabold tracking-tight text-gray-900 leading-[1.1] mb-5"
          >
            SmartGuest AI&nbsp;— Il Portiere Digitale&nbsp;
            <span className="text-blue-600">24/7</span>
            <br className="hidden sm:block" /> per il tuo B&amp;B o Appartamento
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed mb-10"
          >
            Risparmia ore di tempo, elimina le chiamate notturne per il Wi-Fi e
            offri ai tuoi ospiti un'esperienza a 5 stelle in ogni lingua.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button
              onClick={() => setShowModal(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-[15px] px-8 py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all"
            >
              Inizia la prova gratuita di 30 giorni
              <ArrowRight className="w-4 h-4" />
            </button>
            <Link
              href="/guest/fleming-1"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 bg-white text-gray-700 font-semibold text-[14px] px-6 py-4 rounded-2xl transition-all"
            >
              Vedi la demo live
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={4}
            className="mt-10 flex items-center justify-center gap-2 text-sm text-gray-400"
          >
            <div className="flex -space-x-1.5">
              {["G", "L", "S", "M"].map((l, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
                >
                  {l}
                </div>
              ))}
            </div>
            <span>
              <strong className="text-gray-600">+120 host</strong> già usano SmartGuest AI
            </span>
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
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-[13px]">Appartamento Centrale</p>
                <p className="text-white/70 text-[11px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Marco è online
                </p>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] text-gray-700 max-w-[85%]">
                Benvenuto! Sono Marco 👋 Come posso aiutarti?
              </div>
              <div className="bg-blue-600 rounded-2xl rounded-tr-sm px-4 py-3 text-[13px] text-white self-end max-w-[85%]">
                What's the Wi-Fi password?
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] text-gray-700 max-w-[85%]">
                The Wi-Fi network is <strong>CasaRoma</strong> and the password is <strong>Ospite2024!</strong> 🔑
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
            <p className="text-gray-400 text-lg">Configurato in 5 minuti, operativo per sempre.</p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-6">
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
      <section className="py-20 px-5 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-12"
          >
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
                    <Star key={k} className="w-4 h-4 fill-amber-400 text-amber-400" />
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
            <p className="text-gray-400 text-lg">Nessuna sorpresa. Cancella quando vuoi.</p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={1}
            className="relative rounded-3xl border-2 border-blue-600 bg-white shadow-2xl shadow-blue-100 p-8 overflow-hidden"
          >
            <div className="absolute top-5 right-5 bg-emerald-500 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
              Primo mese GRATIS
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Piano</p>
                <p className="text-[18px] font-extrabold text-gray-900 leading-none">Pro</p>
              </div>
            </div>

            <div className="mb-6">
              <span className="text-5xl font-extrabold text-gray-900">14,90€</span>
              <span className="text-gray-400 text-lg ml-2">/ mese per appartamento</span>
            </div>

            <ul className="flex flex-col gap-3 mb-8">
              {[
                "Assistente Marco sempre attivo",
                "Chat in 50+ lingue automatiche",
                "Pannello CEO multi-proprietà",
                "QR Code personalizzato incluso",
                "Aggiornamenti illimitati",
                "Supporto prioritario via email",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[14px] text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-[15px] py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all"
            >
              Inizia la prova gratuita di 30 giorni
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-center text-[12px] text-gray-400 mt-4">
              Nessuna carta di credito richiesta.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-50 border-t border-gray-100 py-10 px-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
              <MessageSquare className="w-3 h-3 text-white" />
            </div>
            <span className="text-[13px] font-semibold text-gray-700">SmartGuest AI</span>
          </div>

          <div className="flex items-center gap-5 text-[13px] text-gray-400">
            <a href="#" className="hover:text-gray-700 transition-colors">Privacy Policy</a>
            <a href="mailto:hello.smartguest@gmail.com" className="hover:text-gray-700 transition-colors">
              hello.smartguest@gmail.com
            </a>
            <Link href="/login" className="hover:text-gray-700 transition-colors">
              Host Login
            </Link>
          </div>

          <p className="text-[12px] text-gray-300">
            © {new Date().getFullYear()} SmartGuest AI. Tutti i diritti riservati.
          </p>
        </div>
      </footer>
    </div>
  );
}
