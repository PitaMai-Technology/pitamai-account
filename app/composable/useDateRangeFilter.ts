type DateFilter = {
  start?: Date;
  end?: Date;
};

const JST_OFFSET_MS = 9 * 3600 * 1000;

export function toJstStartOfDay(v: any): Date | undefined {
  if (!v) return undefined;

  if (typeof v.toDate === 'function') {
    return v.toDate('Asia/Tokyo');
  }

  const d = new Date(v);
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0) -
      JST_OFFSET_MS
  );
}

export function toJstEndOfDay(v: any): Date | undefined {
  if (!v) return undefined;

  if (typeof v.toDate === 'function') {
    const startOfDay = v.toDate('Asia/Tokyo') as Date;
    return new Date(
      startOfDay.getTime() + (23 * 3600 + 59 * 60 + 59) * 1000 + 999
    );
  }

  const d = new Date(v);
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) -
      JST_OFFSET_MS
  );
}

export function useDateRangeFilter(options: {
  calendarRange: Ref<any>;
  dateFilter: DateFilter;
  onRangeChanged: () => void;
}) {
  watch(
    options.calendarRange,
    value => {
      options.dateFilter.start = toJstStartOfDay(value?.start);
      options.dateFilter.end = toJstEndOfDay(value?.end ?? value?.start);
      options.onRangeChanged();
    },
    { deep: true }
  );
}
