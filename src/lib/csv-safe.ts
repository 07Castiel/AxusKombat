/**
 * Exportação de planilha à prova de injeção de fórmula (#23).
 *
 * Uma célula que começa com = + - @ (ou tab/CR) é interpretada como FÓRMULA
 * pelo Excel/Sheets/LibreOffice. Como parte dos dados exportados vem de campo
 * controlado pelo usuário — o referrer/user_agent/página de um visitante anônimo
 * em visitor_logs, o nome de um aluno —, um valor como `=HYPERLINK(...)` roda na
 * máquina de quem abre o arquivo. Prefixar com apóstrofo faz o app mostrar o
 * texto literal, sem executar (mitigação recomendada pela OWASP).
 *
 * Use `tabelaCsv`/`linhaCsv`/`campoCsv` para CSV e `neutralizarFormula` para as
 * células de uma planilha XLSX.
 */

// = + - @ no início, além de TAB e CR, que alguns apps também tratam como gatilho.
const INICIO_FORMULA = /^[=+\-@\t\r]/;

/** Prefixa com apóstrofo se a célula puder ser lida como fórmula. */
export function neutralizarFormula(valor: unknown): string {
  if (valor == null) return "";
  const s = String(valor);
  return INICIO_FORMULA.test(s) ? `'${s}` : s;
}

/** Um campo CSV: neutraliza fórmula e escapa aspas / vírgula / quebra / ponto-e-vírgula. */
export function campoCsv(valor: unknown): string {
  const s = neutralizarFormula(valor).replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}

/** Uma linha CSV a partir de uma lista de células. */
export function linhaCsv(celulas: unknown[]): string {
  return celulas.map(campoCsv).join(",");
}

/**
 * Tabela CSV a partir de registros. A primeira linha é o cabeçalho, tirado das
 * chaves do primeiro registro. Cada célula passa pela neutralização + escape.
 */
export function tabelaCsv(linhas: Record<string, unknown>[]): string {
  if (!linhas.length) return "";
  const cols = Object.keys(linhas[0]);
  return [
    cols.map(campoCsv).join(","),
    ...linhas.map((r) => cols.map((c) => campoCsv(r[c])).join(",")),
  ].join("\n");
}
