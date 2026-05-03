export type AssetType =
	| "image"
	| "model"
	| "audio"
	| "video"
	| "font"
	| "document"
	| "code"
	| "archive"
	| "other";

export type RowStatus =
	| "pending"
	| "uploading"
	| "done"
	| "error"
	| "skipped";

export interface UploadResult {
	url: string;
	key: string;
	contentType: string;
	size: number;
	hash: string;
}

export interface ScannedFile {
	id: string;
	file: File;
	relPath: string;
	project: string;
	type: AssetType | null;
	status: RowStatus;
	reason?: string;
	result?: UploadResult;
	error?: string;
}

export interface Settings {
	apiBaseUrl: string;
	apiKey: string;
}
