import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users';

@Entity('entity_views')
@Index(['user_id', 'entity_type', 'entity_id'], { unique: true })
@Index(['user_id', 'entity_type', 'last_viewed_at'])
@Index(['entity_type', 'entity_id'])
export class EntityView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 50 })
  entity_type: string; // 'PROPERTY', 'AD'

  @Column({ type: 'uuid' })
  entity_id: string;

  @Column({ type: 'int', default: 1 })
  view_count: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  last_viewed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}