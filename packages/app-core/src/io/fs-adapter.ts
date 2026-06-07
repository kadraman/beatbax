export interface OpenFileResult {
  name: string;
  content: string;
}

export interface FileIOAdapter {
  openFile(): Promise<OpenFileResult | null>;
  saveFile(name: string, data: Uint8Array): Promise<string | null>;
}
