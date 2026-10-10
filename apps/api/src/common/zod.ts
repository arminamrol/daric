import { Body } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { ZodValidationPipe, type ZodDto } from 'nestjs-zod';

/**
 * Validates the request body with a zod DTO and documents it in OpenAPI.
 * Explicit because the API is not compiled with decorator metadata.
 */
export function ZodBody(dto: ZodDto): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodValidationPipe(dto))(target, key, index);
    if (key !== undefined) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (descriptor) ApiBody({ type: dto })(target, key, descriptor);
    }
  };
}
