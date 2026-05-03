import type { AssetType, UploadResult } from "./types";

export interface UploadInput {
	baseUrl: string;
	apiKey: string;
	file: File;
	project: string;
	type: AssetType;
	signal?: AbortSignal;
}

export class UploadError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "UploadError";
	}
}

export async function uploadOne(input: UploadInput): Promise<UploadResult> {
	const fd = new FormData();
	fd.append("file", input.file, input.file.name);
	fd.append("project", input.project);
	fd.append("type", input.type);

	const url = `${input.baseUrl}/assets`;
	const res = await fetch(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${input.apiKey}` },
		body: fd,
		signal: input.signal,
	});

	if (!res.ok) {
		const message = await readErrorMessage(res);
		throw new UploadError(res.status, message);
	}

	return (await res.json()) as UploadResult;
}

async function readErrorMessage(res: Response): Promise<string> {
	try {
		const ct = res.headers.get("content-type") ?? "";
		if (ct.includes("application/json")) {
			const body = (await res.json()) as { error?: string };
			if (body && typeof body.error === "string") return body.error;
		}
		const text = (await res.text()).trim();
		if (text) return text;
	} catch {
		// Body already consumed or invalid JSON; fall through.
	}
	return `HTTP ${res.status} ${res.statusText}`.trim();
}

export async function pingHealth(baseUrl: string): Promise<boolean> {
	try {
		const res = await fetch(`${baseUrl}/healthz`, { method: "GET" });
		return res.ok;
	} catch {
		return false;
	}
}
