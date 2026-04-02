import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { jsPDF } from "jspdf";
import {
  Building, Plus, Trash2, ExternalLink, KeyRound, Loader2, Save,
  Users, AlertCircle, Sparkles, QrCode, X, Download, Inbox,
  UserCog, Copy, CheckCheck, Link2, Eye, EyeOff, RefreshCw,
  Mail, ShieldAlert, FileText, ChevronDown, UserCheck,
} from "lucide-react";
import { format } from "date-fns";

import { useListProperties, useCreateProperty, useDeleteProperty, getListPropertiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/apiUrl";

const createPropertySchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio"),
  slug: z.string().min(1, "Lo slug è obbligatorio").regex(/^[a-z0-9-]+$/, "Solo lettere minuscole, numeri e trattini"),
  whatsappNumber: z.string().optional(),
  ownerEmail: z.string().email("Email non valida").optional().or(z.literal("")),
  content: z.string().optional(),
});

type CreatePropertyValues = z.infer<typeof createPropertySchema>;

interface Lead {
  id: number;
  hostName: string;
  email: string;
  propertyName: string;
  status: string;
  createdAt: string;
}

interface LeadConversionResult {
  email: string;
  slug: string;
  inviteLink: string;
}

const LEAD_STATUSES = ["Nuovo", "Contattato", "In Trattativa", "Chiuso", "Non Interessato"] as const;

const CEO_SESSION_KEY = "ceo_session_token";

function readCeoToken(): string {
  try {
    return sessionStorage.getItem(CEO_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}
const STATUS_COLORS: Record<string, string> = {
  "Nuovo": "bg-blue-100 text-blue-700 border-blue-200",
  "Contattato": "bg-amber-100 text-amber-700 border-amber-200",
  "In Trattativa": "bg-purple-100 text-purple-700 border-purple-200",
  "Chiuso": "bg-green-100 text-green-700 border-green-200",
  "Non Interessato": "bg-red-100 text-red-700 border-red-200",
};

function QrModal({
  property,
  ceoSessionHeaders,
  onClose,
}: {
  property: { name: string; slug: string };
  ceoSessionHeaders: HeadersInit;
  onClose: () => void;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [email, setEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrCodeBase64, setQrCodeBase64] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState("");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const chatUrl = `${window.location.origin}${base}/guest/${property.slug}`;

  useEffect(() => {
    let mounted = true;
    const loadQr = async () => {
      setQrLoading(true);
      setQrError("");
      try {
        const res = await fetch(apiUrl(`/api/properties/${property.slug}`), {
          headers: { ...ceoSessionHeaders },
        });
        const json = await res.json();
        if (!res.ok || !json.qrCodeBase64) {
          throw new Error("QR non disponibile");
        }
        if (mounted) setQrCodeBase64(json.qrCodeBase64);
      } catch {
        if (mounted) setQrError("Impossibile caricare il QR. Riprova.");
      } finally {
        if (mounted) setQrLoading(false);
      }
    };
    loadQr();
    return () => {
      mounted = false;
    };
  }, [base, property.slug, ceoSessionHeaders]);

  const buildPdfDocument = (): jsPDF => {
    if (!qrCodeBase64) throw new Error("QR Code non trovato");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(17, 24, 39);
    const title = `Benvenuti a ${property.name}`;
    const splitTitle = doc.splitTextToSize(title, 170);
    const startY = 60;
    doc.text(splitTitle, pageW / 2, startY, { align: "center" });

    const titleHeight = splitTitle.length * 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(107, 114, 128);
    doc.text("Il tuo Assistente Virtuale 24/7", pageW / 2, startY + titleHeight + 4, { align: "center" });

    const qrSize = 100;
    const qrX = (pageW - qrSize) / 2;
    const qrY = startY + titleHeight + 18;
    doc.addImage(qrCodeBase64, "PNG", qrX, qrY, qrSize, qrSize);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(
      "Inquadra per: Wi-Fi • Regole • Consigli • WhatsApp",
      pageW / 2,
      qrY + qrSize + 16,
      { align: "center" },
    );

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("Powered by SmartGuest AI", pageW / 2, pageH - 10, { align: "center" });

    return doc;
  };

  const handleDownload = () => {
    try {
      const doc = buildPdfDocument();
      doc.save("Cartello_Benvenuto_SmartGuest.pdf");
    } catch {
      alert("QR non disponibile. Riprova.");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(chatUrl);
      setIsCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setIsCopied(false), 3000);
    } catch (err) {
      // Fallback per browser datati o modalità anonima
      const textarea = document.createElement("textarea");
      textarea.value = chatUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setIsCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setIsCopied(false), 3000);
      } catch {
        console.error("Copia fallita");
      }
      document.body.removeChild(textarea);
    }
  };

  const handleSendEmail = async () => {
    if (!email.trim()) return;

    setIsSendingEmail(true);
    try {
      const pdfBase64 = buildPdfDocument().output("datauristring");

      const response = await fetch(apiUrl("/api/send-pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ceoSessionHeaders },
        body: JSON.stringify({
          email: email.trim(),
          propertyName: property.name,
          pdfBase64,
          chatLink: chatUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Errore nell'invio");
      }

      setEmailSent(true);
      if (emailTimerRef.current) clearTimeout(emailTimerRef.current);
      emailTimerRef.current = setTimeout(() => setEmailSent(false), 3000);
      setEmail("");
    } catch (err) {
      console.error("Errore invio email:", err);
      alert(`Errore nell'invio: ${err instanceof Error ? err.message : "Riprova."}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.22 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-[15px]">QR Code</h3>
            <p className="text-gray-400 text-[12px] mt-0.5 truncate max-w-[180px]">{property.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-5 p-6">
          <div className="flex justify-center p-3 bg-white border border-gray-200 rounded-2xl shadow-sm min-h-[224px] items-center">
            {qrLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            ) : qrError ? (
              <p className="text-xs text-red-500 text-center">{qrError}</p>
            ) : (
              <img src={qrCodeBase64} alt={`QR ${property.slug}`} className="w-[200px] h-[200px]" />
            )}
          </div>

          <div className="w-full bg-gray-50 rounded-xl px-3 py-2 text-center">
            <p className="text-[11px] text-gray-400 mb-0.5">Link chat ospiti</p>
            <p className="text-[12px] font-mono text-gray-600 break-all">{chatUrl}</p>
          </div>

          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3 rounded-2xl transition-colors"
          >
            <FileText className="w-4 h-4" />
            Scarica Cartello PDF
          </button>

          <button
            onClick={handleCopyLink}
            className={`w-full flex items-center justify-center gap-2 font-medium text-sm py-3 rounded-2xl transition-all ${
              isCopied
                ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border border-gray-200 hover:border-gray-300 text-gray-600"
            }`}
          >
            {isCopied ? "Copiato! ✅" : "Copia link"}
          </button>

          <div className="w-full border-t border-gray-100 pt-4">
            <label className="text-[12px] font-semibold text-gray-700 mb-2 block">
              Invia Cartello via Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 mb-2"
              disabled={isSendingEmail}
            />
            <button
              onClick={handleSendEmail}
              disabled={!email.trim() || isSendingEmail}
              className={`w-full flex items-center justify-center gap-2 font-semibold text-sm py-2.5 rounded-2xl transition-all ${
                emailSent
                  ? "bg-emerald-500 text-white"
                  : "bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              }`}
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Invio in corso...
                </>
              ) : emailSent ? (
                <>
                  <CheckCheck className="w-4 h-4" />
                  📧 Email in elaborazione! Arriverà entro pochi secondi.
                </>
              ) : (
                "Invia PDF via Email"
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function HostPasswordModal({
  property,
  ceoSessionHeaders,
  onClose,
  onSaved,
}: {
  property: { name: string; slug: string; hostPassword?: string | null };
  ceoSessionHeaders: HeadersInit;
  onClose: () => void;
  onSaved: (newPassword: string) => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const hostLink = `${window.location.origin}${base}/host/${property.slug}`;

  // The displayed current password — updated locally after save
  const currentPassword = savedPassword ?? property.hostPassword ?? null;

  const handleSave = async () => {
    if (!newPassword.trim()) return;
    setError("");
    setSaved(false);
    setIsSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/properties/${property.slug}/host-password`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...ceoSessionHeaders },
        body: JSON.stringify({ hostPassword: newPassword.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore nel salvataggio.");
      setSavedPassword(newPassword.trim());
      setSaved(true);
      onSaved(newPassword.trim());
      setNewPassword("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(hostLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.22 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-[15px] flex items-center gap-2">
              <UserCog className="w-4 h-4 text-blue-600" />
              Gestione Host
            </h3>
            <p className="text-gray-400 text-[12px] mt-0.5 truncate max-w-[200px]">{property.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* ID Accesso */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              ID Accesso (Slug)
            </label>
            <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-100">
              <p className="text-[13px] font-mono font-bold text-blue-700 flex-1">{property.slug}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(property.slug); }}
                className="p-1.5 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors flex-shrink-0"
                title="Copia ID"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Current password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Password Attuale
            </label>
            {currentPassword ? (
              <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2.5 border border-emerald-100">
                <p className="text-[13px] font-mono font-bold text-emerald-700 flex-1 break-all">
                  {showCurrent ? currentPassword : "•".repeat(Math.min(currentPassword.length, 12))}
                </p>
                <button
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-600 hover:bg-emerald-100 transition-colors flex-shrink-0"
                  title={showCurrent ? "Nascondi" : "Mostra"}
                >
                  {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-2.5 rounded-xl border border-amber-100 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Nessuna password impostata
              </div>
            )}
          </div>

          {/* Link host */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-3 h-3" /> Link da inviare all'host
            </label>
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
              <p className="text-[11px] font-mono text-gray-600 flex-1 break-all">{hostLink}</p>
              <button
                onClick={handleCopyLink}
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${copied ? "text-emerald-600 bg-emerald-100" : "text-gray-400 hover:text-gray-600 hover:bg-gray-200"}`}
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Set new password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">
              {currentPassword ? "Reimposta password host" : "Imposta password host"}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setSaved(false); setError(""); }}
                  placeholder="Nuova password..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-9 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || !newPassword.trim()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? "" : "Salva"}
              </button>
            </div>
          </div>

          {/* Success */}
          {saved && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl font-medium"
            >
              <CheckCheck className="w-4 h-4 flex-shrink-0" />
              Dati salvati correttamente nel database!
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-2.5 rounded-xl">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ContentEditModal({
  property,
  ceoSessionHeaders,
  onClose,
  onSaved,
}: {
  property: { name: string; slug: string; content?: string | null };
  ceoSessionHeaders: HeadersInit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [text, setText] = useState(property.content ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/properties/${property.slug}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...ceoSessionHeaders },
        body: JSON.stringify({ content: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore nel salvataggio.");
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.22 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 text-[16px] flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              Modifica Regole & Knowledge Base
            </h3>
            <p className="text-gray-400 text-[12px] mt-0.5 truncate max-w-[320px]">{property.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Textarea */}
        <div className="flex-1 overflow-y-auto p-6">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Regolamento, info WiFi, consigli, policy — tutto ciò che Marco deve sapere
          </label>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setSaved(false); }}
            placeholder="Inserisci qui il regolamento completo, info WiFi, istruzioni check-in/check-out, consigli locali..."
            className="w-full h-72 resize-none border border-gray-200 rounded-2xl px-4 py-3 text-sm leading-relaxed text-gray-800 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all font-sans"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">{text.length} caratteri</p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex-shrink-0 flex flex-col gap-3">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-2.5 rounded-xl">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          {saved && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2.5 rounded-xl font-medium"
            >
              <CheckCheck className="w-4 h-4 flex-shrink-0" />
              Knowledge base aggiornata correttamente!
            </motion.div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 font-medium py-3 rounded-2xl hover:bg-gray-50 transition-colors text-sm"
            >
              Annulla
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !text.trim()}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-2xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Salvataggio..." : "Salva Regole"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

type InlineEditState = {
  name: string;
  slug: string;
  hostPassword: string;
  email: string;
  saving: boolean;
  saved: boolean;
  error: string;
};

export default function CeoPanel() {
  const [ceoToken, setCeoToken] = useState(readCeoToken);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"properties" | "leads" | "resets" | "hosts">("properties");
  const [qrProperty, setQrProperty] = useState<{ name: string; slug: string } | null>(null);
  const [hostManageProp, setHostManageProp] = useState<{ name: string; slug: string; hostPassword?: string | null } | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [resetRequests, setResetRequests] = useState<Array<{ slug: string; name: string; email: string | null; resetToken: string | null; resetRequestedAt: string | null }>>([]);
  const [resetsLoading, setResetsLoading] = useState(false);
  const [cancellingReset, setCancellingReset] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({ name: "", slug: "", hostPassword: "", email: "", saving: false, saved: false, error: "" });
  const [contentModal, setContentModal] = useState<{ name: string; slug: string; content?: string | null } | null>(null);
  const [leadDeleting, setLeadDeleting] = useState<Record<number, boolean>>({});
  const [leadStatusSaving, setLeadStatusSaving] = useState<Record<number, boolean>>({});
  const [convertingLead, setConvertingLead] = useState<Record<number, boolean>>({});
  const [convertSuccess, setConvertSuccess] = useState<Record<number, string | null>>({});
  const [leadConversionModal, setLeadConversionModal] = useState<LeadConversionResult | null>(null);
  const [leadInviteLinkCopied, setLeadInviteLinkCopied] = useState(false);
  const [hosts, setHosts] = useState<Array<{ id: number; email: string; createdAt: string }>>([]);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [newHostEmail, setNewHostEmail] = useState("");
  const [newHostPassword, setNewHostPassword] = useState("");
  const [hostFormMsg, setHostFormMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [hostFormSaving, setHostFormSaving] = useState(false);
  const [hostDeleting, setHostDeleting] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const spaBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  const ceoSessionHeaders = { "X-CEO-Session": ceoToken };

  const { data: properties, isLoading: isListLoading, error: listError } = useListProperties({
    query: {
      queryKey: getListPropertiesQueryKey(),
      enabled: !!ceoToken,
      retry: false,
    },
    request: { headers: ceoSessionHeaders },
  });

  const { mutate: _createProperty } = useCreateProperty();
  const [isCreating, setIsCreating] = useState(false);
  const { mutate: deleteProperty, isPending: isDeleting } = useDeleteProperty({
    request: { headers: ceoSessionHeaders },
  });

  const form = useForm<CreatePropertyValues>({
    resolver: zodResolver(createPropertySchema as any),
    defaultValues: { name: "", slug: "", whatsappNumber: "", content: "" }
  });

  const watchName = form.watch("name");
  useEffect(() => {
    if (watchName && !form.formState.touchedFields.slug) {
      const generated = watchName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      form.setValue("slug", generated, { shouldValidate: true });
    }
  }, [watchName, form]);

  useEffect(() => {
    if (listError && (listError as any).status === 401) {
      sessionStorage.removeItem(CEO_SESSION_KEY);
      setCeoToken("");
      alert("Sessione non valida o scaduta. Accedi di nuovo.");
    }
  }, [listError]);

  const fetchLeads = async () => {
    if (!ceoToken) return;
    setLeadsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/leads"), { headers: ceoSessionHeaders });
      const data = await res.json();
      if (res.ok) setLeads(data);
    } finally {
      setLeadsLoading(false);
    }
  };

  useEffect(() => {
    if (ceoToken && activeTab === "leads") {
      fetchLeads();
    }
  }, [activeTab, ceoToken]);

  const fetchResets = async () => {
    if (!ceoToken) return;
    setResetsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/resets"), { headers: ceoSessionHeaders });
      const data = await res.json();
      if (res.ok) setResetRequests(data);
    } finally {
      setResetsLoading(false);
    }
  };

  const cancelReset = async (slug: string) => {
    setCancellingReset(slug);
    try {
      await fetch(apiUrl(`/api/auth/resets/${slug}`), {
        method: "DELETE",
        headers: { ...ceoSessionHeaders },
      });
      setResetRequests((prev) => prev.filter((r) => r.slug !== slug));
    } finally {
      setCancellingReset(null);
    }
  };

  useEffect(() => {
    if (ceoToken && activeTab === "resets") {
      fetchResets();
    }
  }, [activeTab, ceoToken]);

  const deleteLead = async (id: number) => {
    if (!window.confirm("Sei sicuro? Il lead sarà eliminato definitivamente dal database.")) return;
    setLeadDeleting((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(apiUrl(`/api/leads/${id}`), {
        method: "DELETE",
        headers: { ...ceoSessionHeaders },
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
      }
    } finally {
      setLeadDeleting((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const updateLeadStatus = async (id: number, status: string) => {
    setLeadStatusSaving((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(apiUrl(`/api/leads/${id}/status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...ceoSessionHeaders },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
      }
    } finally {
      setLeadStatusSaving((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const convertLead = async (lead: Lead) => {
    if (!window.confirm(`Converti "${lead.hostName}" in host?\n\nVerra creata la proprietà "${lead.propertyName}".`)) return;
    setConvertingLead((prev) => ({ ...prev, [lead.id]: true }));
    try {
      const res = await fetch(apiUrl(`/api/leads/${lead.id}/convert`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ceoSessionHeaders },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Errore: ${data.error ?? "Qualcosa è andato storto."}`);
        return;
      }
      setLeadConversionModal({
        email: data.email,
        slug: data.slug,
        inviteLink: data.inviteLink ?? "",
      });
      setLeadInviteLinkCopied(false);
      setConvertSuccess((prev) => ({ ...prev, [lead.id]: "Lead convertito con successo." }));
      setTimeout(() => {
        setConvertSuccess((prev) => { const n = { ...prev }; delete n[lead.id]; return n; });
      }, 6000);
      setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, status: "Chiuso" } : l));
    } catch {
      alert("Errore di rete. Riprova.");
    } finally {
      setConvertingLead((prev) => { const n = { ...prev }; delete n[lead.id]; return n; });
    }
  };

  const fetchHosts = async () => {
    if (!ceoToken) return;
    setHostsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/hosts"), { headers: ceoSessionHeaders });
      const data = await res.json();
      if (res.ok) setHosts(data);
    } finally {
      setHostsLoading(false);
    }
  };

  useEffect(() => {
    if (ceoToken && activeTab === "hosts") fetchHosts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ceoToken]);

  const saveHost = async () => {
    if (!newHostEmail.trim() || !newHostPassword.trim()) {
      setHostFormMsg({ type: "err", text: "Email e password sono obbligatori." });
      return;
    }
    setHostFormSaving(true);
    setHostFormMsg(null);
    try {
      const res = await fetch(apiUrl("/api/admin/hosts"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ceoSessionHeaders },
        body: JSON.stringify({ email: newHostEmail.trim(), hostPassword: newHostPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setHostFormMsg({ type: "err", text: data.error ?? "Errore." }); return; }
      setHostFormMsg({ type: "ok", text: data.action === "created" ? `Host ${data.email} creato!` : `Password di ${data.email} aggiornata!` });
      setNewHostEmail(""); setNewHostPassword("");
      fetchHosts();
    } catch { setHostFormMsg({ type: "err", text: "Errore di rete." }); }
    finally { setHostFormSaving(false); }
  };

  const deleteHost = async (email: string) => {
    if (!window.confirm(`Sei sicuro di voler eliminare l'host ${email}?`)) return;
    setHostDeleting((prev) => ({ ...prev, [email]: true }));
    try {
      await fetch(apiUrl(`/api/admin/hosts/${encodeURIComponent(email)}`), {
        method: "DELETE",
        headers: { ...ceoSessionHeaders },
      });
      setHosts((prev) => prev.filter((h) => h.email !== email));
    } finally {
      setHostDeleting((prev) => { const n = { ...prev }; delete n[email]; return n; });
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pwd = fd.get("password") as string;
    if (!pwd?.trim()) return;
    setLoginLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/ceo-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        alert(data.error ?? "Accesso negato.");
        return;
      }
      if (!data.token) {
        alert("Risposta dal server non valida.");
        return;
      }
      sessionStorage.setItem(CEO_SESSION_KEY, data.token);
      setCeoToken(data.token);
    } catch {
      alert("Errore di connessione. Riprova.");
    } finally {
      setLoginLoading(false);
    }
  };

  const onSubmit = async (data: CreatePropertyValues) => {
    setIsCreating(true);
    try {
      const { ownerEmail, ...rest } = data;
      const res = await fetch(apiUrl("/api/properties"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ceoSessionHeaders },
        body: JSON.stringify({ ...rest, ownerEmail: ownerEmail || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Errore: ${json.error || "Impossibile creare la proprietà"}`);
        return;
      }
      form.reset();
      queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
    } catch {
      alert("Errore di rete. Riprova.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = (slug: string) => {
    if (window.confirm(`Sei sicuro di voler eliminare la proprietà ${slug}?`)) {
      deleteProperty(
        { slug },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          },
          onError: () => alert("Errore durante l'eliminazione"),
        }
      );
    }
  };

  const startInlineEdit = (prop: { name: string; slug: string; hostPassword?: string | null; email?: string | null }) => {
    setEditingSlug(prop.slug);
    setInlineEdit({ name: prop.name, slug: prop.slug, hostPassword: prop.hostPassword ?? "", email: prop.email ?? "", saving: false, saved: false, error: "" });
  };

  const cancelInlineEdit = () => {
    setEditingSlug(null);
    setInlineEdit({ name: "", slug: "", hostPassword: "", email: "", saving: false, saved: false, error: "" });
  };

  const saveInlineEdit = async (originalSlug: string) => {
    setInlineEdit((prev) => ({ ...prev, saving: true, error: "", saved: false }));
    try {
      const res = await fetch(apiUrl(`/api/properties/${originalSlug}/full-edit`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...ceoSessionHeaders },
        body: JSON.stringify({
          name: inlineEdit.name,
          newSlug: inlineEdit.slug,
          hostPassword: inlineEdit.hostPassword,
          email: inlineEdit.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInlineEdit((prev) => ({ ...prev, saving: false, error: data.error ?? "Errore sconosciuto." }));
        return;
      }
      setInlineEdit((prev) => ({ ...prev, saving: false, saved: true, error: "" }));
      queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
      setTimeout(() => {
        setEditingSlug(null);
        setInlineEdit({ name: "", slug: "", hostPassword: "", email: "", saving: false, saved: false, error: "" });
      }, 1800);
    } catch {
      setInlineEdit((prev) => ({ ...prev, saving: false, error: "Errore di rete. Riprova." }));
    }
  };

  // ── AUTH SCREEN ──
  if (!ceoToken) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 sm:p-12 rounded-[2rem] max-w-md w-full text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Building className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Professional Host Suite</h1>
          <p className="text-muted-foreground text-sm mb-8">Accesso riservato amministratori SmartGuest AI</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                name="password"
                type="password"
                placeholder="Password Super-Admin"
                className="w-full bg-background border border-border pl-12 pr-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all font-sans"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-primary text-primary-foreground font-medium py-3.5 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loginLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Accedi al Pannello"}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ── DASHBOARD ──
  return (
    <>
      <AnimatePresence>
        {leadConversionModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className="w-full max-w-2xl rounded-2xl border-2 border-amber-400 bg-amber-50 shadow-2xl"
            >
              <div className="p-6 sm:p-7 flex flex-col gap-5">
                <div>
                  <h3 className="text-xl font-extrabold text-amber-900">Invito host</h3>
                  <p className="mt-2 text-amber-800 font-semibold">
                    Invia al lead il link qui sotto: potrà impostare la propria password (valido 48 ore). L&apos;account
                    host viene creato al completamento del link.
                  </p>
                </div>

                <div className="rounded-xl border border-amber-300 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-wider text-amber-700 font-semibold">Link impostazione password</p>
                  <p className="mt-2 font-mono text-sm sm:text-base font-bold text-amber-900 break-all">
                    {leadConversionModal.inviteLink}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-amber-900 space-y-1">
                  <p><strong>Email host:</strong> {leadConversionModal.email}</p>
                  <p><strong>Slug proprieta:</strong> {leadConversionModal.slug}</p>
                  <p className="break-all"><strong>Chat link:</strong> {`${window.location.origin}${spaBase}/guest/${leadConversionModal.slug}`}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(leadConversionModal.inviteLink);
                      setLeadInviteLinkCopied(true);
                      setTimeout(() => setLeadInviteLinkCopied(false), 2000);
                    }}
                    className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-3"
                  >
                    {leadInviteLinkCopied ? "✅ Copiato!" : "📋 Copia link invito"}
                  </button>
                  <button
                    onClick={() => setLeadConversionModal(null)}
                    className="flex-1 rounded-xl border-2 border-amber-500 bg-white hover:bg-amber-100 text-amber-900 font-bold px-4 py-3"
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {qrProperty && (
          <QrModal
            property={qrProperty}
            ceoSessionHeaders={ceoSessionHeaders}
            onClose={() => setQrProperty(null)}
          />
        )}
        {hostManageProp && (
          <HostPasswordModal
            property={hostManageProp}
            ceoSessionHeaders={ceoSessionHeaders}
            onClose={() => setHostManageProp(null)}
            onSaved={(newPwd) => {
              setHostManageProp((prev) => prev ? { ...prev, hostPassword: newPwd } : null);
              queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
            }}
          />
        )}
        {contentModal && (
          <ContentEditModal
            property={contentModal}
            ceoSessionHeaders={ceoSessionHeaders}
            onClose={() => setContentModal(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
            }}
          />
        )}
      </AnimatePresence>

      <div className="min-h-[100dvh] flex flex-col py-4 px-4 md:py-8 md:px-6">
        <div className="max-w-7xl w-full mx-auto flex flex-col gap-6">

          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 sm:px-8 rounded-[2rem]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-serif font-bold text-foreground leading-tight">SmartGuest AI CEO</h1>
                <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-0.5">
                  <Users className="w-3.5 h-3.5" /> Professional Host Suite
                </p>
              </div>
            </div>
            <a
              href="/"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-lg transition-colors self-start sm:self-auto"
              onClick={() => {
                sessionStorage.removeItem(CEO_SESSION_KEY);
                setCeoToken("");
              }}
            >
              Esci
            </a>
          </header>

          {/* Tabs */}
          <div className="flex gap-1.5 px-1 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveTab("properties")}
              className={`flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === "properties"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-black/5"
              }`}
            >
              <Building className="w-4 h-4" />
              Proprietà ({properties?.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab("leads")}
              className={`flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === "leads"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-black/5"
              }`}
            >
              <Inbox className="w-4 h-4" />
              Lead
              {leads.length > 0 && (
                <span className="ml-1 bg-white/30 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {leads.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("resets")}
              className={`flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === "resets"
                  ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                  : "text-muted-foreground hover:bg-black/5"
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              Richieste Reset
              {resetRequests.length > 0 && (
                <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "resets" ? "bg-white/30" : "bg-amber-100 text-amber-700"}`}>
                  {resetRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("hosts")}
              className={`flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === "hosts"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                  : "text-muted-foreground hover:bg-black/5"
              }`}
            >
              <UserCog className="w-4 h-4" />
              Host
              {hosts.length > 0 && (
                <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "hosts" ? "bg-white/30" : "bg-indigo-100 text-indigo-700"}`}>
                  {hosts.length}
                </span>
              )}
            </button>
          </div>

          <AnimatePresence mode="wait">

            {/* ── TAB: PROPERTIES ── */}
            {activeTab === "properties" && (
              <motion.div
                key="properties"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="grid lg:grid-cols-12 gap-8 items-start"
              >
                {/* Left: list */}
                <div className="lg:col-span-7 flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xl font-serif font-semibold">Le mie proprietà</h2>
                    {isListLoading && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                  </div>

                  <AnimatePresence>
                    {properties?.map((prop) => (
                      <motion.div
                        key={prop.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="glass-panel p-5 rounded-3xl hover:border-primary/30 transition-colors"
                      >
                        {editingSlug === prop.slug ? (
                          /* ── EDIT MODE ── */
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Modifica Proprietà</span>
                              <button onClick={cancelInlineEdit} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                                <X className="w-3.5 h-3.5 text-gray-500" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nome</label>
                                <input
                                  type="text"
                                  value={inlineEdit.name}
                                  onChange={(e) => setInlineEdit((prev) => ({ ...prev, name: e.target.value }))}
                                  className="w-full bg-white border border-border px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all font-sans"
                                  placeholder="Nome appartamento"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">ID Accesso (Slug)</label>
                                <input
                                  type="text"
                                  value={inlineEdit.slug}
                                  onChange={(e) => setInlineEdit((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                                  className="w-full bg-white border border-border px-3 py-2 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                                  placeholder="slug-appartamento"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                  <Mail className="w-3 h-3" /> Email Host (per reset password)
                                </label>
                                <input
                                  type="email"
                                  value={inlineEdit.email}
                                  onChange={(e) => setInlineEdit((prev) => ({ ...prev, email: e.target.value }))}
                                  className="w-full bg-white border border-border px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                                  placeholder="host@email.com"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Password Host</label>
                                <input
                                  type="text"
                                  value={inlineEdit.hostPassword}
                                  onChange={(e) => setInlineEdit((prev) => ({ ...prev, hostPassword: e.target.value }))}
                                  className="w-full bg-white border border-border px-3 py-2 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                                  placeholder="password host"
                                />
                              </div>
                            </div>

                            {inlineEdit.error && (
                              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[12px] px-3 py-2 rounded-xl">
                                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                {inlineEdit.error}
                              </div>
                            )}

                            {inlineEdit.saved && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] px-3 py-2 rounded-xl font-medium"
                              >
                                <CheckCheck className="w-3.5 h-3.5 flex-shrink-0" />
                                Aggiornato correttamente nel database!
                              </motion.div>
                            )}

                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={cancelInlineEdit}
                                className="px-4 py-2 text-[13px] font-medium rounded-xl border border-border text-muted-foreground hover:bg-muted transition-all"
                              >
                                Annulla
                              </button>
                              <button
                                onClick={() => saveInlineEdit(prop.slug)}
                                disabled={inlineEdit.saving || inlineEdit.saved}
                                className="px-5 py-2 text-[13px] font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center gap-2"
                              >
                                {inlineEdit.saving ? (
                                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvataggio…</>
                                ) : inlineEdit.saved ? (
                                  <><CheckCheck className="w-3.5 h-3.5" /> Salvato!</>
                                ) : (
                                  <><Save className="w-3.5 h-3.5" /> Aggiorna</>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── VIEW MODE ── */
                          <div className="flex flex-col sm:flex-row gap-4 justify-between">
                            <div className="space-y-2 flex-1 min-w-0">
                              <h3 className="text-[16px] font-bold text-foreground flex items-center gap-2 flex-wrap">
                                {prop.name}
                                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold tracking-wide uppercase">
                                  ATTIVA
                                </span>
                              </h3>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">ID Accesso:</span>
                                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md text-[12px] border border-blue-100">
                                  {prop.slug}
                                </span>
                                {(prop as any).hostPassword ? (
                                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                                    ✓ password impostata
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">
                                    ⚠ no password
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                                <span className="font-mono bg-black/5 px-2 py-0.5 rounded-md text-[12px]">
                                  /guest/{prop.slug}
                                </span>
                                {prop.whatsappNumber && (
                                  <span className="text-[12px]">WA: {prop.whatsappNumber}</span>
                                )}
                                <span className="text-[12px] opacity-60">
                                  {format(new Date(prop.createdAt), 'dd MMM yyyy')}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap sm:flex-col items-start sm:items-stretch gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-border/50 pt-3 sm:pt-0 sm:pl-5">
                              <button
                                onClick={() => startInlineEdit({ name: prop.name, slug: prop.slug, hostPassword: (prop as any).hostPassword, email: (prop as any).email })}
                                className="flex-1 sm:flex-none px-3 py-2 bg-orange-50 text-orange-700 hover:bg-orange-100 font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 text-[13px]"
                              >
                                <Save className="w-3.5 h-3.5" />
                                Modifica
                              </button>
                              <button
                                onClick={() => setContentModal({ name: prop.name, slug: prop.slug, content: (prop as any).content })}
                                className="flex-1 sm:flex-none px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 text-[13px]"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Regole
                              </button>
                              <button
                                onClick={() => setQrProperty({ name: prop.name, slug: prop.slug })}
                                className="flex-1 sm:flex-none px-3 py-2 bg-violet-50 text-violet-700 hover:bg-violet-100 font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 text-[13px]"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                QR Code
                              </button>
                              <Link
                                href={`/guest/${prop.slug}`}
                                className="flex-1 sm:flex-none px-3 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 text-[13px]"
                              >
                                Chat <ExternalLink className="w-3 h-3" />
                              </Link>
                              <button
                                onClick={() => handleDelete(prop.slug)}
                                disabled={isDeleting}
                                className="flex-1 sm:flex-none px-3 py-2 text-destructive hover:bg-destructive hover:text-white font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 text-[13px]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Elimina
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {(!properties || properties.length === 0) && !isListLoading && (
                    <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center border-dashed">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <Building className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <h3 className="text-lg font-bold text-foreground mb-1">Nessuna proprietà</h3>
                      <p className="text-muted-foreground text-sm max-w-sm">
                        Usa il form per aggiungere il tuo primo appartamento.
                      </p>
                    </div>
                  )}
                </div>

                {/* Right: create form */}
                <div className="lg:col-span-5 sticky top-8">
                  <div className="glass-panel rounded-[2rem] overflow-hidden">
                    <div className="bg-primary/5 px-6 py-5 border-b border-border/50 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                        <Plus className="w-5 h-5" />
                      </div>
                      <h2 className="text-lg font-serif font-bold">Aggiungi Proprietà</h2>
                    </div>
                    <div className="p-6">
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-foreground">Nome Appartamento</label>
                          <input
                            {...form.register("name")}
                            placeholder="es. Fleming Suite 1"
                            className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-sans text-sm"
                          />
                          {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-foreground">URL Slug</label>
                            <input
                              {...form.register("slug")}
                              placeholder="es. fleming-1"
                              className="w-full bg-black/5 border border-transparent px-4 py-2.5 rounded-xl focus:bg-background focus:border-primary/50 focus:outline-none transition-all font-mono text-sm"
                            />
                            {form.formState.errors.slug && <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-foreground">WhatsApp Host</label>
                            <input
                              {...form.register("whatsappNumber")}
                              placeholder="+39 333..."
                              className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-sans text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-indigo-500" /> Email Proprietario
                            <span className="text-[10px] font-normal text-muted-foreground">(facoltativo)</span>
                          </label>
                          <input
                            {...form.register("ownerEmail")}
                            type="email"
                            placeholder="host@email.com"
                            className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-sans text-sm"
                          />
                          {form.formState.errors.ownerEmail && <p className="text-xs text-destructive">{form.formState.errors.ownerEmail.message}</p>}
                          <p className="text-[11px] text-muted-foreground">Lega questa struttura all'account host con questa email.</p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                            Knowledge Base
                            <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">Regole e info</span>
                          </label>
                          <textarea
                            {...form.register("content")}
                            placeholder="Inserisci qui regolamento, WiFi, consigli..."
                            className="w-full h-[180px] resize-y bg-background border border-border px-4 py-3 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-sans text-sm leading-relaxed"
                          />
                          {form.formState.errors.content && <p className="text-xs text-destructive">{form.formState.errors.content.message}</p>}
                        </div>

                        <button
                          type="submit"
                          disabled={isCreating}
                          className="w-full bg-primary text-primary-foreground font-medium py-3.5 rounded-xl shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Crea Nuova Proprietà</>}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── TAB: LEADS ── */}
            {activeTab === "leads" && (
              <motion.div
                key="leads"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xl font-serif font-semibold">Richieste di accesso</h2>
                  <button
                    onClick={fetchLeads}
                    disabled={leadsLoading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-lg transition-colors"
                  >
                    {leadsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aggiorna"}
                  </button>
                </div>

                {leadsLoading && (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                )}

                {!leadsLoading && leads.length === 0 && (
                  <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center border-dashed">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Inbox className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Nessuna richiesta</h3>
                    <p className="text-muted-foreground text-sm">
                      Le richieste dalla landing page appariranno qui.
                    </p>
                  </div>
                )}

                {!leadsLoading && leads.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <AnimatePresence initial={false}>
                    {leads.map((lead) => (
                      <motion.div
                        key={lead.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        layout
                        className="glass-panel p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        {/* Left: avatar + info */}
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[15px] flex-shrink-0">
                            {lead.hostName[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-foreground text-[15px] truncate">{lead.hostName}</p>
                            <p className="text-muted-foreground text-sm truncate">{lead.email}</p>
                            <p className="text-muted-foreground text-[12px] mt-0.5">🏠 {lead.propertyName}</p>
                          </div>
                        </div>

                        {/* Right: date + status + actions */}
                        <div className="flex flex-col sm:items-end gap-2 pl-14 sm:pl-0 flex-shrink-0">
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(lead.createdAt), "dd MMM yyyy · HH:mm")}
                          </span>

                          {/* Success banner */}
                          {convertSuccess[lead.id] && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
                            >
                              <CheckCheck className="w-3 h-3 flex-shrink-0" />
                              {convertSuccess[lead.id]}
                            </motion.div>
                          )}

                          {/* Status dropdown + action buttons */}
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <div className="relative">
                              <select
                                value={lead.status ?? "Nuovo"}
                                disabled={leadStatusSaving[lead.id]}
                                onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                                className={`appearance-none pl-2.5 pr-7 py-1.5 rounded-lg text-[12px] font-semibold border cursor-pointer focus:outline-none transition-all ${STATUS_COLORS[lead.status] ?? STATUS_COLORS["Nuovo"]} ${leadStatusSaving[lead.id] ? "opacity-50" : ""}`}
                              >
                                {LEAD_STATUSES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                            </div>

                            {/* Approva e Converti button */}
                            <button
                              onClick={() => convertLead(lead)}
                              disabled={convertingLead[lead.id] || lead.status === "Chiuso"}
                              title="Approva e Converti in Host + Proprietà"
                              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {convertingLead[lead.id]
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <UserCheck className="w-3.5 h-3.5" />}
                              {!convertingLead[lead.id] && <span>Converti</span>}
                            </button>

                            {/* Delete button */}
                            <button
                              onClick={() => deleteLead(lead.id)}
                              disabled={leadDeleting[lead.id]}
                              title="Elimina lead"
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {leadDeleting[lead.id]
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── TAB: RESETS ── */}
            {activeTab === "resets" && (
              <motion.div
                key="resets"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h2 className="text-xl font-serif font-semibold">Richieste di Reset Password</h2>
                    <p className="text-muted-foreground text-sm mt-0.5">
                      Copia il link magico e invialo all'host via WhatsApp. Il link è <strong>monouso</strong>.
                    </p>
                  </div>
                  <button
                    onClick={fetchResets}
                    disabled={resetsLoading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-lg transition-colors"
                  >
                    {resetsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4" /> Aggiorna</>}
                  </button>
                </div>

                {resetsLoading && (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  </div>
                )}

                {!resetsLoading && resetRequests.length === 0 && (
                  <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center border-dashed">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <ShieldAlert className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Nessuna richiesta pendente</h3>
                    <p className="text-muted-foreground text-sm">
                      Quando un host richiede il reset della password, il link apparirà qui.
                    </p>
                  </div>
                )}

                {!resetsLoading && resetRequests.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {resetRequests.map((req) => {
                      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                      const magicLink = `${window.location.origin}${base}/reset-password/${req.resetToken}`;
                      return (
                        <motion.div
                          key={req.slug}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="glass-panel p-5 rounded-2xl border border-amber-200 bg-amber-50/30"
                        >
                          <div className="flex flex-col gap-4">
                            {/* Host info */}
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[15px] flex-shrink-0">
                                  {req.name[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-foreground">{req.name}</p>
                                  <p className="text-[12px] text-muted-foreground font-mono">{req.slug}</p>
                                  {req.email && (
                                    <p className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Mail className="w-3 h-3" /> {req.email}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right text-[11px] text-muted-foreground shrink-0">
                                {req.resetRequestedAt && format(new Date(req.resetRequestedAt), "dd MMM · HH:mm")}
                              </div>
                            </div>

                            {/* Magic link box */}
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Link Magico (monouso — mandalo via WhatsApp)</label>
                              <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2.5">
                                <Link2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                <span className="text-[12px] font-mono text-foreground truncate flex-1">{magicLink}</span>
                                <button
                                  onClick={() => navigator.clipboard.writeText(magicLink)}
                                  className="text-amber-600 hover:text-amber-800 flex-shrink-0 p-1 rounded-lg hover:bg-amber-50 transition-colors"
                                  title="Copia link"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => navigator.clipboard.writeText(magicLink)}
                                className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-all flex items-center gap-1.5"
                              >
                                <Copy className="w-3.5 h-3.5" /> Copia Link
                              </button>
                              <button
                                onClick={() => cancelReset(req.slug)}
                                disabled={cancellingReset === req.slug}
                                className="px-4 py-2 text-[13px] font-medium rounded-xl border border-border text-muted-foreground hover:bg-muted transition-all flex items-center gap-1.5 disabled:opacity-60"
                              >
                                {cancellingReset === req.slug ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                Annulla
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── TAB: HOSTS ── */}
            {activeTab === "hosts" && (
              <motion.div
                key="hosts"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="grid lg:grid-cols-12 gap-8 items-start"
              >
                {/* Left: hosts list */}
                <div className="lg:col-span-7 flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <h2 className="text-xl font-serif font-semibold">Host Registrati</h2>
                      <p className="text-muted-foreground text-sm mt-0.5">
                        Ogni host può accedere a tutte le strutture con la stessa email.
                      </p>
                    </div>
                    <button
                      onClick={fetchHosts}
                      disabled={hostsLoading}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-lg transition-colors"
                    >
                      {hostsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4" /> Aggiorna</>}
                    </button>
                  </div>

                  {hostsLoading && (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    </div>
                  )}

                  {!hostsLoading && hosts.length === 0 && (
                    <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center border-dashed">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <UserCog className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <h3 className="text-lg font-bold text-foreground mb-1">Nessun host</h3>
                      <p className="text-muted-foreground text-sm max-w-sm">
                        Usa il form per creare il primo host. Dopo, assegna le strutture tramite il campo "Email Proprietario" nella sezione Proprietà.
                      </p>
                    </div>
                  )}

                  {!hostsLoading && hosts.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {hosts.map((host) => (
                        <motion.div
                          key={host.email}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="glass-panel p-5 rounded-2xl"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <UserCog className="w-5 h-5 text-indigo-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-foreground text-[14px] truncate">{host.email}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Creato: {format(new Date(host.createdAt), 'dd MMM yyyy HH:mm')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => { setNewHostEmail(host.email); setNewHostPassword(""); }}
                                className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1"
                              >
                                <KeyRound className="w-3 h-3" /> Password
                              </button>
                              <button
                                onClick={() => deleteHost(host.email)}
                                disabled={hostDeleting[host.email]}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                              >
                                {hostDeleting[host.email] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: add/update host form */}
                <div className="lg:col-span-5 sticky top-8">
                  <div className="glass-panel rounded-[2rem] overflow-hidden">
                    <div className="bg-indigo-50 px-6 py-5 border-b border-border/50 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                        <Plus className="w-5 h-5" />
                      </div>
                      <h2 className="text-lg font-serif font-bold">Aggiungi / Aggiorna Host</h2>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-indigo-500" /> Email Host
                        </label>
                        <input
                          type="email"
                          value={newHostEmail}
                          onChange={(e) => { setNewHostEmail(e.target.value); setHostFormMsg(null); }}
                          placeholder="host@email.com"
                          className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-indigo-500" /> Password Host
                        </label>
                        <input
                          type="text"
                          value={newHostPassword}
                          onChange={(e) => { setNewHostPassword(e.target.value); setHostFormMsg(null); }}
                          placeholder="Nuova password"
                          className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-mono text-sm"
                        />
                      </div>

                      {hostFormMsg && (
                        <div className={`flex items-center gap-2 text-[12px] px-3 py-2.5 rounded-xl border ${
                          hostFormMsg.type === "ok"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-red-50 border-red-100 text-red-600"
                        }`}>
                          {hostFormMsg.type === "ok"
                            ? <CheckCheck className="w-3.5 h-3.5 flex-shrink-0" />
                            : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                          {hostFormMsg.text}
                        </div>
                      )}

                      <button
                        onClick={saveHost}
                        disabled={hostFormSaving}
                        className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                      >
                        {hostFormSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Salva Host</>}
                      </button>

                      <p className="text-[11px] text-muted-foreground text-center">
                        Se l'email esiste già, la password viene aggiornata. Assegna una struttura impostando "Email Proprietario" nella sezione Proprietà.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
