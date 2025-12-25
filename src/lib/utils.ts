import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format number with commas (e.g., 120000 → "120,000")
export function formatNumberWithCommas(value: string | number): string {
  if (!value && value !== 0) return "";
  const num = typeof value === "string" ? parseInt(value.replace(/\D/g, ""), 10) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString();
}

// Parse formatted number back to raw number string (e.g., "120,000" → "120000")
export function parseFormattedNumber(value: string): string {
  return value.replace(/\D/g, "");
}

// Format phone number with dashes (e.g., 5551234567 → "555-123-4567")
export function formatPhoneNumber(value: string): string {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
}

// Format file size with appropriate units (B, KB, or MB)
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
