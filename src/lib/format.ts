const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 })
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** ₹2,500 or ₹20,312.50 */
export function formatINR(amount: number | string): string {
  const n = Number(amount)
  return Number.isInteger(n) ? inr.format(n) : inrExact.format(n)
}

export const formatNumber = (n: number | string) => num.format(Number(n))
export const formatLitres = (n: number | string) => `${num.format(Number(n))} L`
export const formatKva = (n: number | string) => `${num.format(Number(n))} kVA`

/** Mobile shown as +91 98765 43210 */
export function formatMobile(m: string): string {
  return m.length === 10 ? `+91 ${m.slice(0, 5)} ${m.slice(5)}` : m
}

export function formatDateTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso))
}

export function formatDate(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export function formatTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
}
