import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await Promise.all([
      queryInterface.addColumn("Plans", "facebookEnabled", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }),
      queryInterface.addColumn("Plans", "instagramEnabled", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      })
    ]);
  },

  down: async (queryInterface: QueryInterface) => {
    await Promise.all([
      queryInterface.removeColumn("Plans", "facebookEnabled"),
      queryInterface.removeColumn("Plans", "instagramEnabled")
    ]);
  }
};
