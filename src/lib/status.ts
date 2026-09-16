export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

export const CUSTOMER_STATUS_TONE: Record<string, Tone> = { ACTIVE: "success", INACTIVE: "neutral", BLACKLISTED: "danger" };
export const CUSTOMER_TYPE_TONE: Record<string, Tone> = { REGULAR: "neutral", VIP: "warning", CORPORATE: "info" };

export const CAR_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Available", tone: "success" },
  RENTED: { label: "Rented", tone: "danger" },
  SERVICE: { label: "In service", tone: "warning" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};

export const PAYMENT_STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  SUCCESS: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "warning",
};

export const PAYMENT_MODE_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

export const PAYMENT_TYPE_OPTIONS = [
  { value: "ADVANCE", label: "Advance" },
  { value: "PARTIAL", label: "Part payment" },
  { value: "FINAL", label: "Final settlement" },
  { value: "SECURITY_DEPOSIT", label: "Security deposit" },
  { value: "PENALTY", label: "Penalty / challan" },
  { value: "OTHER", label: "Other" },
];

export const labelOf = (options: Array<{ value: string; label: string }>, value: string) =>
  options.find((o) => o.value === value)?.label ?? value;

export const FUEL_TYPE_OPTIONS = [
  { value: "PETROL", label: "Petrol" },
  { value: "DIESEL", label: "Diesel" },
  { value: "CNG", label: "CNG" },
  { value: "ELECTRIC", label: "Electric" },
  { value: "HYBRID", label: "Hybrid" },
];

export const TRANSMISSION_OPTIONS = [
  { value: "MANUAL", label: "Manual" },
  { value: "AUTOMATIC", label: "Automatic" },
];

export const MAINTENANCE_TYPE_OPTIONS = [
  { value: "GENERAL_SERVICE", label: "General service" },
  { value: "REPAIR", label: "Repair" },
  { value: "TYRE", label: "Tyre" },
  { value: "BATTERY", label: "Battery" },
  { value: "BODY_WORK", label: "Body work" },
  { value: "OTHER", label: "Other" },
];

export const INVOICE_STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PAID: "success",
  PARTIALLY_PAID: "warning",
  CANCELLED: "danger",
};
