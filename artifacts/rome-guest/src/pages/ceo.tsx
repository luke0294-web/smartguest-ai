import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import {
  Building, Plus, Trash2, ExternalLink, KeyRound, Loader2, Save,
  Users, AlertCircle, Sparkles, QrCode, X, Download, Inbox,
  UserCog, Copy, CheckCheck, Link2,
} from "lucide-react";
import { format } from "date-fns";

import { useListProperties, useCreateProperty, useDeleteProperty, getListPropertiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const createPropertySchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio"),
  slug: z.string().min(1, "Lo slug è obbligatorio").regex(/^[a-z0-9-]+$/, "Solo lettere minuscole, numeri e trattini"),
  whatsappNumber: z.string().optional(),
  content: z.string().min(1, "Il regolamento è obbligatorio"),
});

type CreatePropertyValues = z.infer<typeof createPropertySchema>;

interface Lead {
  id: number;
  hostName: string;
  email: string;
  propertyName: string;
  createdAt: string;
}

function QrModal({ property, onClose }: { property: { name: string; slug: string }; onClose: () => void }) {
  const svgRef = useRef<HTMLDivElement>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const chatUrl = `${window.location.origin}${base}/guest/${property.slug}`;

  const handleDownload = () => {
    const svg = svgRef.current?.querySelector("svg");
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${property.slug}.svg`;
    a.click();
    URL.revokeObjectURL(url);
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
          <div ref={svgRef} className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm">
            <QRCodeSVG
              value={chatUrl}
              size={200}
              bgColor="#ffffff"
              fgColor="#1d4ed8"
              level="M"
              marginSize={1}
            />
          </div>

          <div className="w-full bg-gray-50 rounded-xl px-3 py-2 text-center">
            <p className="text-[11px] text-gray-400 mb-0.5">Link chat ospiti</p>
            <p className="text-[12px] font-mono text-gray-600 break-all">{chatUrl}</p>
          </div>

          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3 rounded-2xl transition-colors"
          >
            <Download className="w-4 h-4" />
            Scarica QR Code (SVG)
          </button>

          <button
            onClick={() => navigator.clipboard.writeText(chatUrl)}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 font-medium text-sm py-3 rounded-2xl transition-colors"
          >
            Copia link
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function HostPasswordModal({
  property,
  ceoPassword,
  onClose,
}: {
  property: { name: string; slug: string; hostPassword?: string | null };
  ceoPassword: string;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const hostLink = `${window.location.origin}${base}/host/${property.slug}`;

  const handleSave = async () => {
    if (!newPassword.trim()) return;
    setError("");
    setIsSaving(true);
    try {
      const res = await fetch(`${base}/api/properties/${property.slug}/host-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ceoPassword, hostPassword: newPassword.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore nel salvataggio.");
      setSaved(true);
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
          {/* Current status */}
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium ${property.hostPassword ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {property.hostPassword ? (
              <><CheckCheck className="w-4 h-4" /> Password host già impostata</>
            ) : (
              <><AlertCircle className="w-4 h-4" /> Nessuna password impostata</>
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
            <p className="text-[10px] text-gray-400">Invia questo link all'host. Dovrà usarlo con la password impostata qui sotto.</p>
          </div>

          {/* Set password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">
              {property.hostPassword ? "Reimposta password host" : "Imposta password host"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setSaved(false); }}
                placeholder="es. casa2024"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all font-mono"
              />
              <button
                onClick={handleSave}
                disabled={isSaving || !newPassword.trim()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? "" : "Salva"}
              </button>
            </div>
          </div>

          {saved && (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm px-4 py-2.5 rounded-xl">
              <CheckCheck className="w-4 h-4" /> Password aggiornata con successo!
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function CeoPanel() {
  const [password, setPassword] = useState("");
  const [authAttempt, setAuthAttempt] = useState(false);
  const [activeTab, setActiveTab] = useState<"properties" | "leads">("properties");
  const [qrProperty, setQrProperty] = useState<{ name: string; slug: string } | null>(null);
  const [hostManageProp, setHostManageProp] = useState<{ name: string; slug: string; hostPassword?: string | null } | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const queryClient = useQueryClient();

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: properties, isLoading: isListLoading, error: listError } = useListProperties(
    { ceoPassword: password },
    {
      query: {
        enabled: authAttempt && !!password,
        retry: false,
      }
    }
  );

  const { mutate: createProperty, isPending: isCreating } = useCreateProperty();
  const { mutate: deleteProperty, isPending: isDeleting } = useDeleteProperty();

  const form = useForm<CreatePropertyValues>({
    resolver: zodResolver(createPropertySchema),
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
      setAuthAttempt(false);
      setPassword("");
      alert("Password errata. Riprova.");
    }
  }, [listError]);

  const fetchLeads = async () => {
    if (!password) return;
    setLeadsLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/leads?ceoPassword=${encodeURIComponent(password)}`);
      const data = await res.json();
      if (res.ok) setLeads(data);
    } finally {
      setLeadsLoading(false);
    }
  };

  useEffect(() => {
    if (authAttempt && activeTab === "leads") {
      fetchLeads();
    }
  }, [activeTab, authAttempt]);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pwd = fd.get("password") as string;
    if (pwd) {
      setPassword(pwd);
      setAuthAttempt(true);
    }
  };

  const onSubmit = (data: CreatePropertyValues) => {
    createProperty(
      { data: { ceoPassword: password, ...data } },
      {
        onSuccess: () => {
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey({ ceoPassword: password }) });
        },
        onError: (err: any) => {
          alert(`Errore: ${err.response?.data?.error || 'Impossibile creare la proprietà'}`);
        }
      }
    );
  };

  const handleDelete = (slug: string) => {
    if (window.confirm(`Sei sicuro di voler eliminare la proprietà ${slug}?`)) {
      deleteProperty(
        { slug, data: { ceoPassword: password } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey({ ceoPassword: password }) });
          },
          onError: () => alert("Errore durante l'eliminazione"),
        }
      );
    }
  };

  // ── AUTH SCREEN ──
  if (!authAttempt || (!properties && !isListLoading)) {
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
          <p className="text-muted-foreground text-sm mb-8">Accesso riservato amministratori RomeGuest AI</p>
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
              className="w-full bg-primary text-primary-foreground font-medium py-3.5 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              {isListLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Accedi al Pannello"}
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
        {qrProperty && (
          <QrModal property={qrProperty} onClose={() => setQrProperty(null)} />
        )}
        {hostManageProp && (
          <HostPasswordModal
            property={hostManageProp}
            ceoPassword={password}
            onClose={() => setHostManageProp(null)}
          />
        )}
      </AnimatePresence>

      <div className="min-h-[100dvh] flex flex-col md:py-8 md:px-6">
        <div className="max-w-7xl w-full mx-auto flex flex-col gap-6">

          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 sm:px-8 rounded-[2rem]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-serif font-bold text-foreground leading-tight">RomeGuest AI CEO</h1>
                <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-0.5">
                  <Users className="w-3.5 h-3.5" /> Professional Host Suite
                </p>
              </div>
            </div>
            <a href="/" className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-lg transition-colors self-start sm:self-auto">
              Esci
            </a>
          </header>

          {/* Tabs */}
          <div className="flex gap-2 px-1">
            <button
              onClick={() => setActiveTab("properties")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
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
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
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
                        <div className="flex flex-col sm:flex-row gap-4 justify-between">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <h3 className="text-[16px] font-bold text-foreground flex items-center gap-2 flex-wrap">
                              {prop.name}
                              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold tracking-wide uppercase">
                                ATTIVA
                              </span>
                            </h3>
                            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
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
                              onClick={() => setHostManageProp({ name: prop.name, slug: prop.slug, hostPassword: (prop as any).hostPassword })}
                              className="flex-1 sm:flex-none px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 text-[13px]"
                            >
                              <UserCog className="w-3.5 h-3.5" />
                              Gestisci Host
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
                    {leads.map((lead) => (
                      <motion.div
                        key={lead.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[15px] flex-shrink-0">
                            {lead.hostName[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-[15px]">{lead.hostName}</p>
                            <p className="text-muted-foreground text-sm">{lead.email}</p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:items-end gap-1 pl-14 sm:pl-0">
                          <span className="text-sm font-medium text-foreground">🏠 {lead.propertyName}</span>
                          <span className="text-[12px] text-muted-foreground">
                            {format(new Date(lead.createdAt), "dd MMM yyyy · HH:mm")}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
