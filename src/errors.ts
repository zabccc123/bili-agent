export class BiliError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'BiliError'; }
}
export function errorCode(error: unknown): string {
  return error instanceof BiliError ? error.code : 'UNEXPECTED_ERROR';
}
export function publicError(error: unknown) {
  return { code: errorCode(error), message: error instanceof BiliError ? error.message : '操作未完成。请运行 doctor 查看连接状态；原始浏览器输出不会写入聊天。' };
}
