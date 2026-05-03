import { Show, For, createMemo, createSignal, onMount } from "solid-js";
import { createStore, produce } from "solid-js/store";
import {
	loadSettings,
	saveSettings,
	normalizeBaseUrl,
} from "./settings";
import {
	scan,
	isValidProject,
	slugifyProject,
	type PickedFile,
} from "./scanner";
import { readDataTransfer } from "./dragdrop";
import { uploadOne, UploadError } from "./api";
import { runWithConcurrency } from "./queue";
import {
	buildManifest,
	copyManifest,
	downloadManifest,
	manifestToJson,
} from "./manifest";
import type { ScannedFile, Settings, RowStatus } from "./types";

const CONCURRENCY = 4;

export default function App() {
	const [settings, setSettings] = createStore<Settings>(loadSettings());
	const [project, setProject] = createSignal("");
	const [rows, setRows] = createStore<ScannedFile[]>([]);
	const [warnings, setWarnings] = createSignal<string[]>([]);
	const [uploading, setUploading] = createSignal(false);
	const [dragging, setDragging] = createSignal(false);
	const [aborter, setAborter] = createSignal<AbortController | null>(null);
	const [copied, setCopied] = createSignal(false);
	let dirInput!: HTMLInputElement;

	onMount(() => persistSettings(settings));

	function persistSettings(next: Settings) {
		saveSettings(next);
	}

	function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
		setSettings(key, value);
		persistSettings({ ...settings, [key]: value });
	}

	function ingest(picked: PickedFile[]) {
		const result = scan(picked);
		setRows(result.rows);
		setProject(result.project);
		setWarnings(result.warnings);
	}

	function onPickFiles(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const picked: PickedFile[] = Array.from(input.files).map((f) => ({
			file: f,
			path: f.webkitRelativePath || f.name,
		}));
		ingest(picked);
	}

	async function onDrop(e: DragEvent) {
		e.preventDefault();
		setDragging(false);
		if (!e.dataTransfer) return;
		const picked = await readDataTransfer(e.dataTransfer.items);
		ingest(picked);
	}

	async function startUpload() {
		const baseUrl = normalizeBaseUrl(settings.apiBaseUrl);
		const apiKey = settings.apiKey.trim();
		const slug = project().trim();

		if (!isValidProject(slug)) {
			setWarnings((w) => [
				...w,
				`Project slug "${slug}" is invalid. Must match ^[a-z0-9][a-z0-9-]{0,63}$.`,
			]);
			return;
		}
		if (!apiKey) return;

		const pendingIndices: number[] = [];
		rows.forEach((row, i) => {
			if (row.status === "pending" || row.status === "error") {
				pendingIndices.push(i);
			}
		});
		if (pendingIndices.length === 0) return;

		const ctrl = new AbortController();
		setAborter(ctrl);
		setUploading(true);

		try {
			await runWithConcurrency(pendingIndices, CONCURRENCY, async (idx) => {
				const row = rows[idx];
				if (!row || !row.type) return;

				setRows(
					idx,
					produce((r) => {
						r.status = "uploading";
						r.error = undefined;
					}),
				);

				try {
					const result = await uploadOne({
						baseUrl,
						apiKey,
						file: row.file,
						project: slug,
						type: row.type,
						signal: ctrl.signal,
					});
					setRows(
						idx,
						produce((r) => {
							r.status = "done";
							r.result = result;
						}),
					);
				} catch (err) {
					const message = formatUploadError(err);
					setRows(
						idx,
						produce<ScannedFile>((r) => {
							r.status = "error";
							r.error = message;
						}),
					);
				}
			});
		} finally {
			setUploading(false);
			setAborter(null);
		}
	}

	function cancelUpload() {
		const ctrl = aborter();
		if (ctrl) ctrl.abort();
	}

	function reset() {
		setRows([]);
		setWarnings([]);
		setProject("");
		if (dirInput) dirInput.value = "";
	}

	const stats = createMemo(() => {
		let pending = 0;
		let uploadingN = 0;
		let done = 0;
		let error = 0;
		let skipped = 0;
		let bytesTotal = 0;
		let bytesDone = 0;
		for (const r of rows) {
			bytesTotal += r.file.size;
			if (r.status === "done") {
				done++;
				bytesDone += r.file.size;
			} else if (r.status === "uploading") uploadingN++;
			else if (r.status === "error") error++;
			else if (r.status === "skipped") skipped++;
			else pending++;
		}
		return { total: rows.length, pending, uploadingN, done, error, skipped, bytesTotal, bytesDone };
	});

	const allSettled = createMemo(
		() => rows.length > 0 && stats().pending === 0 && stats().uploadingN === 0,
	);

	const canUpload = createMemo(() => {
		if (uploading()) return false;
		if (!settings.apiKey.trim()) return false;
		if (!isValidProject(project().trim())) return false;
		return stats().pending > 0 || stats().error > 0;
	});

	const manifest = createMemo(() => {
		if (!allSettled() || stats().done === 0) return null;
		return buildManifest(project().trim(), rows);
	});

	async function handleCopyManifest() {
		const m = manifest();
		if (!m) return;
		try {
			await copyManifest(m);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Fallback to download if clipboard API is blocked.
			downloadManifest(m, `${m.project}-manifest.json`);
		}
	}

	function handleDownloadManifest() {
		const m = manifest();
		if (!m) return;
		downloadManifest(m, `${m.project}-manifest.json`);
	}

	return (
		<div class="mx-auto max-w-6xl px-6 py-10">
			<header class="mb-8">
				<h1 class="text-2xl font-semibold tracking-tight">
					zylem assets uploader
				</h1>
				<p class="mt-1 text-sm text-zinc-400">
					Drop a project directory, review the plan, and ship every asset to R2 in
					one click.
				</p>
			</header>

			<section class="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
				<h2 class="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-400">
					Connection
				</h2>
				<div class="grid gap-4 md:grid-cols-2">
					<label class="block">
						<span class="mb-1 block text-xs text-zinc-400">
							API base URL{" "}
							<span class="text-zinc-600">
								(empty = use Vite proxy on /assets)
							</span>
						</span>
						<input
							type="text"
							class="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono outline-none focus:border-zinc-600"
							placeholder="http://localhost:8080"
							value={settings.apiBaseUrl}
							onInput={(e) =>
								updateSetting("apiBaseUrl", e.currentTarget.value)
							}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-xs text-zinc-400">
							API key{" "}
							<span class="text-zinc-600">(stored in localStorage)</span>
						</span>
						<input
							type="password"
							class="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono outline-none focus:border-zinc-600"
							placeholder="paste server API_KEY"
							value={settings.apiKey}
							onInput={(e) => updateSetting("apiKey", e.currentTarget.value)}
						/>
					</label>
				</div>
			</section>

			<section class="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
				<h2 class="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-400">
					Source
				</h2>

				<div
					class={
						"flex flex-col items-center justify-center rounded-md border-2 border-dashed py-10 text-center transition-colors " +
						(dragging()
							? "border-emerald-500/70 bg-emerald-500/5"
							: "border-zinc-800 bg-zinc-950/40")
					}
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={onDrop}
				>
					<p class="text-sm text-zinc-400">
						Drag a folder here, or
					</p>
					<button
						type="button"
						class="mt-2 inline-flex items-center rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
						onClick={() => dirInput.click()}
					>
						Choose folder
					</button>
					<input
						ref={dirInput}
						type="file"
						class="hidden"
						multiple
						onChange={onPickFiles}
						{...({ webkitdirectory: "", directory: "" } as Record<
							string,
							string
						>)}
					/>
					<p class="mt-3 text-xs text-zinc-500">
						Convention: <code>project/{"{models|images|audio|data}"}/file.ext</code>
					</p>
				</div>

				<Show when={rows.length > 0}>
					<div class="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
						<label class="block">
							<span class="mb-1 block text-xs text-zinc-400">Project slug</span>
							<input
								type="text"
								class={
									"w-full rounded-md border bg-zinc-950 px-3 py-2 text-sm font-mono outline-none " +
									(isValidProject(project().trim())
										? "border-zinc-800 focus:border-zinc-600"
										: "border-rose-700 focus:border-rose-500")
								}
								value={project()}
								onInput={(e) =>
									setProject(slugifyProject(e.currentTarget.value))
								}
							/>
						</label>
						<button
							type="button"
							class="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
							onClick={reset}
						>
							Reset
						</button>
					</div>
				</Show>

				<Show when={warnings().length > 0}>
					<ul class="mt-4 space-y-1 text-xs text-amber-400">
						<For each={warnings()}>{(w) => <li>! {w}</li>}</For>
					</ul>
				</Show>
			</section>

			<Show when={rows.length > 0}>
				<section class="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
					<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
						<div class="text-sm text-zinc-400">
							<span class="text-zinc-200">{stats().total}</span> file{stats().total === 1 ? "" : "s"} ·{" "}
							<span class="text-emerald-400">{stats().done} done</span> ·{" "}
							<span class="text-sky-400">{stats().uploadingN} uploading</span> ·{" "}
							<span class="text-zinc-300">{stats().pending} pending</span> ·{" "}
							<span class="text-rose-400">{stats().error} error</span> ·{" "}
							<span class="text-zinc-500">{stats().skipped} skipped</span>
						</div>
						<div class="flex gap-2">
							<Show when={uploading()}>
								<button
									type="button"
									class="rounded-md border border-rose-800 bg-rose-950/40 px-4 py-2 text-sm text-rose-300 hover:bg-rose-950/70"
									onClick={cancelUpload}
								>
									Cancel
								</button>
							</Show>
							<button
								type="button"
								class="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
								disabled={!canUpload()}
								onClick={startUpload}
							>
								{uploading()
									? "Uploading..."
									: stats().error > 0 && stats().pending === 0
										? `Retry ${stats().error}`
										: `Upload ${stats().pending}`}
							</button>
						</div>
					</div>

					<div class="overflow-hidden rounded-md border border-zinc-800">
						<table class="w-full text-left text-sm">
							<thead class="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
								<tr>
									<th class="px-3 py-2">Path</th>
									<th class="px-3 py-2">Type</th>
									<th class="px-3 py-2 text-right">Size</th>
									<th class="px-3 py-2">Status</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-zinc-800">
								<For each={rows}>
									{(row) => (
										<tr class="hover:bg-zinc-900/50">
											<td class="px-3 py-2 font-mono text-xs">
												{row.relPath}
											</td>
											<td class="px-3 py-2 text-xs text-zinc-400">
												{row.type ?? "-"}
											</td>
											<td class="px-3 py-2 text-right font-mono text-xs text-zinc-400">
												{formatBytes(row.file.size)}
											</td>
											<td class="px-3 py-2 text-xs">
												<StatusCell row={row} />
											</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
					</div>
				</section>
			</Show>

			<Show when={manifest()}>
				{(m) => (
					<section class="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
						<div class="mb-3 flex items-center justify-between">
							<h2 class="text-sm font-medium uppercase tracking-wider text-zinc-400">
								Manifest
							</h2>
							<div class="flex gap-2">
								<button
									type="button"
									class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs hover:bg-zinc-800"
									onClick={handleCopyManifest}
								>
									{copied() ? "Copied!" : "Copy JSON"}
								</button>
								<button
									type="button"
									class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs hover:bg-zinc-800"
									onClick={handleDownloadManifest}
								>
									Download
								</button>
							</div>
						</div>
						<pre class="max-h-96 overflow-auto rounded-md bg-zinc-950 p-4 text-xs text-zinc-300">
							{manifestToJson(m())}
						</pre>
					</section>
				)}
			</Show>
		</div>
	);
}

function StatusCell(props: { row: ScannedFile }) {
	const cls = (s: RowStatus) => {
		switch (s) {
			case "done":
				return "text-emerald-400";
			case "uploading":
				return "text-sky-400";
			case "error":
				return "text-rose-400";
			case "skipped":
				return "text-zinc-500";
			default:
				return "text-zinc-300";
		}
	};
	return (
		<div class={cls(props.row.status)}>
			<span class="font-medium">{props.row.status}</span>
			<Show when={props.row.status === "done" && props.row.result}>
				{(r) => (
					<a
						href={r().url}
						target="_blank"
						rel="noreferrer"
						class="ml-2 break-all text-xs text-emerald-300 underline decoration-dotted hover:text-emerald-200"
					>
						{r().url}
					</a>
				)}
			</Show>
			<Show when={props.row.status === "skipped" && props.row.reason}>
				<span class="ml-2 text-xs text-zinc-600">— {props.row.reason}</span>
			</Show>
			<Show when={props.row.status === "error" && props.row.error}>
				<span class="ml-2 text-xs text-rose-300">— {props.row.error}</span>
			</Show>
		</div>
	);
}

function formatUploadError(err: unknown): string {
	if (err instanceof UploadError) return `[${err.status}] ${err.message}`;
	if (err instanceof DOMException && err.name === "AbortError") {
		return "cancelled";
	}
	if (err instanceof Error) return err.message;
	return String(err);
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
	return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
