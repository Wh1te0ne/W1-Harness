/** W1 release discovery for source checkouts; installed builds use electron-updater. */
import { gt, prerelease, valid } from 'semver'
import type { DesktopUpdateState } from './ipc.ts'
import type { W1Product } from './w1-upstream.ts'

/** Public repository owned by the W1 product, independent of DSH's source repository. */
export const W1_REPOSITORY = 'Wh1te0ne/W1-Harness'
export const W1_RELEASES = `https://github.com/${W1_REPOSITORY}/releases`

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Update channels are selected from the W1 product version. */
export function w1UpdateChannel(version: string): 'alpha' | 'beta' | 'latest' {
  if (valid(version) === null) throw new Error('Invalid W1 version')
  const channel = prerelease(version)?.[0]
  if (channel === undefined) return 'latest'
  if (channel !== 'alpha' && channel !== 'beta') throw new Error('W1 prereleases must use alpha or beta')
  return channel
}

/** Validated desktop release; server-only and source-only releases cannot become updates. */
export interface W1ProductRelease {
  readonly version: string
  readonly url: string
  readonly notes: string
}

/** Select a newer W1 Windows release from its own repository and channel. */
export function selectW1ProductRelease(input: unknown, current: string): W1ProductRelease | undefined {
  if (!Array.isArray(input)) throw new Error('Invalid W1 release list')
  const rows: readonly unknown[] = input
  const channel = w1UpdateChannel(current)
  const candidates: W1ProductRelease[] = []
  for (const row of rows) {
    if (!object(row) || row.draft === true || typeof row.tag_name !== 'string') continue
    const version = row.tag_name.startsWith('v') ? row.tag_name.slice(1) : ''
    if (valid(version) === null || !gt(version, current)) continue
    const identifier = prerelease(version)?.[0]
    if (identifier !== undefined && identifier !== 'alpha' && identifier !== 'beta') continue
    const target = w1UpdateChannel(version)
    if (channel === 'latest' && target !== 'latest' || channel === 'beta' && target === 'alpha') continue
    if (row.html_url !== `${W1_RELEASES}/tag/v${version}` || !Array.isArray(row.assets)) continue
    if (!row.assets.some((asset: unknown) => typeof asset === 'object' && asset !== null
      && 'name' in asset && asset.name === `${target}.yml`)) continue
    candidates.push({ version, url: row.html_url, notes: typeof row.body === 'string' ? row.body.slice(0, 12000) : '' })
  }
  return candidates.sort((a, b) => gt(a.version, b.version) ? -1 : 1)[0]
}

/** Source mode checks releases without modifying a checkout or installing over it. */
export class W1SourceUpdates {
  private current: DesktopUpdateState = { phase: 'idle' }
  private operation: Promise<DesktopUpdateState> | undefined
  private readonly lifetime = new AbortController()
  release: W1ProductRelease | undefined

  constructor(private readonly product: W1Product, private readonly request: typeof fetch,
    private readonly publish: (state: DesktopUpdateState) => DesktopUpdateState) {}

  get state(): DesktopUpdateState { return this.current }

  /** Join bounded metadata requests; automatic failures remain available to a manual check. */
  check(): Promise<DesktopUpdateState> {
    this.operation ??= this.run().finally(() => { this.operation = undefined })
    return this.operation
  }

  dispose(): void { this.lifetime.abort() }

  private async run(): Promise<DesktopUpdateState> {
    if (this.isStopped()) throw new Error('W1 release checks are disposed')
    this.current = this.publish({ phase: 'checking' })
    try {
      const response = await this.request(`https://api.github.com/repos/${W1_REPOSITORY}/releases?per_page=30`, {
        headers: { Accept: 'application/vnd.github+json' }, redirect: 'error',
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15000)]),
      })
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
      const data: unknown = await response.json()
      if (this.isStopped()) return this.current
      this.release = selectW1ProductRelease(data, this.product.version)
      this.current = this.publish(this.release === undefined ? { phase: 'idle' }
        : { phase: 'available', version: this.release.version })
    } catch (error) {
      if (this.isStopped()) return this.current
      this.current = this.publish({ phase: 'error', failedOperation: 'check', message: String(error) })
    }
    return this.current
  }

  private isStopped(): boolean { return this.lifetime.signal.aborted }
}
