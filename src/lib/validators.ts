// Schemas Zod centralizados para validação dos formulários do sistema.
import { z } from "zod";

const requiredString = (label: string, max = 255) =>
  z.string({ required_error: `${label} é obrigatório.` })
    .trim()
    .min(1, `${label} é obrigatório.`)
    .max(max, `${label} deve ter no máximo ${max} caracteres.`);

const optionalString = (max = 255) =>
  z.string().trim().max(max, `Campo deve ter no máximo ${max} caracteres.`).optional().or(z.literal(""));

export const emailSchema = z
  .string({ required_error: "E-mail é obrigatório." })
  .trim()
  .min(1, "E-mail é obrigatório.")
  .email("Formato de e-mail inválido.")
  .max(255, "E-mail muito longo.");

export const passwordSchema = z
  .string({ required_error: "Senha é obrigatória." })
  .min(6, "A senha deve ter pelo menos 6 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
});

export const signupSchema = z.object({
  tenant_nome: requiredString("Nome da academia", 120),
  nome_completo: requiredString("Seu nome", 120),
  email: emailSchema,
  telefone: optionalString(20),
  password: passwordSchema,
});

export const passwordChangeSchema = z.object({
  atual: z.string().min(1, "Informe sua senha atual."),
  nova: passwordSchema,
  confirma: z.string().min(1, "Confirme a nova senha."),
}).refine((d) => d.nova === d.confirma, {
  message: "As senhas não coincidem.",
  path: ["confirma"],
});

export const alunoSchema = z.object({
  nome_completo: requiredString("Nome completo", 120),
  email: z.string().trim().email("Formato de e-mail inválido.").max(255).optional().or(z.literal("")),
  telefone: optionalString(20),
  data_nascimento: z.string().optional().or(z.literal("")),
  cpf: z.string().trim().max(20, "CPF muito longo.").optional().or(z.literal("")),
  endereco: optionalString(255),
  categoria: z.enum(["adulto", "kids"], { required_error: "Selecione a categoria." }),
  responsavel_nome: optionalString(120),
  responsavel_telefone: optionalString(20),
  contato_emergencia: optionalString(120),
  observacoes: optionalString(1000),
  observacoes_medicas: optionalString(1000),
  peso: z.string().optional().or(z.literal("")),
  altura: z.string().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.data_nascimento) {
    const dn = new Date(data.data_nascimento);
    if (isNaN(dn.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data de nascimento inválida.", path: ["data_nascimento"] });
      return;
    }
    const isMenor = dn > new Date(Date.now() - 18 * 365 * 24 * 3600 * 1000);
    if (isMenor && !data.responsavel_nome) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Responsável obrigatório para menores de 18 anos.", path: ["responsavel_nome"] });
    }
  }
  if (data.peso && isNaN(Number(data.peso))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Peso deve ser um número.", path: ["peso"] });
  }
  if (data.altura && isNaN(Number(data.altura))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Altura deve ser um número.", path: ["altura"] });
  }
});

export const planoSchema = z.object({
  nome: requiredString("Nome do plano", 120),
  valor: z.coerce.number({ invalid_type_error: "Valor deve ser um número." })
    .nonnegative("Valor não pode ser negativo.")
    .max(999999, "Valor muito alto."),
  duracao: z.string().min(1, "Selecione a duração."),
  dias_personalizado: z.union([z.coerce.number().int().positive("Informe um número de dias válido."), z.literal(null), z.undefined()]).optional(),
  categoria: z.enum(["adulto", "kids"]),
  modalidades: z.array(z.string()).default([]),
  descricao: optionalString(500),
}).superRefine((data, ctx) => {
  if (data.duracao === "personalizado" && (!data.dias_personalizado || data.dias_personalizado <= 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a quantidade de dias para a duração personalizada.", path: ["dias_personalizado"] });
  }
});

export const modalidadeSchema = z.object({
  nome: requiredString("Nome da modalidade", 80),
  termo_graduacao: requiredString("Termo de graduação", 40),
  descricao: optionalString(500),
});

export const graduacaoSchema = z.object({
  nome: requiredString("Nome da graduação", 80),
  modalidade_id: z.string().min(1, "Selecione uma modalidade."),
  categoria: z.enum(["adulto", "kids"]),
  cor: optionalString(40),
  ordem: z.coerce.number().int("Ordem deve ser um número inteiro.").min(0, "Ordem inválida.").default(0),
});

export const horarioSchema = z.object({
  modalidade_id: z.string().min(1, "Selecione uma modalidade."),
  dia: z.string().min(1, "Selecione o dia da semana."),
  hora: z.string().min(1, "Informe o horário."),
  hora_fim: z.string().optional().or(z.literal("")),
  categoria: z.enum(["adulto", "kids"]),
  professor: optionalString(120),
  capacidade_maxima: z.union([z.coerce.number().int().positive("Capacidade deve ser maior que zero."), z.literal(null), z.undefined()]).optional(),
  observacao: optionalString(500),
});

export const matriculaSchema = z.object({
  aluno_id: z.string().min(1, "Selecione o aluno."),
  plano_id: z.string().min(1, "Selecione o plano."),
  data_inicio: z.string().min(1, "Informe a data de início."),
  desconto: z.coerce.number().min(0, "Desconto não pode ser negativo.").default(0),
  observacoes: optionalString(500),
});

export const pagamentoSchema = z.object({
  aluno_id: z.string().min(1, "Selecione o aluno."),
  matricula_id: z.string().optional().or(z.literal("")),
  valor: z.coerce.number().positive("Informe um valor maior que zero."),
  metodo: z.string().min(1, "Selecione o método de pagamento."),
  data_vencimento: z.string().min(1, "Informe a data de vencimento."),
  data_pagamento: z.string().optional().or(z.literal("")),
  observacoes: optionalString(500),
});
