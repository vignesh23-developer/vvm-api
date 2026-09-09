/**
 * One-time admin script to set a hashed password for a user
 * Safe to run locally
 * DELETE after use
 */

import 'dotenv/config';
import 'reflect-metadata';
import bcrypt from 'bcrypt';
import {
  DataSource,
  DataSourceOptions,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne
} from 'typeorm';

export enum UserType {
    ADMIN = 'ADMIN',
    AGENT = 'AGENT',
    BUYER = 'BUYER'
  }
  

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

@Entity('login_history')
export class LoginHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.loginHistory, { onDelete: 'CASCADE' })
  user: User | null;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent: string; // browser / device info

  @CreateDateColumn()
  loginAt: Date;
}

const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: 'postgres',
  password: 'postgres',
  database: 'vvm-database',
  entities: [User, LoginHistory],
  synchronize: false,
  logging: false
};

const AppDataSource = new DataSource(dataSourceOptions);

async function main() {
  console.log('🔌 Connecting to database...');
  await AppDataSource.initialize();

  const email = 'aliakram9789@gmail.com';
  const plainPassword = 'akram9042';
  const SALT_ROUNDS = 12;

  console.log(`🔍 Looking up user: ${email}`);

  const userRepo = AppDataSource.getRepository(User);

  const user = await userRepo.findOne({
    where: { email }
  });

  if (!user) {
    throw new Error(`❌ User not found: ${email}`);
  }

  console.log('🔐 Hashing password...');
  const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);

  user.password = hashedPassword;
  user.isActive = true;

  // OPTIONAL but recommended for manually created users
  user.isEmailVerified = true;
  user.emailVerifiedAt = new Date();

  await userRepo.save(user);

  console.log(`✅ Password successfully updated for ${user.email}`);

  await AppDataSource.destroy();
  console.log('🔌 Database connection closed');
}

main().catch(async (error) => {
  console.error('🔥 Script failed:', error);
  try {
    await AppDataSource.destroy();
  } catch {}
  process.exit(1);
});
