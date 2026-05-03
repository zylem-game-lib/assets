import type { PickedFile } from "./scanner";

// The DOM lib has FileSystemEntry / FileSystemDirectoryEntry / FileSystemFileEntry
// types but they don't expose all the methods we need; declare what we use.
interface DirectoryEntry extends FileSystemEntry {
	createReader(): DirectoryReader;
}

interface FileEntry extends FileSystemEntry {
	file(success: (f: File) => void, error?: (e: unknown) => void): void;
}

interface DirectoryReader {
	readEntries(
		success: (entries: FileSystemEntry[]) => void,
		error?: (e: unknown) => void,
	): void;
}

function entryToFile(entry: FileEntry): Promise<File> {
	return new Promise((resolve, reject) => {
		entry.file(resolve, reject);
	});
}

function readAllEntries(reader: DirectoryReader): Promise<FileSystemEntry[]> {
	// readEntries only returns a batch at a time; repeat until the result is empty.
	return new Promise((resolve, reject) => {
		const all: FileSystemEntry[] = [];
		const pull = () => {
			reader.readEntries((batch) => {
				if (batch.length === 0) {
					resolve(all);
					return;
				}
				all.push(...batch);
				pull();
			}, reject);
		};
		pull();
	});
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
	if (entry.isFile) {
		const file = await entryToFile(entry as FileEntry);
		// FileSystemEntry.fullPath always starts with "/"; strip it to match
		// the relative path shape the picker produces via webkitRelativePath.
		const path = entry.fullPath.replace(/^\/+/, "");
		out.push({ file, path });
		return;
	}
	if (entry.isDirectory) {
		const reader = (entry as DirectoryEntry).createReader();
		const children = await readAllEntries(reader);
		for (const child of children) {
			await walk(child, out);
		}
	}
}

/**
 * Resolve every file inside a drop's DataTransferItemList, recursing into
 * directories. Drops that include only files (not folders) still work and are
 * reported with their bare filename as the path.
 */
export async function readDataTransfer(
	items: DataTransferItemList,
): Promise<PickedFile[]> {
	const out: PickedFile[] = [];
	const entries: FileSystemEntry[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!item || item.kind !== "file") continue;
		const entry = (item as DataTransferItem & {
			webkitGetAsEntry?: () => FileSystemEntry | null;
		}).webkitGetAsEntry?.();
		if (entry) entries.push(entry);
	}
	for (const entry of entries) {
		await walk(entry, out);
	}
	return out;
}
