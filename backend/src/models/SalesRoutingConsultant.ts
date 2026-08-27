import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default
} from "sequelize-typescript";
import SalesRoutingConfig from "./SalesRoutingConfig";
import Queue from "./Queue";

@Table
class SalesRoutingConsultant extends Model<SalesRoutingConsultant> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => SalesRoutingConfig)
  @Column
  salesRoutingConfigId: number;

  @BelongsTo(() => SalesRoutingConfig)
  config: SalesRoutingConfig;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Column
  label: string;

  @Default(true)
  @Column
  active: boolean;

  @Default(0)
  @Column
  sortOrder: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default SalesRoutingConsultant;
