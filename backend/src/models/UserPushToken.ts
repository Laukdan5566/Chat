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
  BelongsTo,
  Default
} from "sequelize-typescript";
import User from "./User";
import Company from "./Company";

@Table
class UserPushToken extends Model<UserPushToken> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column(DataType.TEXT)
  token: string;

  @Default("android")
  @Column
  platform: string;

  @Column(DataType.TEXT)
  deviceName: string;

  @Default(true)
  @Column
  enabled: boolean;

  @Default(DataType.NOW)
  @Column
  lastSeenAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default UserPushToken;
