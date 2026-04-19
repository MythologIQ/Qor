// HexaWars Gateway Error Codes
// task-155-gateway-error-codes | phase E

export const ERR = {
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  INVALID_ACTION: 'INVALID_ACTION',
  TIMEOUT: 'TIMEOUT',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrCode = (typeof ERR)[keyof typeof ERR];

export function err(code: ErrCode, message: string, detail?: string): { code: ErrCode; message: string; detail?: string } {
  return { code, message, detail };
}