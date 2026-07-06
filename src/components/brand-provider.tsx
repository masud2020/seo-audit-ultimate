import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBrand, type BrandSettings } from "@/lib/brand.functions";

const defaultBrand: BrandSettings = {
  app_name: "SEO Audit",
  logo_url: null, favicon_url: null,
  primary_color: null, accent_color: null,
  support_email: null, company_address: null,
  privacy_url: null, terms_url: null, footer_text: null,
};

const BrandContext = createContext<BrandSettings>(defaultBrand);

// Convert #RRGGBB to "H S% L%" for Tailwind HSL tokens.
function hexToHsl(hex: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let hh = 0; let s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hh = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hh = (b - r) / d + 2; break;
      case b: hh = (r - g) / d + 4; break;
    }
    hh /= 6;
  }
  return `${Math.round(hh * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const fetchBrand = useServerFn(getBrand);
  const { data } = useQuery({
    queryKey: ["brand"],
    queryFn: () => fetchBrand(),
    staleTime: 60_000,
  });
  const brand = useMemo<BrandSettings>(() => ({ ...defaultBrand, ...(data ?? {}) }), [data]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (brand.primary_color) {
      const hsl = hexToHsl(brand.primary_color);
      if (hsl) root.style.setProperty("--primary", hsl);
    } else {
      root.style.removeProperty("--primary");
    }
    if (brand.accent_color) {
      const hsl = hexToHsl(brand.accent_color);
      if (hsl) root.style.setProperty("--accent", hsl);
    } else {
      root.style.removeProperty("--accent");
    }
    if (brand.app_name) document.title = brand.app_name;
    if (brand.favicon_url) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = brand.favicon_url;
    }
  }, [brand]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandSettings {
  return useContext(BrandContext);
}