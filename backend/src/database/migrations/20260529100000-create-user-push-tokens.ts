import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("UserPushTokens", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      platform: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "android"
      },
      deviceName: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      createdAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      }
    });

    await queryInterface.addIndex("UserPushTokens", ["token"], {
      unique: true,
      name: "UserPushTokens_token_unique"
    });

    await queryInterface.addIndex("UserPushTokens", ["userId", "enabled"], {
      name: "UserPushTokens_user_enabled_idx"
    });

    await queryInterface.addIndex("UserPushTokens", ["companyId", "enabled"], {
      name: "UserPushTokens_company_enabled_idx"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("UserPushTokens");
  }
};
