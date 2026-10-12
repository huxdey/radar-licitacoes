# Radar de Licitações

Ferramenta interna (2 usuários) para encontrar licitações no PNCP, preparar os processos, ler editais com IA e auditar a documentação das empresas atendidas.

## O que já está pronto

| Etapa | Onde fica | O que faz |
| --- | --- | --- |
| 1. Radar | Painel, Radar, Configurações | Busca diária automática no PNCP, classifica pelos 12 segmentos, filtra por UF, modalidade, valor, prazo e ME/EPP, marca novas/vistas/salvas/ignoradas, relatório do dia, inclusão manual por link |
| 2. Empresas e processos | Empresas, Meus Pregões | Cadastro das empresas, "Tenho interesse" cria o processo pregão + empresa, 13 status, filtros por aba e empresa, prazos urgentes no painel |
| 3. Edital e IA | Dentro de cada pregão | Baixa edital e anexos do PNCP (reconfere situação na fonte), ZIP do edital, IA extrai resumo e exigências com cláusula e página, gera a solicitação pronta para WhatsApp |
| 4. Auditoria | Dentro de cada pregão | Upload em lote (aceita ZIP), versões preservadas, IA confere cada exigência, regra dura de validade x data da sessão, itens técnicos e contábeis sempre vão para sua validação, lista de correções para o contador |

Segurança: login com senha + segundo fator (app autenticador) obrigatório, dados fechados por RLS no banco, arquivos em armazenamento privado com links de 5 minutos.

## Estrutura

```
app/                 telas (Painel, Radar, Empresas, Meus Pregões, Configurações) e rotas de API
app/actions.ts       todas as ações do sistema (server actions)
lib/pncp.ts          integração com a API oficial do PNCP
lib/classify.ts      classificação por palavras-chave e sinais de complexidade
lib/radar.ts         motor da busca diária e relatório
lib/docs.ts          leitura de PDF, Word, Excel, imagens e ZIP
lib/ai.ts            prompts e estrutura da análise do edital e da auditoria
lib/processos.ts     download, análise, solicitação, upload e auditoria
supabase/migrations  banco de dados completo (11 tabelas + configurações)
vercel.json          agendamento diário (06h e nova tentativa às 08h, horário de Brasília)
```

## Como colocar no ar (cerca de 30 minutos)

Você vai precisar de 3 contas gratuitas para começar: GitHub, Supabase e Vercel. E uma conta paga por uso na Anthropic (IA).

### 1. Supabase (banco, login e arquivos)

1. Crie um projeto em supabase.com (região São Paulo).
2. Vá em **SQL Editor**, cole todo o conteúdo de `supabase/migrations/001_schema.sql` e clique em Run.
3. Em **Authentication > Sign In / Providers**, desative "Allow new users to sign up" (ninguém de fora cria conta).
4. Em **Authentication > Multi-Factor**, confirme que TOTP está habilitado.
5. Em **Authentication > Users > Add user**, crie você e seu sócio (e-mail e senha).
6. Copie o ID de cada um e rode no SQL Editor:

```sql
insert into public.users (id, nome) values
  ('ID-DO-HUX', 'Hux'),
  ('ID-DO-SOCIO', 'Nome do sócio');
```

7. Em **Project Settings > API**, copie a URL, a `anon key` e a `service_role key`.

### 2. Anthropic (IA)

Crie uma chave em console.anthropic.com e coloque crédito. Cada análise de edital ou auditoria é uma chamada; o custo depende do tamanho dos PDFs.

### 3. Vercel (hospedagem e rotina diária)

1. Suba esta pasta para um repositório privado no GitHub.
2. Em vercel.com, importe o repositório.
3. Em **Environment Variables**, cadastre as variáveis do arquivo `.env.example` com os valores reais.
4. Deploy. A rotina diária já vem configurada no `vercel.json`.

Importante: análise e auditoria podem levar alguns minutos. O plano gratuito da Vercel limita o tempo de execução; se aparecer erro de tempo esgotado, o plano Pro resolve.

### 4. Primeiro uso

1. Entre, escaneie o QR code no Google Authenticator e confirme.
2. **Configurações**: revise UFs (padrão SP), modalidades (padrão pregão eletrônico e dispensa) e clique em **Rodar carga completa**.
3. **Empresas**: cadastre a MRJ Serviços marcando os segmentos dela.
4. **Radar**: abra uma oportunidade, escolha a empresa, **Iniciar processo**.
5. No processo: **Baixar documentação**, **Analisar edital com IA**, copie a solicitação para o contador, depois envie os documentos e **Auditar**.

## Rodando no seu computador (opcional)

```bash
cp .env.example .env.local   # preencha os valores
npm install
npm run dev                  # abre em http://localhost:3000
npm run radar                # roda a busca pelo terminal
npm run radar -- completo    # carga completa
```

## Checklist de aceitação

- [ ] Configurar os 12 segmentos de busca
- [ ] Executar uma busca automática e gerar relatório diário
- [ ] Marcar uma oportunidade como interessante
- [ ] Vincular o pregão à MRJ Serviços
- [ ] Baixar edital e anexos públicos disponíveis
- [ ] Gerar resumo e checklist com referências ao edital
- [ ] Exportar solicitação de documentos para o contador
- [ ] Importar os arquivos recebidos por e-mail ou pasta
- [ ] Identificar documentos faltantes e divergentes
- [ ] Gerar relatório preliminar de auditoria
- [ ] Registrar aprovação e envio manual ao portal oficial
- [ ] Atualizar status até o resultado do pregão

## Limites conhecidos

- O PNCP é a única fonte automática. Editais publicados só no portal do órgão entram pela inclusão manual.
- O indício de ME/EPP vem do texto do objeto; a confirmação é na análise do edital.
- A IA lê até 20 arquivos e cerca de 18 MB por análise. O que ficar de fora aparece listado em vermelho, nunca é ignorado em silêncio.
- "Pronto para revisão final" não é garantia de habilitação. A decisão final é sempre de vocês.
