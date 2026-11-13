import path from "path";

// Resolve um caminho pedido pelo cliente dentro de baseDir. Devolve null se o resultado
// sair do diretório (.., %2e%2e já decodificado, caminho absoluto) ou tiver byte nulo.
const resolveInsideDir = (baseDir: string, requested: string): string | null => {
  if (!requested || requested.includes("\0")) return null;

  const base = path.resolve(baseDir);
  const full = path.resolve(base, requested);

  return full.startsWith(base + path.sep) ? full : null;
};

export default resolveInsideDir;
