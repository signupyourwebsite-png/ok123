
export interface ExtensionFile {
  path: string;
  content: string;
  language: string;
}

export interface ExtensionProject {
  id: string;
  name: string;
  description: string;
  files: ExtensionFile[];
  createdAt: number;
}
