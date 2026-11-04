import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { CosStorageService } from './cos-storage.service';

@Injectable()
export class InspectionPhotoService {
  constructor(private readonly db: PrismaService, private readonly cos: CosStorageService) {}
  async createUpload(tenantId: string, orderId: string, actorId: string, input: { recordId: string; mimeType: string; fileSizeBytes: number }) {
    if (!['image/jpeg','image/png','image/webp'].includes(input.mimeType)) throw new BadRequestException('Only JPEG, PNG and WebP are supported');
    if (input.fileSizeBytes < 1 || input.fileSizeBytes > 20971520) throw new BadRequestException('Image must be at most 20 MB');
    if (!this.cos.isConfigured()) throw new ConflictException('COS storage is not configured');
    const orders = await this.db.$queryRaw<Array<{status:string; assigned_to_membership_id:string|null}>>`SELECT status, assigned_to_membership_id FROM orders WHERE tenant_id=${tenantId} AND id=${orderId}`;
    if (!orders[0]) throw new NotFoundException('Order not found');
    if (!['in_progress','needs_revision'].includes(orders[0].status)) throw new ConflictException('Order does not accept photos');
    if (orders[0].assigned_to_membership_id && orders[0].assigned_to_membership_id !== actorId) throw new ForbiddenException('Only the assigned inspector may upload');
    const records = await this.db.$queryRaw<Array<{id:string}>>`SELECT id FROM inspection_records WHERE id=${input.recordId} AND tenant_id=${tenantId} AND order_id=${orderId}`;
    if (!records[0]) throw new BadRequestException('Inspection record does not belong to this order');
    const id = randomUUID();
    const ext = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType === 'image/png' ? 'png' : 'webp';
    const key = `tenants/${tenantId}/orders/${orderId}/photos/${id}/original.${ext}`;
    const uploadUrl = await this.cos.signedUrl(key, 'PUT', 300);
    return { photoId:id, method:'PUT', uploadUrl, expiresIn:300, headers:{'Content-Type':input.mimeType}, completePath:`/api/v1/tenants/${tenantId}/orders/${orderId}/photos/${id}/complete` };
  }
  async complete(tenantId: string, orderId: string, photoId: string, actorId: string, input: {recordId:string; mimeType:string; fileSizeBytes:number}) {
    const orders = await this.db.$queryRaw<Array<{status:string; assigned_to_membership_id:string|null}>>`SELECT status, assigned_to_membership_id FROM orders WHERE tenant_id=${tenantId} AND id=${orderId}`;
    if (!orders[0]) throw new NotFoundException('Order not found');
    if (!['in_progress','needs_revision'].includes(orders[0].status)) throw new ConflictException('Order does not accept photos');
    if (orders[0].assigned_to_membership_id && orders[0].assigned_to_membership_id !== actorId) throw new ForbiddenException('Only the assigned inspector may confirm upload');
    const records = await this.db.$queryRaw<Array<{id:string}>>`SELECT id FROM inspection_records WHERE id=${input.recordId} AND tenant_id=${tenantId} AND order_id=${orderId}`;
    if (!records[0]) throw new BadRequestException('Inspection record does not belong to this order');
    const ext = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType === 'image/png' ? 'png' : 'webp';
    const key = `tenants/${tenantId}/orders/${orderId}/photos/${photoId}/original.${ext}`;
    const head = await this.cos.headObject(key);
    if (head.size !== input.fileSizeBytes || head.size > 20971520 || head.contentType !== input.mimeType) throw new BadRequestException('Uploaded file metadata does not match request');
    const exists = await this.db.$queryRaw<Array<{id:string}>>`SELECT id FROM inspection_photos WHERE id=${photoId} AND tenant_id=${tenantId}`;
    if (exists[0]) return {photoId, uploaded:true};
    await this.db.$executeRaw`INSERT INTO inspection_photos (id,tenant_id,order_id,record_id,object_key_original,mime_type,file_size_bytes) VALUES (${photoId},${tenantId},${orderId},${input.recordId},${key},${input.mimeType},${head.size})`;
    await this.db.$executeRaw`INSERT INTO audit_logs (id,tenant_id,actor_membership_id,action,resource_type,resource_id) VALUES (${randomUUID()},${tenantId},${actorId},'inspection_photo.uploaded','order',${orderId})`;
    return {photoId, uploaded:true};
  }
}
