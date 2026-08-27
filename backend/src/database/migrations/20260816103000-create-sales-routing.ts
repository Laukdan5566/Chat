import { DataTypes, QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Contacts", "preferredQueueId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Queues", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
    await queryInterface.addColumn("Contacts", "salesRoutingStep", {
      type: DataTypes.STRING,
      allowNull: true
    });

    await queryInterface.createTable("SalesRoutingConfigs", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      publicId: { type: DataTypes.STRING, allowNull: false, unique: true },
      whatsappId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      whatsappNumber: { type: DataTypes.STRING, allowNull: true },
      newQueueId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      title: { type: DataTypes.STRING, allowNull: false, defaultValue: "Atendimento comercial" },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable("SalesRoutingConsultants", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      salesRoutingConfigId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "SalesRoutingConfigs", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      queueId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      label: { type: DataTypes.STRING, allowNull: false },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable("SalesRoutingSessions", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      salesRoutingConfigId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "SalesRoutingConfigs", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      queueId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      kind: { type: DataTypes.STRING, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      consumedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("SalesRoutingSessions");
    await queryInterface.dropTable("SalesRoutingConsultants");
    await queryInterface.dropTable("SalesRoutingConfigs");
    await queryInterface.removeColumn("Contacts", "salesRoutingStep");
    await queryInterface.removeColumn("Contacts", "preferredQueueId");
  }
};
