import { promises as fs } from "node:fs";
import path from "node:path";

// artifacts/api-server is one level below the monorepo root, and pnpm runs
// this package's scripts with cwd set to the package directory — so the repo
// root is always two levels up from process.cwd() at runtime (both in dev,
// where tsx/esbuild run from src/, and in the built dist/index.mjs).
export const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

// Directories the Code Editor should never list, read, write, or delete into
// — build output, dependency trees, and VCS internals are noisy, huge, and
// never something you want to hand-edit through this UI.
const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".cache", ".pnpm-store",
  ".upm", ".config", ".local", ".breakpoints", "coverage", ".next", ".turbo",
]);

export class WorkspacePathError extends Error {}

/**
 * Resolves a repo-relative path from the client and guarantees it stays
 * inside REPO_ROOT — rejects absolute paths and `..` traversal so the Code
 * Editor can never read or write outside the project.
 */
export function resolveWorkspacePath(relativePath: string): string {
  const clean = (relativePath ?? "").replace(/^\/+/, "");
  const resolved = path.resolve(REPO_ROOT, clean);
  if (resolved !== REPO_ROOT && !resolved.startsWith(REPO_ROOT + path.sep)) {
    throw new WorkspacePathError(`Path escapes workspace root: ${relativePath}`);
  }
  return resolved;
}

export interface FileTreeNode {
  path: string; // repo-relative, posix-style
  name: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
}

/**
 * Lists one directory level (non-recursive) — the frontend lazily fetches
 * children as folders are expanded, so a huge monorepo never has to be
 * walked in a single request.
 */
export async function listDirectory(relativePath: string): Promise<FileTreeNode[]> {
  const abs = resolveWorkspacePath(relativePath);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const nodes = entries
    .filter((e) => !e.name.startsWith(".") || e.name === ".env.example")
    .filter((e) => !IGNORED_DIRS.has(e.name))
    .map((e): FileTreeNode => ({
      path: path.posix.join(relativePath.replace(/^\/+/, ""), e.name),
      name: e.name,
      type: e.isDirectory() ? "folder" : "file",
    }));
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

const MAX_READ_BYTES = 2 * 1024 * 1024; // 2MB — large enough for any hand-edited source file

export async function readWorkspaceFile(relativePath: string): Promise<string> {
  const abs = resolveWorkspacePath(relativePath);
  const stat = await fs.stat(abs);
  if (!stat.isFile()) throw new WorkspacePathError("Not a file");
  if (stat.size > MAX_READ_BYTES) {
    throw new WorkspacePathError(`File too large to open (${Math.round(stat.size / 1024)}KB)`);
  }
  return fs.readFile(abs, "utf-8");
}

export async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
  const abs = resolveWorkspacePath(relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

export async function createWorkspaceEntry(relativePath: string, type: "file" | "folder"): Promise<void> {
  const abs = resolveWorkspacePath(relativePath);
  if (type === "folder") {
    await fs.mkdir(abs, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, "", { flag: "wx" });
  }
}

export async function deleteWorkspaceEntry(relativePath: string): Promise<void> {
  const abs = resolveWorkspacePath(relativePath);
  if (abs === REPO_ROOT) throw new WorkspacePathError("Refusing to delete the workspace root");
  await fs.rm(abs, { recursive: true, force: true });
}
