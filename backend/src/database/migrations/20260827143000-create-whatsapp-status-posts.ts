import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("WhatsAppStatusPosts", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      body: { type: DataTypes.TEXT, allowNull: true },
      mediaUrl: { type: DataTypes.TEXT, allowNull: true },
      mediaType: { type: DataTypes.STRING, allowNull: true },
      mediaName: { type: DataTypes.STRING, allowNull: true },
      messageId: { type: DataTypes.STRING, allowNull: true },
      recipientsCount: { type: DataTypes.INTEGER, allowNull: false },
      backgroundColor: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("WhatsAppStatusPosts", ["companyId", "createdAt"], {
      name: "idx_whatsapp_status_posts_company_created"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("WhatsAppStatusPosts");
  }
};
