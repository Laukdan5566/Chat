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
  HasMany,
  Default
} from "sequelize-typescript";
import Company from "./Company";
import Whatsapp from "./Whatsapp";
import Queue from "./Queue";
import SalesRoutingConsultant from "./SalesRoutingConsultant";

@Table
class SalesRoutingConfig extends Model<SalesRoutingConfig> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default(false)
  @Column
  enabled: boolean;

  @Column
  publicId: string;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @Column
  whatsappNumber: string;

  @ForeignKey(() => Queue)
  @Column
  newQueueId: number;

  @BelongsTo(() => Queue)
  newQueue: Queue;

  @ForeignKey(() => Queue)
  @Column
  receptionQueueId: number;

  @BelongsTo(() => Queue)
  receptionQueue: Queue;

  @Default("Atendimento comercial")
  @Column
  title: string;

  @Column
  botMessages: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => SalesRoutingConsultant, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  consultants: SalesRoutingConsultant[];
}

export default SalesRoutingConfig;
