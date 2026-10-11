import { Body } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { createZodDto, ZodValidationPipe, type ZodDto } from 'nestjs-zod';

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

/**
 * A zod DTO for a schema a class cannot extend, such as a union. OpenAPI names
 * a schema after its DTO, so it is named here rather than by a class.
 */
export function namedZodDto<TSchema extends Parameters<typeof createZodDto>[0]>(
  name: string,
  schema: TSchema,
): ZodDto<TSchema> {
  const dto = createZodDto(schema);
  Object.defineProperty(dto, 'name', { value: name });
  return dto;
}
