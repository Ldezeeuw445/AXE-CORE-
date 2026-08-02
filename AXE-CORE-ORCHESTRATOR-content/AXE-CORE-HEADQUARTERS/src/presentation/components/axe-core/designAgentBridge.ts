/**
 * Tiny pub/sub so PreviewPanel Design Mode can hand off to CodeEditorPage
 * without prop-drilling through every layout layer.
 */
type DesignAgentHandler = (instruction: string) => void;

let handler: DesignAgentHandler | null = null;

export const designAgentBridge = {
  register(next: DesignAgentHandler): () => void {
    handler = next;
    return () => {
      if (handler === next) handler = null;
    };
  },
  send(instruction: string): boolean {
    if (!handler) return false;
    handler(instruction);
    return true;
  },
  isReady(): boolean {
    return handler !== null;
  },
};
