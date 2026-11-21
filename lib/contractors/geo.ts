/**
 * Town centres of the portfolio's cities and the contractors' bases. Distances are
 * measured centre to centre: good enough to tell "in town" from "an hour away".
 * Production would geocode the actual addresses.
 */
export const cityCentres = {
  Aachen: [50.7753, 6.0839],
  Düsseldorf: [51.2277, 6.7735],
  Köln: [50.9375, 6.9603],
  Neuss: [51.2042, 6.6879],
  Duisburg: [51.4344, 6.7623],
  Krefeld: [51.3388, 6.5853],
  Essen: [51.4556, 7.0116],
  Mönchengladbach: [51.1805, 6.4428],
  Ratingen: [51.2973, 6.8494],
  Hilden: [51.1714, 6.9394],
  Leverkusen: [51.0459, 7.0192],
  Meerbusch: [51.2541, 6.688],
} as const satisfies Record<string, readonly [number, number]>

export type City = keyof typeof cityCentres

export const cities = Object.keys(cityCentres) as [City, ...City[]]

export function isCity(name: string): name is City {
  return name in cityCentres
}

/** Great-circle distance in whole kilometres; null when a town is unknown. */
export function distanceKm(from: string, to: string): number | null {
  if (!isCity(from) || !isCity(to)) return null
  if (from === to) return 0
  const [lat1, lon1] = cityCentres[from]
  const [lat2, lon2] = cityCentres[to]
  const rad = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(a)))
}
