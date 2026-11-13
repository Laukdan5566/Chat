// Testes de regressão de segurança (sem banco): rode com `npm run test:security`
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/security-tests/*.security.test.ts"],
  clearMocks: true
};
