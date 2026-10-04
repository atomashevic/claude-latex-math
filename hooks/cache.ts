import type { FsEntry } from 'claude-code'

/**
 * The files to delete so the picture cache fits in `maxBytes`: whole pictures, a `.png` and its `.cells`,
 * least recently used first. The renderer touches both files on every use. Other files are left alone.
 */
export function overflow(entries: readonly FsEntry[], maxBytes: number): string[] {
  const pictures = new Map<string, { bytes: number; usedAt: number; names: string[] }>()
  for (const entry of entries) {
    const stem = entry.kind === 'file' ? entry.name.match(/^([0-9a-f]+)\.(?:png|cells)$/)?.[1] : undefined
    if (stem === undefined) continue
    const picture = pictures.get(stem) ?? { bytes: 0, usedAt: 0, names: [] }
    picture.bytes += entry.size
    picture.usedAt = Math.max(picture.usedAt, entry.mtimeMs)
    picture.names.push(entry.name)
    pictures.set(stem, picture)
  }
  let kept = 0
  const doomed: string[] = []
  for (const picture of [...pictures.values()].sort((a, b) => b.usedAt - a.usedAt)) {
    kept += picture.bytes
    if (kept > maxBytes) doomed.push(...picture.names)
  }
  return doomed
}
