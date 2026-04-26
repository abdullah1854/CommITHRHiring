import { Link } from "wouter";
import { Compass, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="max-w-lg w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 shadow-sm shadow-primary/30 mb-6">
          <Compass className="w-10 h-10 text-white" />
        </div>
        <p className="text-sm font-semibold tracking-wider text-primary uppercase mb-2">Error 404</p>
        <h1 className="text-4xl md:text-5xl font-display font-extrabold text-foreground mb-4">
          Page not found
        </h1>
        <p className="text-muted-foreground text-lg mb-10 max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-foreground text-background rounded-xl font-semibold shadow-sm hover:opacity-90 transition-all"
          >
            <Home className="w-4 h-4" />
            Back Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-card border border-border text-foreground rounded-xl font-semibold hover:bg-muted transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
