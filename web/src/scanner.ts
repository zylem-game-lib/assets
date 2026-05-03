import type { AssetType, ScannedFile } from "./types";

// Mirrors server/internal/keygen/keygen.go (extToCategory + blockedExt).
// Keep these tables in sync with the Go side.
const EXT_TO_CATEGORY: Record<string, AssetType> = {
	// images
	png: "image",
	jpg: "image",
	jpeg: "image",
	webp: "image",
	gif: "image",
	svg: "image",
	bmp: "image",
	tiff: "image",
	tif: "image",
	ico: "image",
	avif: "image",

	// models
	glb: "model",
	gltf: "model",
	fbx: "model",
	obj: "model",
	stl: "model",
	dae: "model",
	"3ds": "model",
	blend: "model",
	usdz: "model",

	// audio
	mp3: "audio",
	wav: "audio",
	ogg: "audio",
	flac: "audio",
	aac: "audio",
	m4a: "audio",
	opus: "audio",
	mid: "audio",
	midi: "audio",

	// video
	mp4: "video",
	webm: "video",
	mov: "video",
	m4v: "video",
	mkv: "video",
	avi: "video",
	ogv: "video",

	// fonts
	ttf: "font",
	otf: "font",
	woff: "font",
	woff2: "font",
	eot: "font",

	// documents
	pdf: "document",
	txt: "document",
	md: "document",
	rtf: "document",
	csv: "document",
	tsv: "document",

	// code / data
	json: "code",
	yaml: "code",
	yml: "code",
	xml: "code",
	html: "code",
	css: "code",
	js: "code",
	mjs: "code",
	ts: "code",
	jsx: "code",
	tsx: "code",
	toml: "code",
	ini: "code",
	sql: "code",

	// archives
	zip: "archive",
	tar: "archive",
	gz: "archive",
	tgz: "archive",
	"7z": "archive",
	rar: "archive",
	bz2: "archive",
	xz: "archive",
};

const BLOCKED_EXT: ReadonlySet<string> = new Set([
	"exe",
	"bat",
	"sh",
	"ps1",
	"dll",
	"dmg",
	"app",
	"msi",
	"com",
	"cmd",
	"scr",
	"vbs",
	"jar",
]);

const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface PickedFile {
	file: File;
	/** POSIX-style path including the project root segment, e.g. `arena/weapons/tank.glb`. */
	path: string;
}

export interface ScanResult {
	project: string;
	rows: ScannedFile[];
	warnings: string[];
}

export function slugifyProject(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-]+|[-]+$/g, "")
		.slice(0, 64);
}

export function isValidProject(p: string): boolean {
	return PROJECT_RE.test(p);
}

export function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	if (dot < 0 || dot === name.length - 1) return "";
	return name.slice(dot + 1).toLowerCase();
}

export function categoryFromExt(ext: string): AssetType | null {
	return EXT_TO_CATEGORY[ext.toLowerCase()] ?? null;
}

export function isBlockedExt(ext: string): boolean {
	return BLOCKED_EXT.has(ext.toLowerCase());
}

/**
 * Pick the most common top-level folder across the picked files. Most directory
 * pickers emit a single root, but defensive coding here lets us tolerate users
 * who somehow select multiple roots (e.g. via drag-drop).
 */
function inferProjectRoot(files: PickedFile[]): {
	root: string;
	multipleRoots: boolean;
} {
	const counts = new Map<string, number>();
	for (const f of files) {
		const root = f.path.split("/")[0] ?? "";
		counts.set(root, (counts.get(root) ?? 0) + 1);
	}
	let best = "";
	let bestCount = -1;
	for (const [root, count] of counts) {
		if (count > bestCount) {
			best = root;
			bestCount = count;
		}
	}
	return { root: best, multipleRoots: counts.size > 1 };
}

export function scan(files: PickedFile[]): ScanResult {
	const warnings: string[] = [];

	if (files.length === 0) {
		return { project: "", rows: [], warnings };
	}

	const { root, multipleRoots } = inferProjectRoot(files);
	if (multipleRoots) {
		warnings.push(
			`Multiple top-level folders detected; using "${root}". Files outside it will be skipped.`,
		);
	}

	const projectSlug = slugifyProject(root);
	if (!projectSlug || !isValidProject(projectSlug)) {
		warnings.push(
			`Could not derive a valid project slug from folder "${root}". Edit it in the settings bar before uploading.`,
		);
	}

	const rows: ScannedFile[] = files.map((picked, idx) => {
		const segments = picked.path.split("/");
		const id = `${idx}-${picked.path}`;
		const relPath =
			segments[0] === root ? segments.slice(1).join("/") : picked.path;

		if (segments[0] !== root) {
			return {
				id,
				file: picked.file,
				relPath: picked.path,
				project: projectSlug,
				type: null,
				status: "skipped",
				reason: `outside project root "${root}"`,
			};
		}

		const ext = extensionOf(picked.file.name);
		if (!ext) {
			return {
				id,
				file: picked.file,
				relPath,
				project: projectSlug,
				type: null,
				status: "skipped",
				reason: "filename has no extension",
			};
		}
		if (isBlockedExt(ext)) {
			return {
				id,
				file: picked.file,
				relPath,
				project: projectSlug,
				type: null,
				status: "skipped",
				reason: `extension .${ext} is blocked`,
			};
		}
		const category = categoryFromExt(ext);
		if (!category) {
			return {
				id,
				file: picked.file,
				relPath,
				project: projectSlug,
				type: null,
				status: "skipped",
				reason: `extension .${ext} is not in the allowlist`,
			};
		}

		return {
			id,
			file: picked.file,
			relPath,
			project: projectSlug,
			type: category,
			status: "pending",
		};
	});

	return { project: projectSlug, rows, warnings };
}
