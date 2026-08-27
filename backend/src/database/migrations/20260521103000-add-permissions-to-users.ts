import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addColumn("Users", "permissions", {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Users", "permissions");
  }
};
