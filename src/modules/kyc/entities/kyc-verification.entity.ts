import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { KycStatus, VerificationType, KycEntityType } from '../enums';

@Entity('kyc_verifications')
@Index(['entityType', 'entityId'])
@Index(['surepassClientId'])
@Index(['status'])
@Index(['userId', 'status'])
export class KycVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: KycEntityType,
    default: KycEntityType.USER
  })
  entityType: KycEntityType;

  @Column({ type: 'uuid' })
  entityId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Future: Link to company (Phase 4+)
  // @Column({ type: 'uuid', nullable: true })
  // companyId: string;

  // @ManyToOne(() => AgentCompanyProfile, { onDelete: 'CASCADE', nullable: true })
  // @JoinColumn({ name: 'companyId' })
  // company: AgentCompanyProfile;

  @Column({
    type: 'enum',
    enum: VerificationType,
    default: VerificationType.AADHAAR
  })
  verificationType: VerificationType;

  @Column({
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.PENDING
  })
  status: KycStatus;

  // Surepass specific fields
  @Column({ type: 'varchar', length: 100, nullable: true })
  surepassClientId: string;

  @Column({ type: 'text', nullable: true })
  surepassToken: string;

  @Column({ type: 'text', nullable: true })
  verificationUrl: string;

  // Verified document details
  @Column({ type: 'varchar', length: 50, nullable: true })
  documentNumberMasked: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  verifiedName: string;

  @Column({ type: 'jsonb', nullable: true })
  verifiedData: Record<string, any>;

  // S3 storage for XML document
  @Column({ type: 'varchar', length: 900, nullable: true })
  xmlDocumentUrl: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  xmlDocumentKey: string;

  // Error tracking
  @Column({ type: 'varchar', length: 100, nullable: true })
  errorCode: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  // Raw API responses for debugging
  @Column({ type: 'jsonb', nullable: true })
  rawInitResponse: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  rawDownloadResponse: Record<string, any>;

  // Request metadata
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @Column({ type: 'text', nullable: true })
  redirectUrl: string;

  // Timestamps
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

