/**
 * Detección de outliers (spec §17) usando el score-Z modificado basado en la mediana
 * (MAD — median absolute deviation), más robusto que desviación estándar con N pequeño
 * (típico en proyectos históricos: pocos candidatos por búsqueda).
 */
export interface OutlierFlag {
  index: number;
  isOutlier: boolean;
  reason?: string;
}

export function detectOutliers(values: number[], zThreshold: number): OutlierFlag[] {
  if (values.length < 3) {
    // Con menos de 3 puntos no hay base estadística confiable para señalar outliers.
    return values.map((_, index) => ({ index, isOutlier: false }));
  }

  const sorted = [...values].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const absDeviations = values.map((v) => Math.abs(v - median));
  const mad = percentile([...absDeviations].sort((a, b) => a - b), 0.5);

  return values.map((value, index) => {
    if (mad === 0) return { index, isOutlier: false };
    const modifiedZ = (0.6745 * (value - median)) / mad;
    const isOutlier = Math.abs(modifiedZ) > zThreshold;
    return {
      index,
      isOutlier,
      reason: isOutlier
        ? `Esfuerzo total (${Math.round(value)}h) se desvía ${Math.abs(modifiedZ).toFixed(1)}σ de la mediana del grupo de referencias (${Math.round(median)}h) — posible caso atípico (cambios de alcance, problemas no representativos).`
        : undefined,
    };
  });
}

function percentile(sortedValues: number[], p: number): number {
  const idx = p * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo] ?? 0;
  const w = idx - lo;
  return (sortedValues[lo] ?? 0) * (1 - w) + (sortedValues[hi] ?? 0) * w;
}
