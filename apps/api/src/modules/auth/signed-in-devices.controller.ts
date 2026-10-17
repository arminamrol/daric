import {
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { signedInDeviceSchema, type SignedInDevice } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import {
  Client,
  type ClientInfo,
  CurrentDeviceId,
  CurrentUserId,
  isUuid,
} from '../../common/request';
import { SignedInDevicesService } from './signed-in-devices.service';

class SignedInDeviceDto extends createZodDto(signedInDeviceSchema) {}

/** The User's Signed-in Devices, shown on the Subscription page. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('v1/me/devices')
export class SignedInDevicesController {
  constructor(@Inject(SignedInDevicesService) private readonly devices: SignedInDevicesService) {}

  /** Most recently used first; `current` marks the one asking. */
  @Get()
  @ApiOkResponse({ type: [SignedInDeviceDto] })
  list(
    @CurrentUserId() userId: string,
    @CurrentDeviceId() deviceId: string | null,
  ): Promise<SignedInDevice[]> {
    return this.devices.list(userId, deviceId);
  }

  @Delete(':deviceId')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'The device is signed out; its next refresh is refused as SIGNED_OUT_REMOTELY',
  })
  @ApiNotFoundResponse({ description: 'Not one of the User’s Signed-in Devices' })
  @ApiConflictResponse({
    description: 'It is the device asking: log out instead, which also wipes what it kept',
  })
  async signOut(
    @CurrentUserId() userId: string,
    @CurrentDeviceId() currentDeviceId: string | null,
    @Param('deviceId') deviceId: string,
    @Client() client: ClientInfo,
  ): Promise<void> {
    if (deviceId === currentDeviceId) {
      throw new ConflictException('This is the current device; log out instead');
    }
    if (!isUuid(deviceId) || !(await this.devices.signOut(userId, deviceId, client))) {
      throw new NotFoundException();
    }
  }
}
