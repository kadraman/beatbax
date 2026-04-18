import { SourceLocation } from '../parser/ast.js';
export type DiagLevel = 'WARN' | 'ERROR' | 'INFO';
export interface DiagMeta {
    file?: string;
    loc?: SourceLocation | null;
}
export declare function formatDiagnostic(level: DiagLevel, component: string, message: string, meta?: DiagMeta): string;
export declare function warn(component: string, message: string, meta?: DiagMeta): void;
export declare function error(component: string, message: string, meta?: DiagMeta): void;
declare const _default: {
    formatDiagnostic: typeof formatDiagnostic;
    warn: typeof warn;
    error: typeof error;
};
export default _default;
//# sourceMappingURL=diag.d.ts.map