import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().port().default(3000),
        API_PREFIX: Joi.string().default('api/v1'),
        CORS_ORIGINS: Joi.string().allow('').default(''),
        DATABASE_URL: Joi.string().uri({ scheme: ['mysql'] }).optional(),
        JWT_ACCESS_SECRET: Joi.string().min(32).optional(),
        JWT_REFRESH_SECRET: Joi.string().min(32).optional(),
      }),
    }),
    HealthModule,
  ],
})
export class AppModule {}