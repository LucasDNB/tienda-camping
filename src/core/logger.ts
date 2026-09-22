export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: Record<string, any>;
}

export class Logger {
  private static log(level: LogLevel, message: string, context?: Record<string, any>, correlationId?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(correlationId ? { correlationId } : {}),
      ...(context ? { context } : {}),
    };
    console.log(JSON.stringify(entry));
  }

  static info(message: string, context?: Record<string, any>, correlationId?: string) {
    this.log("INFO", message, context, correlationId);
  }

  static warn(message: string, context?: Record<string, any>, correlationId?: string) {
    this.log("WARN", message, context, correlationId);
  }

  static error(message: string, context?: Record<string, any>, correlationId?: string) {
    this.log("ERROR", message, context, correlationId);
  }

  static debug(message: string, context?: Record<string, any>, correlationId?: string) {
    this.log("DEBUG", message, context, correlationId);
  }
}
