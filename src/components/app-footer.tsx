import { Link } from "@tanstack/react-router";
import { useBrand } from "@/components/brand-provider";
import { Mail, MapPin, Shield, FileText, Search } from "lucide-react";

export function AppFooter() {
  const brand = useBrand();
  const year = new Date().getFullYear();
  const appName = brand.app_name || "SEO Audit Tool";
  const footerText = brand.footer_text || `© ${year} ${appName}. All rights reserved.`;

  return (
    <footer className="border-t border-border bg-background/60 mt-auto">
      <div className="mx-auto max-w-7xl px-6 py-8 grid gap-8 md:grid-cols-4 text-sm">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="" className="h-6 w-6 rounded object-cover" />
            ) : (
              <div className="grid h-6 w-6 place-items-center rounded bg-primary text-primary-foreground">
                <Search className="h-3.5 w-3.5" />
              </div>
            )}
            <span className="font-semibold">{appName}</span>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            AI-powered SEO audits, keyword tracking, and site monitoring in one workspace.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</div>
          <ul className="space-y-1.5">
            <li><Link to="/dashboard" className="hover:text-foreground text-muted-foreground">Dashboard</Link></li>
            <li><Link to="/audit/new" className="hover:text-foreground text-muted-foreground">New Audit</Link></li>
            <li><Link to="/site-audit" className="hover:text-foreground text-muted-foreground">Whole Site Audit</Link></li>
            <li><Link to="/keywords" className="hover:text-foreground text-muted-foreground">Keyword Tracker</Link></li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</div>
          <ul className="space-y-1.5">
            <li><Link to="/profile" className="hover:text-foreground text-muted-foreground">Your Profile</Link></li>
            <li><Link to="/preferences" className="hover:text-foreground text-muted-foreground">Preferences</Link></li>
            <li><Link to="/history" className="hover:text-foreground text-muted-foreground">Audit History</Link></li>
            <li><Link to="/scheduled" className="hover:text-foreground text-muted-foreground">Scheduled Audits</Link></li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact & Legal</div>
          <ul className="space-y-1.5 text-muted-foreground">
            {brand.support_email && (
              <li className="flex items-start gap-2">
                <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <a href={`mailto:${brand.support_email}`} className="hover:text-foreground break-all">
                  {brand.support_email}
                </a>
              </li>
            )}
            {brand.company_address && (
              <li className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="whitespace-pre-line">{brand.company_address}</span>
              </li>
            )}
            {brand.privacy_url && (
              <li className="flex items-start gap-2">
                <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <a href={brand.privacy_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  Privacy Policy
                </a>
              </li>
            )}
            {brand.terms_url && (
              <li className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <a href={brand.terms_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  Terms of Service
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span className="whitespace-pre-line">{footerText}</span>
          <span>
            Manage footer in <Link to="/preferences" className="hover:text-foreground underline">Preferences</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}