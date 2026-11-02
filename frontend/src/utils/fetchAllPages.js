// Reads every row of a list that PostgREST serves 1,000 rows at a time.
// The first page tells whether more exist; the rest are then fetched a few at
// a time instead of one after another. 6,600 tasks used to cost 7 round trips
// in a row (~4 s at home, much longer on mobile data), now about 3.
export async function fetchAllPages(fetchPage, { pageSize = 1000, concurrency = 3 } = {}) {
  const first = await fetchPage(0, pageSize - 1);
  const rows = [...(first || [])];
  if (rows.length < pageSize) return rows;

  for (let nextPage = 1; ; nextPage += concurrency) {
    const batch = await Promise.all(
      Array.from({ length: concurrency }, (_, i) => {
        const from = (nextPage + i) * pageSize;
        return fetchPage(from, from + pageSize - 1);
      }),
    );
    for (const page of batch) {
      const pageRows = page || [];
      rows.push(...pageRows);
      if (pageRows.length < pageSize) return rows;
    }
  }
}
