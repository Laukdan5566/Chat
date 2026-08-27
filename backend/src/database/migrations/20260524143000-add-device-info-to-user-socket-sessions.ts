import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("UserSocketSessions", "deviceType", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "desktop"
    });

    await queryInterface.addColumn("UserSocketSessions", "userAgent", {
      type: DataTypes.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("UserSocketSessions", "userAgent");
    await queryInterface.removeColumn("UserSocketSessions", "deviceType");
  }
};
