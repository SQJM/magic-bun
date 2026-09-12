import { afterAll, describe, expect, it } from 'bun:test';
import { generateModuleJS } from '../../script/compiler/step/6_generate.ts';
import type { MDataOutput } from '../../script/types.ts';

// ---------------------------------------------------------------------------
// Helpers - inline template-var shape (avoid importing MDataTemplate directly)
// ---------------------------------------------------------------------------

interface BenchTemplateVar {
    type: string;
    tagName?: string;
    attribs?: Record<string, string>;
    event?: Record<string, [string, unknown]>;
    keyword?: Record<string, string>;
    import?: string;
    args?: Record<string, unknown>;
    content?: string;
    slotName?: string;
}

function createScaledTemplate(varCount: number): {
    vars: Record<string, BenchTemplateVar>;
    sh: string[];
} {
    const vars: Record<string, BenchTemplateVar> = {};
    const sh: string[] = [];
    for (let i = 0; i < varCount; i++) {
        const name = `el${i}`;
        vars[name] = {
            type: 'element',
            tagName: 'div',
            attribs: { class: `cls-${i}`, 'data-id': String(i) },
        };
        sh.push(`append(this.__magic_element_root, ${name});`);
    }
    return { vars, sh };
}

function createBenchData(
    name: string,
    varCount: number,
    extra?: Partial<MDataOutput> & Record<string, unknown>,
): MDataOutput {
    const { vars, sh } = createScaledTemplate(varCount);
    const base: MDataOutput = {
        name,
        cssScope: {},
        once_interface_args: {},
        originalFile: `${name}.m`,
        contentHash: 'bench-hash',
        keyframesCss: '',
        keyframesNames: [],
        template: { var: vars as Record<string, unknown> as MDataOutput['template']['var'], sh, fragment: false },
        templateArgs: {},
        before: 'const benchInit = "start";',
        global: 'const globalConfig = { env: "bench" };',
        event: { code: 'onClick = () => {}; onChange = () => {}', list: ['onClick', 'onChange'] },
        component_event: { code: 'created = () => {}', list: ['created'] },
        component_interface: '',
        interface: { code: 'getData = () => ({})', list: ['getData'] },
        listen: { code: '', list: [] },
        script: '// bench script body',
        css: '',
        slots: {},
        'expose-event': '{}',
        'use-element-id-list': Object.keys(vars),
        once_interface: [],
        ...(extra as MDataOutput),
    };
    return Object.assign(base, { import: { '~global': {} }, extend: { '~global': {} } }) as unknown as MDataOutput;
}

// ---------------------------------------------------------------------------
// Realistic script payload (≈100 lines) for Babel parser benchmark
// ---------------------------------------------------------------------------

function createBabelPayload(): string {
    const lines: string[] = [];
    lines.push('import { ref, computed, onMounted } from "./runtime";');
    lines.push('');
    lines.push('const state = ref({ count: 0, items: [], loading: false });');
    lines.push('');
    for (let i = 0; i < 20; i++) {
        lines.push(`function handleItem${i}(item) {`);
        lines.push(`  state.value.items.push({ ...item, idx: ${i} });`);
        lines.push('}');
    }
    lines.push('');
    lines.push('onMounted(() => {');
    lines.push('  state.value.loading = true;');
    lines.push('  fetch("/api/data").then(r => r.json()).then(d => {');
    lines.push('    state.value.count = d.total;');
    lines.push('    state.value.items = d.rows.map((r, i) => ({ ...r, idx: i }));');
    lines.push('    state.value.loading = false;');
    lines.push('  });');
    lines.push('});');
    lines.push('');
    lines.push('const total = computed(() => state.value.items.reduce((s, i) => s + i.price, 0));');
    lines.push('');
    lines.push('export default { state, handleItem0, total };');
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Realistic CSS payload (≈200 lines) for PostCSS benchmark
// ---------------------------------------------------------------------------

function createCssPayload(): string {
    const rules: string[] = [];
    rules.push(':root { --primary: #3b82f6; --bg: #ffffff; --text: #111827; }');
    rules.push('');
    rules.push('* { box-sizing: border-box; margin: 0; padding: 0; }');
    rules.push('');
    rules.push('html { font-family: system-ui, sans-serif; color: var(--text); background: var(--bg); }');
    rules.push('');
    rules.push('.container {');
    rules.push('  display: flex;');
    rules.push('  flex-direction: column;');
    rules.push('  align-items: center;');
    rules.push('  justify-content: center;');
    rules.push('  min-height: 100vh;');
    rules.push('  padding: 2rem;');
    rules.push('}');
    rules.push('');
    for (let i = 0; i < 40; i++) {
        rules.push(`.card-${i} {`);
        rules.push('  display: grid;');
        rules.push('  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));');
        rules.push('  gap: 1rem;');
        rules.push('  padding: 1.5rem;');
        rules.push('  border-radius: 0.5rem;');
        rules.push(`  background: linear-gradient(135deg, hsl(${(i * 9) % 360}, 70%, 95%), hsl(${(i * 9 + 60) % 360}, 60%, 90%));`);
        rules.push('  box-shadow: 0 4px 6px rgba(0,0,0,0.1);');
        rules.push('  transition: transform 0.2s ease, box-shadow 0.2s ease;');
        rules.push('}');
        rules.push('');
    }
    return rules.join('\n');
}

// ===========================================================================
// Benchmark Suite
// ===========================================================================

describe('Performance Benchmarks', () => {
    const SEP = '─'.repeat(64);

    // ---- 1. generateModuleJS throughput (100 iterations × 10 vars) ----

    it('generateModuleJS throughput (100 iterations)', () => {
        const data = createBenchData('throughput', 10);
        const iterations = 100;

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            const r = generateModuleJS(data);
            // Touch length to prevent dead-code elimination
            void r.length;
        }
        const elapsed = performance.now() - start;
        const opsPerSec = (iterations / elapsed * 1000).toFixed(0);
        const avgMs = (elapsed / iterations).toFixed(2);

        console.log(SEP);
        console.log(`  generateModuleJS ×${iterations}: ${elapsed.toFixed(0)}ms total`);
        console.log(`  Avg per call:  ${avgMs}ms`);
        console.log(`  Ops/sec:       ${opsPerSec}`);
        console.log(SEP);

        expect(elapsed).toBeLessThan(2000);
    });

    // ---- 2. Babel parser speed ----

    it('Babel parser speed', () => {
        const babelParser = require('@babel/parser');
        const payload = createBabelPayload();
        const iterations = 500;

        // Warm-up
        babelParser.parse(payload, { sourceType: 'module' });

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            babelParser.parse(payload, { sourceType: 'module' });
        }
        const elapsed = performance.now() - start;
        const opsPerSec = (iterations / elapsed * 1000).toFixed(0);
        const avgMs = (elapsed / iterations).toFixed(2);

        console.log(SEP);
        console.log(`  Babel parse ×${iterations} (≈${payload.split('\n').length} lines): ${elapsed.toFixed(0)}ms total`);
        console.log(`  Avg per parse: ${avgMs}ms`);
        console.log(`  Ops/sec:       ${opsPerSec}`);
        console.log(SEP);

        // 500 parses of a 100-line file should be well under 5s in Bun
        expect(elapsed).toBeLessThan(5000);
    });

    // ---- 3. generateModuleJS scaling (1 → 10 → 50 → 100 vars) ----

    it('generateModuleJS scaling: 1 vs 10 vs 50 vs 100 vars', () => {
        console.log(SEP);
        for (const size of [1, 10, 50, 100]) {
            const data = createBenchData(`scale-${size}`, size);
            const start = performance.now();
            const result = generateModuleJS(data);
            const elapsed = performance.now() - start;
            console.log(`  ${String(size).padStart(3)} vars → ${elapsed.toFixed(2)}ms  (${result.length} chars output)`);
        }
        console.log(SEP);
        expect(true).toBe(true); // informational only
    });

    // ---- 4. generateModuleJS with 100 vars under 50ms (regression gate) ----

    it('generateModuleJS with 100 template vars under 50ms', () => {
        const data = createBenchData('perf-100', 100);
        const start = performance.now();
        const result = generateModuleJS(data);
        const elapsed = performance.now() - start;

        console.log(SEP);
        console.log(`  generateModuleJS(100 vars): ${elapsed.toFixed(2)}ms, ${result.length} chars`);
        console.log(SEP);

        expect(elapsed).toBeLessThan(50);
        expect(result.length).toBeGreaterThan(1000);
    });

    // ---- 5. Output size grows roughly linearly ----

    it('generateModuleJS output is not growing unreasonably', () => {
        const sizes = [1, 10, 50];
        const outputs: number[] = [];
        console.log(SEP);
        for (const size of sizes) {
            const data = createBenchData(`out-${size}`, size);
            const result = generateModuleJS(data);
            outputs.push(result.length);
            console.log(`  ${size} vars → ${result.length} chars output`);
        }
        const ratio50to1 = outputs[2] / outputs[0];
        console.log(`  ratio 50/1: ${ratio50to1.toFixed(1)}x`);
        console.log(SEP);
        expect(ratio50to1).toBeLessThan(100);
    });

    // ---- 6. CSS processing (lightningcss) ----

    it('CSS processing with lightningcss', () => {
        const { transform } = require('lightningcss');
        const css = createCssPayload();

        const start = performance.now();
        const result = transform({
            filename: 'bench.css',
            code: Buffer.from(css, 'utf-8'),
            minify: true,
            targets: { chrome: 140 << 16, firefox: 140 << 16, safari: 15 << 16 }
        });
        const elapsed = performance.now() - start;

        console.log(SEP);
        console.log(`  CSS input:  ${css.split('\n').length} lines, ${css.length} chars`);
        console.log(`  CSS output: ${result.code.toString('utf-8').length} chars`);
        console.log(`  Time:       ${elapsed.toFixed(2)}ms`);
        console.log(SEP);

        expect(elapsed).toBeLessThan(2000);
        expect(result.code.length).toBeGreaterThan(100);
    });

    afterAll(() => {
        console.log('\n  ✓ All benchmarks completed.');
    });
});
