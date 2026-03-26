import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-[100dvh] items-center justify-center p-6 bg-background">
      <div className="glass-panel p-8 md:p-12 rounded-[2rem] max-w-md w-full text-center flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2 shadow-inner">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Pagina non trovata</h1>
        <p className="text-muted-foreground">
          Sembra che il link non sia corretto o la proprietà sia stata rimossa.
        </p>
        <Link href="/ceo" className="mt-6 px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all">
          Vai al Pannello
        </Link>
      </div>
    </div>
  );
}
