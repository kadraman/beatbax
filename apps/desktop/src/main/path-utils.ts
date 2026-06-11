/** Basename that handles both POSIX and Windows separators (recent files may come from any OS). */
export function basenameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}
