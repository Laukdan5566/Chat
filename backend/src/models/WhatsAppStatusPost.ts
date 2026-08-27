import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import Whatsapp from "./Whatsapp";

@Table({ tableName: "WhatsAppStatusPosts" })
class WhatsAppStatusPost extends Model<WhatsAppStatusPost> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @Column(DataType.TEXT)
  body: string;

  @Column(DataType.TEXT)
  mediaUrl: string;

  @Column(DataType.STRING)
  mediaType: string;

  @Column(DataType.STRING)
  mediaName: string;

  @Column(DataType.STRING)
  messageId: string;

  @Column(DataType.INTEGER)
  recipientsCount: number;

  @Column(DataType.STRING)
  backgroundColor: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default WhatsAppStatusPost;
