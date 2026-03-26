import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-10">
        <div className="mb-8">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Torna alla Home
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-gray-800 mb-2">
          Informativa sulla Privacy
        </h1>
        <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-8">
          Beta Testing
        </p>

        <p className="text-gray-600 mb-8 leading-relaxed">
          Benvenuto su <strong>SmartGuest AI</strong>. La tua privacy è importante per noi.
          Essendo attualmente in fase di Beta Testing, questa è un'informativa semplificata.
        </p>

        <div className="space-y-7">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Dati raccolti</h2>
            <p className="text-gray-600 leading-relaxed">
              Raccogliamo l'indirizzo email degli Host per la gestione dell'account.
              Le conversazioni in chat dei turisti vengono elaborate temporaneamente
              per fornire le risposte.
            </p>
          </section>

          <div className="border-t border-gray-100" />

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Intelligenza Artificiale</h2>
            <p className="text-gray-600 leading-relaxed">
              I messaggi inviati nella chat vengono processati tramite le API di OpenAI.
              Ti invitiamo a non inserire dati personali sensibili (es. numeri di carta di credito)
              nella chat.
            </p>
          </section>

          <div className="border-t border-gray-100" />

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Condivisione</h2>
            <p className="text-gray-600 leading-relaxed">
              Non vendiamo né cediamo i tuoi dati a terze parti per scopi pubblicitari.
            </p>
          </section>

          <div className="border-t border-gray-100" />

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Contatti</h2>
            <p className="text-gray-600 leading-relaxed">
              Per qualsiasi richiesta di cancellazione dati, puoi scriverci a:{" "}
              <a
                href="mailto:hello.smartguest@gmail.com"
                className="text-gray-800 font-medium underline underline-offset-2 hover:text-gray-600 transition-colors"
              >
                hello.smartguest@gmail.com
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400">
          © {new Date().getFullYear()} SmartGuest AI — Tutti i diritti riservati.
        </div>
      </div>
    </div>
  );
}
