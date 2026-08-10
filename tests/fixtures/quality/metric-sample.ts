export function metricSample(a: boolean, b: boolean, c: boolean, d: number, e: number, f: number): number {
  if (a && b) {
    for (let index = 0; index < 1; index += 1) {
      return c ? d : e;
    }
  }
  return f;
}
