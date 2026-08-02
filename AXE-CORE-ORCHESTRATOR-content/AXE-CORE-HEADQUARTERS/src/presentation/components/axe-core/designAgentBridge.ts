type DesignAgentListener = (instruction: string) => void;

const listeners = new Set<DesignAgentListener>();

export const designAgentBridge = {
  register(listener: DesignAgentListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  send(instruction: string) {
    const trimmed = instruction.trim();
    if (!trimmed) return false;
    listeners.forEach((listener) => listener(trimmed));
    return listeners.size > 0;
  },
};
