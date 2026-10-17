import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const CHECKS_PASSWORD = 'daric:checks-password';
const reflector = new Reflector();

/** Marks a route outside AuthController that checks a password, so the auth rate limit applies to it. */
export const ChecksPassword = () => SetMetadata(CHECKS_PASSWORD, true);

export function checksPassword(context: ExecutionContext): boolean {
  return reflector.get<boolean | undefined>(CHECKS_PASSWORD, context.getHandler()) === true;
}
