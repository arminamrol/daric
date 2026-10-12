import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const SENDS_MAIL = 'daric:sends-mail';
const reflector = new Reflector();

/** Marks a route that mails someone on request, so the hourly mail rate limit applies to it. */
export const SendsMail = () => SetMetadata(SENDS_MAIL, true);

export function sendsMail(context: ExecutionContext): boolean {
  return reflector.get<boolean | undefined>(SENDS_MAIL, context.getHandler()) === true;
}
