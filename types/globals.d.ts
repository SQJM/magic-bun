declare module '@babel/types' {
    const t: Record<string, (...args: unknown[]) => unknown>;
    export = t;
}

declare module '@babel/generator' {
    function generate(ast: unknown, opts?: Record<string, unknown>, code?: string): { code: string };
    export default generate;
}

declare module '@babel/parser' {
    interface Parser {
        parse(code: string, options?: Record<string, unknown>): unknown;
        parseExpression(code: string, options?: Record<string, unknown>): unknown;
    }
    const parser: Parser;
    export = parser;
}

declare module '@babel/traverse' {
    function traverse(ast: unknown, visitor: Record<string, unknown>): void;
    export default traverse;
}

declare module 'node-html-parser' {
    interface HTMLElement {
        [key: string]: unknown;
        childNodes: HTMLElement[];
        attrs: Record<string, string>;
        attributes: Record<string, string>;
        rawTagName: string;
        text: string;
        outerHTML: string;
        innerHTML: string;
        rawAttrs: string;
        nodeType: number;
        querySelectorAll: (selector: string) => HTMLElement[];
        querySelector: (selector: string) => HTMLElement | null;
        hasAttribute: (name: string) => boolean;
        getAttribute: (name: string) => string;
        setAttribute: (name: string, value: string) => void;
        removeAttribute: (name: string) => void;
        appendChild: (child: HTMLElement) => void;
    }
    export function parse(html: string): HTMLElement;
}

declare module 'html-minifier-terser' {
    interface Minifier {
        minify(html: string, options: Record<string, unknown>): string | Promise<string>;
    }
    const htmlMinifier: Minifier;
    export default htmlMinifier;
}

declare module 'autoprefixer' {
    function autoprefixer(options: Record<string, unknown>): unknown;
    export = autoprefixer;
}

declare module 'terser' {
    export function minify_sync(code: string, options: Record<string, unknown>): { code: string };
}

declare module 'postcss' {
    interface Postcss {
        process(css: string, options: Record<string, unknown>): { css: string } | Promise<{ css: string }>;
    }
    function postcss(plugins: unknown[]): Postcss;
    export = postcss;
}

declare module 'fast-glob' {
    interface FastGlob {
        sync(patterns: string[], options: Record<string, unknown>): string[];
    }
    const FastGlob: FastGlob;
    export = FastGlob;
}

declare module 'commander' {
    export class Command {
        version(version: string): this;
        name(name: string): this;
        usage(usage: string): this;
        description(description: string): this;
        command(name: string): this;
        option(flags: string, description?: string, defaultValue?: string | boolean): this;
        action(fn: (...args: unknown[]) => void): this;
        on(event: string, listener: (...args: unknown[]) => void): this;
        parse(argv: string[]): this;
    }
}
