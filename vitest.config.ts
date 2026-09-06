import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Config separada da do app: o build usa @lovable.dev/vite-tanstack-config, que
// carrega os plugins do TanStack Start e do Cloudflare. Nada disso e necessario
// para rodar as regras puras, e carrega-los deixaria o teste lento e fragil.
export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    // .tsx entrou junto por causa de FrequenciaAluno.test.tsx: a distincao
    // entre "0%" e "Sem dados suficientes" so se prova renderizando. Usa
    // react-dom/server, que ja e dependencia — nenhum runner de DOM novo.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
