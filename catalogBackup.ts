import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Read-only recovery seed; never writes this snapshot into the database. */
export function loadCatalogBackup(root = process.cwd()): any[] {
  try {
    const data = JSON.parse(readFileSync(path.join(root, 'public/catalog-fallback.json'), 'utf8'));
    return (Array.isArray(data.results) ? data.results : []).filter((m: any) => m?.id && m.id !== 'hero-promo');
  } catch {
    return [];
  }
}
