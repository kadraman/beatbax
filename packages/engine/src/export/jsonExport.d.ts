/**
 * Export a resolved song model to JSON. Backward-compatible overload: if
 * called with a single string, write a small metadata JSON file.
 */
export declare function exportJSON(songOrPath: any, maybePath?: string, opts?: {
    debug?: boolean;
    verbose?: boolean;
}): Promise<void>;
//# sourceMappingURL=jsonExport.d.ts.map