export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alunos: {
        Row: {
          altura: number | null
          categoria: Database["public"]["Enums"]["categoria_aluno"]
          contato_emergencia: string | null
          cpf: string | null
          created_at: string
          data_entrada: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          foto_url: string | null
          graduacao_atual_id: string | null
          id: string
          nome_completo: string
          observacoes: string | null
          observacoes_medicas: string | null
          peso: number | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
          status: Database["public"]["Enums"]["status_aluno"]
          telefone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          altura?: number | null
          categoria?: Database["public"]["Enums"]["categoria_aluno"]
          contato_emergencia?: string | null
          cpf?: string | null
          created_at?: string
          data_entrada?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          foto_url?: string | null
          graduacao_atual_id?: string | null
          id?: string
          nome_completo: string
          observacoes?: string | null
          observacoes_medicas?: string | null
          peso?: number | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          status?: Database["public"]["Enums"]["status_aluno"]
          telefone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          altura?: number | null
          categoria?: Database["public"]["Enums"]["categoria_aluno"]
          contato_emergencia?: string | null
          cpf?: string | null
          created_at?: string
          data_entrada?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          foto_url?: string | null
          graduacao_atual_id?: string | null
          id?: string
          nome_completo?: string
          observacoes?: string | null
          observacoes_medicas?: string | null
          peso?: number | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          status?: Database["public"]["Enums"]["status_aluno"]
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alunos_graduacao_atual_id_fkey"
            columns: ["graduacao_atual_id"]
            isOneToOne: false
            referencedRelation: "graduacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          aluno_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          dia_vencimento: number
          id: string
          observacoes: string | null
          plano_id: string | null
          status: Database["public"]["Enums"]["status_contrato"]
          tenant_id: string
          updated_at: string
          valor_mensalidade: number
        }
        Insert: {
          aluno_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento: number
          id?: string
          observacoes?: string | null
          plano_id?: string | null
          status?: Database["public"]["Enums"]["status_contrato"]
          tenant_id: string
          updated_at?: string
          valor_mensalidade: number
        }
        Update: {
          aluno_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento?: number
          id?: string
          observacoes?: string | null
          plano_id?: string | null
          status?: Database["public"]["Enums"]["status_contrato"]
          tenant_id?: string
          updated_at?: string
          valor_mensalidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas: {
        Row: {
          categoria: string | null
          created_at: string
          data: string
          descricao: string
          id: string
          observacoes: string | null
          tenant_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          data?: string
          descricao: string
          id?: string
          observacoes?: string | null
          tenant_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          categoria?: string | null
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          observacoes?: string | null
          tenant_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      graduacoes: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_aluno"]
          cor: string | null
          created_at: string
          id: string
          modalidade_id: string | null
          nome: string
          ordem: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_aluno"]
          cor?: string | null
          created_at?: string
          id?: string
          modalidade_id?: string | null
          nome: string
          ordem?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_aluno"]
          cor?: string | null
          created_at?: string
          id?: string
          modalidade_id?: string | null
          nome?: string
          ordem?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduacoes_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_graduacoes: {
        Row: {
          aluno_id: string
          created_at: string
          data: string
          graduacao_anterior_id: string | null
          graduacao_nova_id: string
          id: string
          observacoes: string | null
          tenant_id: string
        }
        Insert: {
          aluno_id: string
          created_at?: string
          data?: string
          graduacao_anterior_id?: string | null
          graduacao_nova_id: string
          id?: string
          observacoes?: string | null
          tenant_id: string
        }
        Update: {
          aluno_id?: string
          created_at?: string
          data?: string
          graduacao_anterior_id?: string | null
          graduacao_nova_id?: string
          id?: string
          observacoes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_graduacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_graduacoes_graduacao_anterior_id_fkey"
            columns: ["graduacao_anterior_id"]
            isOneToOne: false
            referencedRelation: "graduacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_graduacoes_graduacao_nova_id_fkey"
            columns: ["graduacao_nova_id"]
            isOneToOne: false
            referencedRelation: "graduacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_graduacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios: {
        Row: {
          ativo: boolean
          capacidade_maxima: number | null
          categoria: Database["public"]["Enums"]["categoria_aluno"]
          created_at: string
          dia: Database["public"]["Enums"]["dia_semana"]
          hora: string
          hora_fim: string | null
          id: string
          modalidade_id: string
          observacao: string | null
          professor: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          capacidade_maxima?: number | null
          categoria?: Database["public"]["Enums"]["categoria_aluno"]
          created_at?: string
          dia: Database["public"]["Enums"]["dia_semana"]
          hora: string
          hora_fim?: string | null
          id?: string
          modalidade_id: string
          observacao?: string | null
          professor?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          capacidade_maxima?: number | null
          categoria?: Database["public"]["Enums"]["categoria_aluno"]
          created_at?: string
          dia?: Database["public"]["Enums"]["dia_semana"]
          hora?: string
          hora_fim?: string | null
          id?: string
          modalidade_id?: string
          observacao?: string | null
          professor?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mensalidades: {
        Row: {
          aluno_id: string
          competencia: string
          contrato_id: string
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          desconto: number
          forma_pagamento:
            | Database["public"]["Enums"]["metodo_pagamento"]
            | null
          id: string
          observacoes_pagamento: string | null
          status: Database["public"]["Enums"]["status_mensalidade"]
          tenant_id: string
          updated_at: string
          valor: number
          valor_final: number | null
        }
        Insert: {
          aluno_id: string
          competencia: string
          contrato_id: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          desconto?: number
          forma_pagamento?:
            | Database["public"]["Enums"]["metodo_pagamento"]
            | null
          id?: string
          observacoes_pagamento?: string | null
          status?: Database["public"]["Enums"]["status_mensalidade"]
          tenant_id: string
          updated_at?: string
          valor: number
          valor_final?: number | null
        }
        Update: {
          aluno_id?: string
          competencia?: string
          contrato_id?: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          desconto?: number
          forma_pagamento?:
            | Database["public"]["Enums"]["metodo_pagamento"]
            | null
          id?: string
          observacoes_pagamento?: string | null
          status?: Database["public"]["Enums"]["status_mensalidade"]
          tenant_id?: string
          updated_at?: string
          valor?: number
          valor_final?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mensalidades_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensalidades_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensalidades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modalidades: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          tenant_id: string
          termo_graduacao: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          tenant_id: string
          termo_graduacao?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          tenant_id?: string
          termo_graduacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modalidades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          agendada_para: string | null
          aluno_id: string | null
          canal: string
          created_at: string
          destinatario: string | null
          enviada_em: string | null
          erro: string | null
          id: string
          mensagem: string
          mensalidade_id: string | null
          status: Database["public"]["Enums"]["status_notificacao"]
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          agendada_para?: string | null
          aluno_id?: string | null
          canal?: string
          created_at?: string
          destinatario?: string | null
          enviada_em?: string | null
          erro?: string | null
          id?: string
          mensagem: string
          mensalidade_id?: string | null
          status?: Database["public"]["Enums"]["status_notificacao"]
          tenant_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          agendada_para?: string | null
          aluno_id?: string | null
          canal?: string
          created_at?: string
          destinatario?: string | null
          enviada_em?: string | null
          erro?: string | null
          id?: string
          mensagem?: string
          mensalidade_id?: string | null
          status?: Database["public"]["Enums"]["status_notificacao"]
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_mensalidade_id_fkey"
            columns: ["mensalidade_id"]
            isOneToOne: false
            referencedRelation: "mensalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          categoria: Database["public"]["Enums"]["categoria_aluno"]
          created_at: string
          descricao: string | null
          dias_personalizado: number | null
          duracao: Database["public"]["Enums"]["duracao_plano"]
          frequencia_semanal: number | null
          id: string
          modalidades: string[]
          nome: string
          tenant_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          categoria?: Database["public"]["Enums"]["categoria_aluno"]
          created_at?: string
          descricao?: string | null
          dias_personalizado?: number | null
          duracao?: Database["public"]["Enums"]["duracao_plano"]
          frequencia_semanal?: number | null
          id?: string
          modalidades?: string[]
          nome: string
          tenant_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          ativo?: boolean
          categoria?: Database["public"]["Enums"]["categoria_aluno"]
          created_at?: string
          descricao?: string | null
          dias_personalizado?: number | null
          duracao?: Database["public"]["Enums"]["duracao_plano"]
          frequencia_semanal?: number | null
          id?: string
          modalidades?: string[]
          nome?: string
          tenant_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "planos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          nome_completo: string
          permissions: Json
          telefone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          nome_completo: string
          permissions?: Json
          telefone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          nome_completo?: string
          permissions?: Json
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          level: string
          message: string
          source: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message: string
          source?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          source?: string | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          ativo: boolean
          cnpj_cpf: string | null
          created_at: string
          endereco: string | null
          id: string
          logo_url: string | null
          nome: string
          responsavel_email: string | null
          responsavel_nome: string | null
          slug: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj_cpf?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          responsavel_email?: string | null
          responsavel_nome?: string | null
          slug: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj_cpf?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          responsavel_email?: string | null
          responsavel_nome?: string | null
          slug?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_logs: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          current_page: string | null
          device_type: string | null
          id: string
          ip_address: string | null
          is_logged_user: boolean
          language: string | null
          operating_system: string | null
          referrer: string | null
          region: string | null
          screen_resolution: string | null
          session_id: string | null
          timezone: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          current_page?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          is_logged_user?: boolean
          language?: string | null
          operating_system?: string | null
          referrer?: string | null
          region?: string | null
          screen_resolution?: string | null
          session_id?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          current_page?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          is_logged_user?: boolean
          language?: string | null
          operating_system?: string | null
          referrer?: string | null
          region?: string | null
          screen_resolution?: string | null
          session_id?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_config: {
        Row: {
          api_token: string | null
          api_url: string | null
          connection_status: string
          created_at: string
          enabled: boolean
          instance_name: string | null
          last_test_at: string | null
          last_test_result: string | null
          provider: string
          sender_number: string | null
          template_3_dias: string
          template_7_dias: string
          template_vencimento: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_token?: string | null
          api_url?: string | null
          connection_status?: string
          created_at?: string
          enabled?: boolean
          instance_name?: string | null
          last_test_at?: string | null
          last_test_result?: string | null
          provider?: string
          sender_number?: string | null
          template_3_dias?: string
          template_7_dias?: string
          template_vencimento?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_token?: string | null
          api_url?: string | null
          connection_status?: string
          created_at?: string
          enabled?: boolean
          instance_name?: string | null
          last_test_at?: string | null
          last_test_result?: string | null
          provider?: string
          sender_number?: string | null
          template_3_dias?: string
          template_7_dias?: string
          template_vencimento?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          connected: boolean
          created_at: string
          id: string
          instance_name: string
          last_connection: string | null
          last_qr_at: string | null
          phone_number: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          connected?: boolean
          created_at?: string
          id?: string
          instance_name: string
          last_connection?: string | null
          last_qr_at?: string | null
          phone_number?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          connected?: boolean
          created_at?: string
          id?: string
          instance_name?: string
          last_connection?: string | null
          last_qr_at?: string | null
          phone_number?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gerar_mensalidades_contrato: {
        Args: { p_contrato_id: string }
        Returns: number
      }
      get_current_tenant: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_professor_adulto: { Args: never; Returns: boolean }
      is_professor_kids: { Args: never; Returns: boolean }
      processar_mensalidades_diario: { Args: never; Returns: Json }
    }
    Enums: {
      app_role:
        | "admin"
        | "professor_kids"
        | "professor_adulto"
        | "recepcao"
        | "financeiro"
      categoria_aluno: "adulto" | "kids"
      dia_semana:
        | "segunda"
        | "terca"
        | "quarta"
        | "quinta"
        | "sexta"
        | "sabado"
        | "domingo"
      duracao_plano:
        | "mensal"
        | "trimestral"
        | "semestral"
        | "anual"
        | "personalizado"
      metodo_pagamento: "pix" | "dinheiro" | "cartao" | "boleto"
      status_aluno: "ativo" | "inativo" | "pendente"
      status_contrato: "ativo" | "pausado" | "cancelado"
      status_mensalidade: "pendente" | "pago" | "vencido" | "cancelado"
      status_notificacao: "agendada" | "enviada" | "falhou" | "cancelada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "professor_kids",
        "professor_adulto",
        "recepcao",
        "financeiro",
      ],
      categoria_aluno: ["adulto", "kids"],
      dia_semana: [
        "segunda",
        "terca",
        "quarta",
        "quinta",
        "sexta",
        "sabado",
        "domingo",
      ],
      duracao_plano: [
        "mensal",
        "trimestral",
        "semestral",
        "anual",
        "personalizado",
      ],
      metodo_pagamento: ["pix", "dinheiro", "cartao", "boleto"],
      status_aluno: ["ativo", "inativo", "pendente"],
      status_contrato: ["ativo", "pausado", "cancelado"],
      status_mensalidade: ["pendente", "pago", "vencido", "cancelado"],
      status_notificacao: ["agendada", "enviada", "falhou", "cancelada"],
    },
  },
} as const
