/**
 * Structured error with machine-readable code, human-readable message,
 * and optional structured context.
 */
export class FlowkitError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'FlowkitError';
    this.code = code;
    this.context = context;
  }

  toJSON(): {
    code: string;
    message: string;
    context?: Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.message,
      ...(this.context !== undefined && { context: this.context }),
    };
  }
}
