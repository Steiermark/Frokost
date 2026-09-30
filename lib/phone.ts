// Danish numbers may omit +45; international numbers need a country code.
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  let phone = value.trim().replace(/[\s().-]/g, '');
  if (/^\d{8}$/.test(phone)) phone = '+45' + phone;
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (phone.startsWith('+45') && !/^\+45\d{8}$/.test(phone)) return null;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
