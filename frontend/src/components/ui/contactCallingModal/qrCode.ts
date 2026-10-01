import QRCode from 'qrcode'

/**
 * Normalizes phone numbers to standard international E.164 format.
 * E.g. '09207395938' -> '+639207395938'
 */
export function normalizePhoneNumber(rawNumber: string): string {
  const cleaned = rawNumber.replace(/[^0-9+]/g, '')
  if (cleaned.startsWith('09') && cleaned.length === 11) {
    return '+63' + cleaned.slice(1)
  }
  if (cleaned.startsWith('9') && cleaned.length === 10) {
    return '+63' + cleaned
  }
  if (!cleaned.startsWith('+') && cleaned.startsWith('63')) {
    return '+' + cleaned
  }
  return cleaned
}

/**
 * Generates an official, ISO/IEC 18004-compliant QR code data URL (PNG)
 * for mobile camera phone dialing with the standard 4-module quiet zone margin.
 */
export async function generateQrDataUrl(phoneNumber: string, size = 200): Promise<string> {
  const normalized = normalizePhoneNumber(phoneNumber)
  const telUri = `tel:${normalized}`

  return QRCode.toDataURL(telUri, {
    width: size,
    margin: 4, // ISO/IEC 18004 standard quiet margin for camera recognition
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}
