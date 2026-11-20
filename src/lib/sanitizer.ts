/**
 * Sanitasi string pencarian agar aman dari injeksi logika PostgREST (, () : " ' \ dll)
 * dan SQL wildcards (% _), serta membatasi panjang input.
 */
export function sanitizeSearchTerm(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/[,()"'\\:;{}[\]]/g, ' ')
    .replace(/[%_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}
