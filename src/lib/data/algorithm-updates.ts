export interface AlgoUpdate {
  date: string;
  name: string;
  category: "core" | "spam" | "product" | "helpful" | "reviews" | "other";
  summary: string;
  impact: string;
  takeaways: string[];
}

export const ALGORITHM_UPDATES: AlgoUpdate[] = [
  { date: "2026-03-12", name: "March 2026 Core Update", category: "core", summary: "Broad core update focused on E-E-A-T signal weighting.", impact: "Sites with thin author signals saw declines.", takeaways: ["Add author bios", "Cite primary sources"] },
  { date: "2026-01-22", name: "January 2026 Spam Update", category: "spam", summary: "Targets scaled content abuse and expired-domain reuse.", impact: "AI-generated boilerplate sites hit hard.", takeaways: ["Audit auto-generated content", "Avoid buying expired domains for content"] },
  { date: "2025-11-05", name: "November 2025 Core Update", category: "core", summary: "Refines relevance signals for informational queries.", impact: "Long-form guides gained visibility.", takeaways: ["Deepen topic coverage", "Improve internal linking"] },
  { date: "2025-09-18", name: "September 2025 Helpful Content", category: "helpful", summary: "Rewards user-first content, penalizes SEO-first pages.", impact: "Aggregators and thin comparison pages fell.", takeaways: ["Add first-hand experience", "Show original data"] },
  { date: "2025-08-01", name: "August 2025 Product Reviews", category: "reviews", summary: "Elevates in-depth product reviews with hands-on testing.", impact: "Affiliate sites without demos lost rankings.", takeaways: ["Add original photos", "Include pros/cons"] },
  { date: "2025-06-10", name: "June 2025 Core Update", category: "core", summary: "Adjusts freshness and authority weighting.", impact: "News and evergreen mix improved.", takeaways: ["Refresh cornerstone pages"] },
  { date: "2025-03-05", name: "March 2025 Core Update", category: "core", summary: "Standard broad core update.", impact: "Mixed movement across niches.", takeaways: ["Monitor GSC after 2 weeks"] },
  { date: "2024-12-12", name: "December 2024 Spam Update", category: "spam", summary: "Cracks down on link spam networks.", impact: "PBN-reliant sites dropped.", takeaways: ["Disavow toxic links"] },
];

export const CATEGORY_COLORS: Record<string, string> = {
  core: "hsl(155 55% 55%)",
  spam: "hsl(0 65% 55%)",
  product: "hsl(45 90% 60%)",
  helpful: "hsl(210 70% 60%)",
  reviews: "hsl(280 60% 60%)",
  other: "hsl(220 10% 55%)",
};