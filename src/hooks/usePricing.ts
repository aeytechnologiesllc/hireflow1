import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Stripe price IDs for each plan and interval
export const STRIPE_PRICES = {
  growth: {
    monthly: "price_1SeWKzJoMc2msNl4m1z9SDUL",
    yearly: "price_1SeWL5JoMc2msNl4j8st2mmO",
  },
  business: {
    monthly: "price_1SeWL7JoMc2msNl4380r2cSi",
    yearly: "price_1SeWL9JoMc2msNl4NNQVohgY",
  },
};

// Regional pricing configuration with local currencies
// Tier 1: Premium markets (full price)
// Tier 2: Europe (EUR)
// Tier 3: Emerging markets (~40% discount)
// Tier 4: SEA/Africa (~60% discount)
export const REGIONAL_PRICING: Record<string, {
  currency: string;
  symbol: string;
  growth: { monthly: number; yearly: number };
  business: { monthly: number; yearly: number };
  tier: number;
}> = {
  // Tier 1 - Premium Markets
  US: { currency: "USD", symbol: "$", growth: { monthly: 29, yearly: 290 }, business: { monthly: 49, yearly: 490 }, tier: 1 },
  CA: { currency: "CAD", symbol: "C$", growth: { monthly: 39, yearly: 390 }, business: { monthly: 65, yearly: 650 }, tier: 1 },
  GB: { currency: "GBP", symbol: "£", growth: { monthly: 23, yearly: 230 }, business: { monthly: 39, yearly: 390 }, tier: 1 },
  AU: { currency: "AUD", symbol: "A$", growth: { monthly: 45, yearly: 450 }, business: { monthly: 75, yearly: 750 }, tier: 1 },
  NZ: { currency: "NZD", symbol: "NZ$", growth: { monthly: 49, yearly: 490 }, business: { monthly: 79, yearly: 790 }, tier: 1 },
  CH: { currency: "CHF", symbol: "CHF", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 1 },
  
  // Tier 2 - Europe
  DE: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  FR: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  IT: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  ES: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  NL: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  BE: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  AT: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  IE: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  PT: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  FI: { currency: "EUR", symbol: "€", growth: { monthly: 27, yearly: 270 }, business: { monthly: 45, yearly: 450 }, tier: 2 },
  SE: { currency: "SEK", symbol: "kr", growth: { monthly: 299, yearly: 2990 }, business: { monthly: 499, yearly: 4990 }, tier: 2 },
  NO: { currency: "NOK", symbol: "kr", growth: { monthly: 299, yearly: 2990 }, business: { monthly: 499, yearly: 4990 }, tier: 2 },
  DK: { currency: "DKK", symbol: "kr", growth: { monthly: 199, yearly: 1990 }, business: { monthly: 329, yearly: 3290 }, tier: 2 },
  PL: { currency: "PLN", symbol: "zł", growth: { monthly: 99, yearly: 990 }, business: { monthly: 169, yearly: 1690 }, tier: 2 },
  
  // Tier 3 - Emerging Markets (~40% discount)
  IN: { currency: "INR", symbol: "₹", growth: { monthly: 999, yearly: 9990 }, business: { monthly: 1999, yearly: 19990 }, tier: 3 },
  BR: { currency: "BRL", symbol: "R$", growth: { monthly: 59, yearly: 590 }, business: { monthly: 99, yearly: 990 }, tier: 3 },
  MX: { currency: "MXN", symbol: "$", growth: { monthly: 299, yearly: 2990 }, business: { monthly: 499, yearly: 4990 }, tier: 3 },
  TR: { currency: "TRY", symbol: "₺", growth: { monthly: 399, yearly: 3990 }, business: { monthly: 699, yearly: 6990 }, tier: 3 },
  ZA: { currency: "ZAR", symbol: "R", growth: { monthly: 299, yearly: 2990 }, business: { monthly: 499, yearly: 4990 }, tier: 3 },
  AE: { currency: "AED", symbol: "د.إ", growth: { monthly: 69, yearly: 690 }, business: { monthly: 109, yearly: 1090 }, tier: 3 },
  SG: { currency: "SGD", symbol: "S$", growth: { monthly: 39, yearly: 390 }, business: { monthly: 65, yearly: 650 }, tier: 3 },
  MY: { currency: "MYR", symbol: "RM", growth: { monthly: 79, yearly: 790 }, business: { monthly: 139, yearly: 1390 }, tier: 3 },
  TH: { currency: "THB", symbol: "฿", growth: { monthly: 599, yearly: 5990 }, business: { monthly: 999, yearly: 9990 }, tier: 3 },
  AR: { currency: "USD", symbol: "$", growth: { monthly: 17, yearly: 170 }, business: { monthly: 29, yearly: 290 }, tier: 3 },
  CL: { currency: "USD", symbol: "$", growth: { monthly: 17, yearly: 170 }, business: { monthly: 29, yearly: 290 }, tier: 3 },
  CO: { currency: "USD", symbol: "$", growth: { monthly: 17, yearly: 170 }, business: { monthly: 29, yearly: 290 }, tier: 3 },
  JP: { currency: "JPY", symbol: "¥", growth: { monthly: 2900, yearly: 29000 }, business: { monthly: 4900, yearly: 49000 }, tier: 3 },
  KR: { currency: "KRW", symbol: "₩", growth: { monthly: 29000, yearly: 290000 }, business: { monthly: 49000, yearly: 490000 }, tier: 3 },
  
  // Tier 4 - SEA/Africa (~60% discount)
  PH: { currency: "PHP", symbol: "₱", growth: { monthly: 599, yearly: 5990 }, business: { monthly: 999, yearly: 9990 }, tier: 4 },
  NG: { currency: "USD", symbol: "$", growth: { monthly: 12, yearly: 120 }, business: { monthly: 19, yearly: 190 }, tier: 4 },
  KE: { currency: "USD", symbol: "$", growth: { monthly: 12, yearly: 120 }, business: { monthly: 19, yearly: 190 }, tier: 4 },
  ID: { currency: "IDR", symbol: "Rp", growth: { monthly: 149000, yearly: 1490000 }, business: { monthly: 249000, yearly: 2490000 }, tier: 4 },
  VN: { currency: "VND", symbol: "₫", growth: { monthly: 299000, yearly: 2990000 }, business: { monthly: 499000, yearly: 4990000 }, tier: 4 },
  PK: { currency: "PKR", symbol: "Rs", growth: { monthly: 2999, yearly: 29990 }, business: { monthly: 4999, yearly: 49990 }, tier: 4 },
  BD: { currency: "BDT", symbol: "৳", growth: { monthly: 1499, yearly: 14990 }, business: { monthly: 2499, yearly: 24990 }, tier: 4 },
  GH: { currency: "USD", symbol: "$", growth: { monthly: 12, yearly: 120 }, business: { monthly: 19, yearly: 190 }, tier: 4 },
  EG: { currency: "USD", symbol: "$", growth: { monthly: 12, yearly: 120 }, business: { monthly: 19, yearly: 190 }, tier: 4 },
  
  // Default fallback
  DEFAULT: { currency: "USD", symbol: "$", growth: { monthly: 29, yearly: 290 }, business: { monthly: 49, yearly: 490 }, tier: 1 },
};

export interface PricingData {
  countryCode: string;
  currency: string;
  symbol: string;
  growth: {
    monthly: number;
    yearly: number;
    monthlyFormatted: string;
    yearlyFormatted: string;
    yearlyMonthly: string; // yearly price per month
  };
  business: {
    monthly: number;
    yearly: number;
    monthlyFormatted: string;
    yearlyFormatted: string;
    yearlyMonthly: string;
  };
  tier: number;
  isLoading: boolean;
}

function formatPrice(amount: number, symbol: string, currency: string): string {
  // Handle currencies that typically don't show decimals
  const noDecimalCurrencies = ["JPY", "KRW", "VND", "IDR"];
  if (noDecimalCurrencies.includes(currency)) {
    return `${symbol}${amount.toLocaleString()}`;
  }
  // For most currencies, show no decimals for clean round numbers
  if (amount % 1 === 0) {
    return `${symbol}${amount.toLocaleString()}`;
  }
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function usePricing(): PricingData {
  const [countryCode, setCountryCode] = useState<string>("US");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const detectCountry = async () => {
      try {
        // Try to get from localStorage first for faster load
        const cached = localStorage.getItem("user_country");
        if (cached) {
          setCountryCode(cached);
          setIsLoading(false);
        }

        // Call geolocate-ip edge function
        const { data, error } = await supabase.functions.invoke("geolocate-ip");
        
        if (!error && data?.countryCode) {
          const code = data.countryCode;
          setCountryCode(code);
          localStorage.setItem("user_country", code);
        }
      } catch (err) {
        console.log("Geolocation failed, using default:", err);
      } finally {
        setIsLoading(false);
      }
    };

    detectCountry();
  }, []);

  const pricing = REGIONAL_PRICING[countryCode] || REGIONAL_PRICING.DEFAULT;

  return {
    countryCode,
    currency: pricing.currency,
    symbol: pricing.symbol,
    growth: {
      monthly: pricing.growth.monthly,
      yearly: pricing.growth.yearly,
      monthlyFormatted: formatPrice(pricing.growth.monthly, pricing.symbol, pricing.currency),
      yearlyFormatted: formatPrice(pricing.growth.yearly, pricing.symbol, pricing.currency),
      yearlyMonthly: formatPrice(Math.round(pricing.growth.yearly / 12), pricing.symbol, pricing.currency),
    },
    business: {
      monthly: pricing.business.monthly,
      yearly: pricing.business.yearly,
      monthlyFormatted: formatPrice(pricing.business.monthly, pricing.symbol, pricing.currency),
      yearlyFormatted: formatPrice(pricing.business.yearly, pricing.symbol, pricing.currency),
      yearlyMonthly: formatPrice(Math.round(pricing.business.yearly / 12), pricing.symbol, pricing.currency),
    },
    tier: pricing.tier,
    isLoading,
  };
}
