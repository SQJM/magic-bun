/**
 * Unified error class for the Magic compiler and CLI.
 * Replaces bare throw "string" with proper stack traces and structured metadata.
 */
export class MagicError extends Error {
	/** Machine-readable context key, e.g. "CONFIG_MISSING_KEY", "COMPONENT_MISSING_TEMPLATE" */
	code: string;

	/** Optional file path related to the error */
	file?: string;

	/** Optional extra detail (will be appended to message) */
	detail?: string;

	constructor(code: string, message: string, options?: { file?: string; detail?: string }) {
		super(message);
		this.name = 'MagicError';
		this.code = code;
		if (options?.file) this.file = options.file;
		if (options?.detail) this.detail = options.detail;

		// Append detail to message if provided
		if (this.detail) this.message = `${message} ${this.detail}`;

		// Capture proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, MagicError);
		}
	}

	override toString(): string {
		let s = `MagicError [${this.code}]: ${this.message}`;
		if (this.file) s += ` (file: ${this.file})`;
		return s;
	}
}
