import { round2 } from "@/lib/utils";

type Fill = { id: number; km: number; litres: number; amount: number; isFullTank: boolean };

/**
 * Mileage from the full-tank method: litres added since the previous full tank were
 * burned over the distance since that fill. Partial fills are carried into the next full one.
 */
export function fuelEfficiency(fills: Fill[]) {
  const sorted = [...fills].sort((a, b) => a.km - b.km || a.id - b.id);
  const perFill = new Map<number, { kmPerLitre: number; costPerKm: number; distance: number }>();

  let lastFull: Fill | null = null;
  let litres = 0;
  let cost = 0;
  let totalDistance = 0;
  let totalLitres = 0;
  let totalCost = 0;

  for (const fill of sorted) {
    if (lastFull) {
      litres += fill.litres;
      cost += fill.amount;
    }
    if (fill.isFullTank) {
      if (lastFull && litres > 0) {
        const distance = fill.km - lastFull.km;
        if (distance > 0) {
          perFill.set(fill.id, {
            distance,
            kmPerLitre: round2(distance / litres),
            costPerKm: round2(cost / distance),
          });
          totalDistance += distance;
          totalLitres += litres;
          totalCost += cost;
        }
      }
      lastFull = fill;
      litres = 0;
      cost = 0;
    }
  }

  return {
    perFill,
    kmPerLitre: totalLitres > 0 ? round2(totalDistance / totalLitres) : null,
    costPerKm: totalDistance > 0 ? round2(totalCost / totalDistance) : null,
  };
}
