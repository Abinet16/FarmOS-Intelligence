import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'farmos:isPublic';

/** Opts a route out of the global authentication guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
