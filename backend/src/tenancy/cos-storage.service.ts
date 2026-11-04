import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';

@Injectable()
export class CosStorageService {
  private readonly client: COS | null;
  private readonly bucket: string;
  private readonly region: string;
  constructor(config: ConfigService) {
    const id = config.get<string>('COS_SECRET_ID');
    const key = config.get<string>('COS_SECRET_KEY');
    this.bucket = config.get<string>('COS_BUCKET', '');
    this.region = config.get<string>('COS_REGION', '');
    this.client = id && key && this.bucket && this.region ? new COS({ SecretId: id, SecretKey: key }) : null;
  }
  isConfigured(): boolean { return this.client !== null; }
  async signedUrl(key: string, method: 'PUT' | 'GET', expires = 180): Promise<string> {
    if (!this.client) throw new ServiceUnavailableException('COS is not configured');
    return new Promise((resolve, reject) => {
      this.client!.getObjectUrl({ Bucket: this.bucket, Region: this.region, Key: key, Sign: true, Expires: expires, Method: method },
        (error: Error | null, data: { Url?: string }) => error ? reject(error) : data?.Url ? resolve(data.Url) : reject(new Error('COS URL missing')));
    });
  }
  async headObject(key: string): Promise<{ size: number; contentType: string }> {
    if (!this.client) throw new ServiceUnavailableException('COS is not configured');
    return new Promise((resolve, reject) => {
      this.client!.headObject({ Bucket: this.bucket, Region: this.region, Key: key },
        (error: Error | null, data: { Headers?: Record<string, string> }) => {
          if (error) return reject(error);
          const h = data?.Headers ?? {};
          resolve({ size: Number(h['content-length'] ?? h['Content-Length'] ?? 0), contentType: h['content-type'] ?? h['Content-Type'] ?? '' });
        });
    });
  }
}
