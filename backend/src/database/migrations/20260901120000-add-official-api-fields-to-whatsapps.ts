import { DataTypes, QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "apiToken", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn("Whatsapps", "apiChannelId", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn("Whatsapps", "apiWebhookSecret", {
      type: DataTypes.STRING,
      allowNull: true
    });

    await queryInterface.addIndex("Whatsapps", ["apiWebhookSecret"], {
      name: "whatsapps_api_webhook_secret_unique",
      unique: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex(
      "Whatsapps",
      "whatsapps_api_webhook_secret_unique"
    );
    await queryInterface.removeColumn("Whatsapps", "apiWebhookSecret");
    await queryInterface.removeColumn("Whatsapps", "apiChannelId");
    await queryInterface.removeColumn("Whatsapps", "apiToken");
  }
};
