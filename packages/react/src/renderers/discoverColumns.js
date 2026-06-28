/** Ordered column keys across all rows (first-seen order). Discovering over
 * every row, not a prefix, so a key first appearing in a later row still gets a
 * column (#112). */
export function discoverColumns(rows) {
  const cols = [];
  rows.forEach((row) =>
    Object.keys(row).forEach((k) => {
      if (!cols.includes(k)) cols.push(k);
    })
  );
  return cols;
}
