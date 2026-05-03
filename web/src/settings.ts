import type { Settings } from "./types";

const STORAGE_KEY = "zylem-uploader-settings/v1";

export const defaultSettings: Settings = {
	apiBaseUrl: "",
	apiKey: "",
};

export function loadSettings(): Settings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...defaultSettings };
		const parsed = JSON.parse(raw) as Partial<Settings>;
		return {
			apiBaseUrl:
				typeof parsed.apiBaseUrl === "string"
					? parsed.apiBaseUrl
					: defaultSettings.apiBaseUrl,
			apiKey:
				typeof parsed.apiKey === "string"
					? parsed.apiKey
					: defaultSettings.apiKey,
		};
	} catch {
		return { ...defaultSettings };
	}
}

export function saveSettings(s: Settings): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
	} catch {
		// localStorage can throw under quota/private mode; fail silent.
	}
}

// Strip a trailing slash so callers can always do `${baseUrl}/assets`.
export function normalizeBaseUrl(raw: string): string {
	return raw.trim().replace(/\/+$/, "");
}
