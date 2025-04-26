import { LogLayer, ConsoleTransport, LogLevel } from 'loglayer';

export const log = new LogLayer({
  transport: new ConsoleTransport({
    logger: console,
  }),
});

export function isValidLogLevel(value: string): value is LogLevel {
  return Object.values(LogLevel).includes(value);
}
