import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany
} from 'typeorm';
import { LoginHistory } from '../../auth';
import { UserType } from '../enums/usertype';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, unique: true })
  googleId?: string; // payload.sub

  @Column({ nullable: true, unique: true })
  email: string;

  @Column({ nullable: true })
  password?: string;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true, unique: true })
  phoneNumber: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, unique: true })
  referralCode?: string;

  @Column({ nullable: true })
  referredBy?: string;

  @Column({
    type: 'enum',
    array: true,
    enum: UserType,
    default: [UserType.BUYER]
  })
  roles: UserType[];

  @OneToMany(() => LoginHistory, (history) => history.user)
  loginHistory: LoginHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'boolean', default: false })
  isKycVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  kycVerifiedAt: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  aadhaarNumberMasked: string;

  // Profile Picture
  @Column({ type: 'varchar', length: 500, nullable: true })
  profilePicture?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  profilePictureKey?: string;

  // Verification Status
  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'boolean', default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  phoneVerifiedAt?: Date;
}
