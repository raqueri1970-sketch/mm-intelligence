# mm-minerador — Minerador ShopPainless (v1.3, custo zero)

Roda todo dia em 2 etapas pelo pg_cron: 07:20 (Brasília) `mm-minerador-fila` (`{"acao":"fila"}`) pede as páginas das lojas
ao pg_net; 07:30 `mm-minerador-diario` (ranking) lê as respostas. São 2 chamadas porque a própria chamada da função
ocupa o lote do pg_net enquanto roda. O ranking e grava o ranking em
`public.mm_minerador_ranking` (log em `public.mm_minerador_runs`).

## Como decide
1. Pega os até 150 melhores de `mm_meta_vencedores` da última data (anúncios reais da Meta coletados pelo MM).
2. Descarta o que não é produto de loja: WhatsApp/redes/marketplaces, serviços, cursos, suplementos.
3. **Abre a loja na hora** (`/products/<handle>.js` ou `/products.json` da Shopify) e acha o produto do anúncio:
   preço real, disponibilidade, link verificado. As páginas são baixadas **pelo banco (pg_net)**, porque a Shopify
   bloqueia com HTTP 429 o IP compartilhado das Edge Functions. `public.mm_minerador_slim()` reduz o JSON no banco.
4. Cruza com Google Trends (coletor do GitHub Actions) quando o termo bate.
5. Nota 0–100 e confiança:
   - **ALTA**: produto achado na loja, disponível, preço US$15–100, anúncio ≥30 dias, ≥3 anúncios, base Meta ≤7 dias.
   - **MÉDIA**: produto achado na loja, disponível, preço na faixa, anúncio ≥14 dias.
   - **BAIXA**: o resto (não aprovado). O motivo fica em `motivos`.
6. Custo do fornecedor ainda `não confirmado` (entra na v2 com a API grátis da CJ).

## Rodar na mão
```sql
select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='mm_project_url')||'/functions/v1/mm-minerador',
  headers:=jsonb_build_object('Content-Type','application/json','x-mm-cron',(select decrypted_secret from vault.decrypted_secrets where name='mm_cron_secret')),
  body:='{"acao":"fila"}'::jsonb   -- e 5 min depois de novo com body '{}' (ranking), timeout_milliseconds:=150000);
```
