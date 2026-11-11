/**
 * Komut kimliği (CommandId) için RFC 4122 v4 UUID.
 * `crypto.randomUUID` yalnızca güvenli bağlamda (HTTPS / localhost) tanımlıdır; telefondan
 * yerel ağ adresiyle (http://192.168.x.x) açıldığında yoktur. `getRandomValues` her bağlamda
 * çalışır ve aynı kriptografik kaynağı kullanır.
 */
export function newCommandId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // sürüm 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 varyantı
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
