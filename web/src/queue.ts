/**
 * Run `worker(item)` over `items` with at most `limit` in flight at once.
 * Each call resolves with the worker's return value (or rejects with its error).
 * Results are delivered out-of-order via `onResult`; the returned promise
 * resolves once every item has settled.
 */
export async function runWithConcurrency<T>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<void>,
): Promise<void> {
	const effectiveLimit = Math.max(1, Math.min(limit, items.length));
	let cursor = 0;

	async function pump(): Promise<void> {
		while (true) {
			const idx = cursor++;
			if (idx >= items.length) return;
			const item = items[idx]!;
			try {
				await worker(item);
			} catch {
				// Worker is responsible for surfacing its own errors (e.g. via
				// row state updates). Swallow here so one failure doesn't abort
				// the whole batch.
			}
		}
	}

	const workers: Promise<void>[] = [];
	for (let i = 0; i < effectiveLimit; i++) {
		workers.push(pump());
	}
	await Promise.all(workers);
}
