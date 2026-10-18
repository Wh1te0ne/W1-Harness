export interface RemoteAdapter {
  invoke(action: string, args: Record<string, unknown>): Promise<unknown>;
  follow(args: Record<string, unknown>, signal: AbortSignal): AsyncIterable<unknown>;
}
export class RemoteHost {
  constructor(options: { path: string; adapter: RemoteAdapter; development?: boolean });
  start(): Promise<void>;
  stop(): void;
  manage(action: string, value?: unknown): Promise<unknown>;
}
