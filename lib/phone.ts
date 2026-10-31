export function digitsOnly(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const local = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (local.length === 10) return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  return phone;
}
