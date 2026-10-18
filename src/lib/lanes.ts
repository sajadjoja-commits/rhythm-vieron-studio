// Greedy interval packing: assign each item to the first lane where it does not
// overlap in time with an already-placed item. Enables multi-track (matrix under
// matrix) rendering without a manual lane field.
export interface TimeRange {
  start: number;
  end: number;
}

export function packLanes<T extends TimeRange>(items: T[]): { item: T; lane: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  const result: { item: T; lane: number }[] = [];
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => item.start >= end - 0.001);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    result.push({ item, lane });
  }
  return result;
}

export function laneCount<T extends TimeRange>(items: T[]): number {
  if (!items.length) return 0;
  return Math.max(1, ...packLanes(items).map((r) => r.lane + 1));
}
