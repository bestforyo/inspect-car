import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { TenancyModule } from './tenancy/tenancy.module';

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
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
      }),
    }),
    AuthModule,
    TenancyModule,
    HealthModule,
  ],
})
export class AppModule {}