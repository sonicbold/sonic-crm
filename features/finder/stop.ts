export class FinderStopped extends Error {
  constructor() {
    super("Finder stopped.");
    this.name = "FinderStopped";
  }
}

export function isFinderStopped(err: unknown): boolean {
  return err instanceof FinderStopped || (err instanceof Error && err.name === "FinderStopped");
}

export function throwIfStopped(signal?: AbortSignal) {
  if (signal?.aborted) throw new FinderStopped();
}
