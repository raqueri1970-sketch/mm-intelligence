# MM Intelligence / ShopPainless — regras do projeto

Projeto **separado** da Esposende. Nada do MM vai para o repositório `portal-esposende-login`, e nada da Esposende vem para cá.
- Código: este repositório (`raqueri1970-sketch/mm-intelligence`).
- Banco: Supabase "Mapa da mima" (`tazyeczbbgspqbyluynf`). O Supabase da Esposende é outro projeto.
- Loja: ShopPainless (dropshipping de saúde/beleza, público hispânico 35–65+, EUA → México → Espanha).

## REGRA GERAL (Ricardo, 24/11/2026) — vale para TUDO
**Tudo que for passado ao Ricardo tem que ser conferido antes.** Número, link, foto, preço, nome de produto, data:
1. Abrir/consultar a fonte na hora e ver se a informação bate.
2. Link só vai se foi aberto e respondeu (não é página de bloqueio/captcha, é o produto certo).
3. Se não deu para conferir, escrever **"não confirmado"** — nunca chutar, nunca inventar.
4. Dizer de quando é o dado (data da base).
5. Regra das 2 fontes para número decisivo (anúncios ativos, tendência, preço): 2 fontes independentes, 1 oficial aberta na hora.

## REGRA DE NICHO (Ricardo, 25/11/2026)
**SEMPRE SÓ SAÚDE E BELEZA. NUNCA ROUPA.** Fora: legging, calça, short, vestido, sutiã, cinta/faja, camiseta, moletom, pijama, meia,
calçado, artigo esportivo (futebol) e roupa de cama. Ficam: joelheira/suporte ortopédico, massageador, creme, sérum, aparelho de beleza,
produto para dor. O minerador bloqueia isso no código (`ROUPA` e `DOMINIO_ROUPA` em `supabase/functions/mm-minerador/index.ts`).

## Minerador
- `supabase/functions/mm-minerador` (ver README da pasta). Ranking em `mm_minerador_ranking`, log em `mm_minerador_runs`.
- pg_cron: 07:20 BRT `mm-minerador-fila`, 07:30 BRT `mm-minerador-diario`. Tarefa "Caça-produto" às 10:00 (usa o PC se ligado; celular + e-mail r-aqueri@hotmail.com).
- PC do Ricardo (Desktop Commander, dispositivo `D-90-001167`): usar às 10:00 para Meta Ad Library, TikTok e AliExpress, **sempre avisando antes**. Se estiver desligado, pular e avisar.
- AliExpress: no PC usar `C:\Temp\mm\ali2.ps1` (Chrome invisível, máx. 45 s por página; cópia em `scripts/pc/`). Muitas páginas seguidas = captcha (marcado `bloqueado`). Da nuvem, o AliExpress devolve captcha.
- Margem: o Ricardo calcula. O minerador entrega produto + similar no AliExpress (link + foto conferidos).
