import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import SalesRoutingConfig from "./SalesRoutingConfig";
import Queue from "./Queue";

@Table
class SalesRoutingSession extends Model<SalesRoutingSession> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => SalesRoutingConfig)
  @Column
  salesRoutingConfigId: number;

  @BelongsTo(() => SalesRoutingConfig)
  config: SalesRoutingConfig;

  @Column
  code: string;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Column
  kind: string;

  @Column
  expiresAt: Date;

  @Column
  consumedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default SalesRoutingSession;
