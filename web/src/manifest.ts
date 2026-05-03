import type { AssetType, ScannedFile, UploadResult } from "./types";

export interface ManifestEntry extends UploadResult {
	type: AssetType;
}

export interface Manifest {
	project: string;
	uploadedAt: string;
	assets: Record<string, ManifestEntry>;
}

/** Build a manifest from the rows that successfully uploaded. */
export function buildManifest(project: string, rows: ScannedFile[]): Manifest {
	const assets: Record<string, ManifestEntry> = {};
	for (const row of rows) {
		if (row.status !== "done" || !row.result || !row.type) continue;
		assets[row.relPath] = { type: row.type, ...row.result };
	}
	return {
		project,
		uploadedAt: new Date().toISOString(),
		assets,
	};
}

export function manifestToJson(m: Manifest): string {
	return JSON.stringify(m, null, 2) + "\n";
}

export async function copyManifest(m: Manifest): Promise<void> {
	const text = manifestToJson(m);
	await navigator.clipboard.writeText(text);
}

export function downloadManifest(m: Manifest, filename = "manifest.json"): void {
	const blob = new Blob([manifestToJson(m)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	try {
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
	} finally {
		// Free the blob; revoke after a tick so the browser has time to fetch it.
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
}
